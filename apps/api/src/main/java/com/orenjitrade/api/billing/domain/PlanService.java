package com.orenjitrade.api.billing.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.infra.PlanRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Plans, plan features and usage limits (ADR 0014): cached reads for {@link Limits} and {@link
 * Entitlements}, public plan listing and the audited admin edits ({@code SUPER_ADMIN}). The whole
 * rule set is cached in Redis for {@link #CACHE_TTL} and evicted after every write.
 */
@Service
public class PlanService {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_PLAN_UPDATE = "plan.update";
    public static final String ACTION_LIMIT_UPDATE = "usage_limit.update";
    public static final String TARGET_PLAN = "PLAN";
    public static final String TARGET_USAGE_LIMIT = "USAGE_LIMIT";

    static final String CACHE_KEY = "plans:v1";

    private final PlanRepository repository;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final UserAccountService userAccountService;
    private final TimeProvider timeProvider;

    public PlanService(
            PlanRepository repository,
            RedisJsonCache cache,
            AuditService auditService,
            UserAccountService userAccountService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.auditService = auditService;
        this.userAccountService = userAccountService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** Every plan (active or not) with features and limits, by sort order. */
    public List<PlanRules> all() {
        return cache.get(
                        CACHE_KEY,
                        RulesSnapshot.class,
                        CACHE_TTL,
                        () -> new RulesSnapshot(repository.findAll()))
                .plans();
    }

    /** Active plans, by sort order (public listing). */
    public List<PlanRules> active() {
        return all().stream().filter(PlanRules::active).toList();
    }

    public Optional<PlanRules> find(String code) {
        return all().stream().filter(plan -> plan.code().equals(code)).findFirst();
    }

    /**
     * The plan whose rules apply to {@code userId}: {@code user_account.plan_code} when that plan
     * exists and is active, otherwise {@code FREE}.
     */
    public PlanRules planOf(UUID userId) {
        String code = userAccountService.findPlanCode(userId).orElse(PlanCodes.FREE);
        return find(code).filter(PlanRules::active).orElseGet(this::freePlan);
    }

    /** Every limit key defined by at least one plan. */
    public Set<String> limitKeys() {
        Set<String> keys = new LinkedHashSet<>();
        all().forEach(plan -> plan.limits().forEach(limit -> keys.add(limit.key())));
        return keys;
    }

    /** Every feature key defined by at least one plan. */
    public Set<String> featureKeys() {
        Set<String> keys = new LinkedHashSet<>();
        all().forEach(plan -> plan.features().forEach(feature -> keys.add(feature.key())));
        return keys;
    }

    /** The first rule defining {@code key} in any plan (kind and window of unknown-plan keys). */
    public Optional<UsageLimitRule> anyLimit(String key) {
        return all().stream().flatMap(plan -> plan.limit(key).stream()).findFirst();
    }

    private PlanRules freePlan() {
        return find(PlanCodes.FREE)
                .orElseThrow(() -> new IllegalStateException("The FREE plan is missing"));
    }

    // ---------------------------------------------------------------------------------------
    // Administration (SUPER_ADMIN, audited)
    // ---------------------------------------------------------------------------------------

    /** Replaces the editable attributes of a plan and upserts the given features. */
    @Transactional
    public PlanRules updatePlan(AuthenticatedUser actor, String code, PlanUpdate update) {
        requireSuperAdmin(actor);
        UUID planId =
                repository
                        .lockPlan(code)
                        .orElseThrow(() -> ApiException.notFound("Plan not found"));
        if (PlanCodes.FREE.equals(code) && !update.active()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("active", "the FREE plan cannot be disabled")));
        }
        PlanRules before = find(code).orElse(null);
        Instant now = timeProvider.now();
        repository.updatePlan(
                planId,
                update.name().trim(),
                update.description() == null ? "" : update.description().trim(),
                update.monthlyPrice(),
                update.currency(),
                update.active(),
                update.sortOrder(),
                actor.userId(),
                now);
        for (PlanFeatureRule feature : update.features()) {
            repository.upsertFeature(
                    planId, feature.key(), feature.enabled(), feature.value(), actor.userId(), now);
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("code", code);
        if (before != null) {
            details.put("previousActive", before.active());
            details.put("previousMonthlyPrice", before.monthlyPrice());
        }
        details.put("active", update.active());
        details.put("monthlyPrice", update.monthlyPrice());
        details.put(
                "features",
                update.features().stream().map(f -> f.key() + "=" + f.enabled()).toList());
        auditService.record(
                ActorType.ADMIN, actor.userId(), ACTION_PLAN_UPDATE, TARGET_PLAN, code, details);
        evictAfterCommit();
        return reload(code);
    }

    /** Changes one usage limit (value, window of counters, description). */
    @Transactional
    public PlanRepository.LockedLimit updateLimit(
            AuthenticatedUser actor,
            UUID limitId,
            @Nullable Integer maxValue,
            @Nullable LimitWindow window,
            @Nullable String description) {
        requireSuperAdmin(actor);
        PlanRepository.LockedLimit locked =
                repository
                        .lockLimit(limitId)
                        .orElseThrow(() -> ApiException.notFound("Usage limit not found"));
        UsageLimitRule current = locked.limit();
        LimitWindow newWindow = window != null ? window : current.window();
        if (current.kind() == LimitKind.CAP && newWindow != LimitWindow.TOTAL) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("window", "cap limits always use TOTAL")));
        }
        String newDescription = description != null ? description.trim() : current.description();
        Instant now = timeProvider.now();
        repository.updateLimit(limitId, newWindow, maxValue, newDescription, actor.userId(), now);

        Map<String, Object> details = new LinkedHashMap<>();
        details.put("plan", locked.planCode());
        details.put("limitKey", current.key());
        details.put(
                "previousMaxValue", current.maxValue() == null ? "unlimited" : current.maxValue());
        details.put("maxValue", maxValue == null ? "unlimited" : maxValue);
        details.put("previousWindow", current.window().name());
        details.put("window", newWindow.name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_LIMIT_UPDATE,
                TARGET_USAGE_LIMIT,
                limitId.toString(),
                details);
        evictAfterCommit();
        return new PlanRepository.LockedLimit(
                locked.planCode(),
                new UsageLimitRule(
                        limitId,
                        current.key(),
                        current.kind(),
                        newWindow,
                        maxValue,
                        newDescription,
                        actor.userId(),
                        now));
    }

    /** Drops the cached rules (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    private PlanRules reload(String code) {
        return repository.findAll().stream()
                .filter(plan -> plan.code().equals(code))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("Plan not found"));
    }

    private static void requireSuperAdmin(AuthenticatedUser actor) {
        if (!actor.hasRole(Role.SUPER_ADMIN)) {
            throw ApiException.forbidden("Only a SUPER_ADMIN can change plans and limits");
        }
    }

    private void evictAfterCommit() {
        invalidate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            invalidate();
                        }
                    });
        }
    }

    /**
     * Editable attributes of a plan.
     *
     * @param name display name
     * @param description marketing text
     * @param monthlyPrice display price
     * @param currency ISO 4217 code
     * @param active whether the plan is offered (FREE always stays active)
     * @param sortOrder display order
     * @param features features to upsert (others are kept)
     */
    public record PlanUpdate(
            String name,
            @Nullable String description,
            BigDecimal monthlyPrice,
            String currency,
            boolean active,
            int sortOrder,
            List<PlanFeatureRule> features) {}

    /** Cache envelope. */
    public record RulesSnapshot(List<PlanRules> plans) {}
}
