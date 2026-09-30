package com.orenjitrade.api.delisting.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.delisting.infra.DelistPolicyRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The delisting module's service interface for the freshness policy (ADR 0014): the active {@code
 * delist_policy} row, cached in Redis for {@link #CACHE_TTL} and evicted after every admin write,
 * plus the audited admin edits ({@code GET/PUT /admin/delist-policies}, Phase 7 contract).
 */
@Service
public class DelistPolicyService {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE = "delist_policy.update";
    public static final String TARGET_DELIST_POLICY = "DELIST_POLICY";

    static final String CACHE_KEY = "delist-policy:v2";

    private final DelistPolicyRepository repository;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public DelistPolicyService(
            DelistPolicyRepository repository,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    /**
     * The active policy.
     *
     * @throws IllegalStateException when no row is active (the V020 migration seeds one)
     */
    public FreshnessPolicy active() {
        return cache.get(
                CACHE_KEY,
                FreshnessPolicy.class,
                CACHE_TTL,
                () ->
                        repository
                                .findActive()
                                .orElseThrow(
                                        () ->
                                                new IllegalStateException(
                                                        "No active delist_policy row")));
    }

    /** Every policy (admin view), active first. */
    @Transactional(readOnly = true)
    public List<DelistPolicyView> all() {
        return repository.findAll();
    }

    /**
     * Changes a policy's thresholds ({@code 404} for unknown ids, {@code 400} unless {@code 1 <=
     * aging < stale < hidden <= 3650}, {@code 0 <= warn < hidden}, {@code 1 <= maxStrikes <= 100}
     * and {@code 1 <= unansweredAfterHours <= 720}). Audited with the previous and new values; the
     * cache is evicted after commit. The next freshness job run applies the new thresholds.
     */
    @Transactional
    public DelistPolicyView update(AuthenticatedUser actor, UUID id, PolicyChange change) {
        List<ProblemFieldError> errors = validate(change);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        DelistPolicyView current =
                repository
                        .findByIdForUpdate(id)
                        .orElseThrow(() -> ApiException.notFound("Delist policy not found"));
        Instant now = timeProvider.now();
        FreshnessPolicy previous = current.policy();
        FreshnessPolicy updated =
                new FreshnessPolicy(
                        id,
                        change.name() != null && !change.name().isBlank()
                                ? change.name().trim()
                                : previous.name(),
                        change.agingAfterDays(),
                        change.staleAfterDays(),
                        change.hiddenAfterDays(),
                        change.warnBeforeHiddenDays(),
                        change.maxStrikes() != null ? change.maxStrikes() : previous.maxStrikes(),
                        actor.userId(),
                        now,
                        change.unansweredAfterHours() != null
                                ? change.unansweredAfterHours()
                                : previous.unansweredAfterHours());
        repository.update(updated, actor.userId(), now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("previous", thresholds(previous));
        details.put("updated", thresholds(updated));
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_UPDATE,
                TARGET_DELIST_POLICY,
                id.toString(),
                details);
        evictAfterCommit();
        return new DelistPolicyView(updated, current.active());
    }

    /** Drops the cached policy (admin writes, tests). */
    public void invalidate() {
        cache.evict(CACHE_KEY);
    }

    static List<ProblemFieldError> validate(PolicyChange change) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (change.agingAfterDays() < 1) {
            errors.add(new ProblemFieldError("agingAfterDays", "must be at least 1"));
        }
        if (change.staleAfterDays() <= change.agingAfterDays()) {
            errors.add(
                    new ProblemFieldError("staleAfterDays", "must be greater than agingAfterDays"));
        }
        if (change.hiddenAfterDays() <= change.staleAfterDays()) {
            errors.add(
                    new ProblemFieldError(
                            "hiddenAfterDays", "must be greater than staleAfterDays"));
        }
        if (change.hiddenAfterDays() > 3650) {
            errors.add(new ProblemFieldError("hiddenAfterDays", "must be at most 3650"));
        }
        if (change.warnBeforeHiddenDays() < 0
                || change.warnBeforeHiddenDays() >= change.hiddenAfterDays()) {
            errors.add(
                    new ProblemFieldError(
                            "warnBeforeHiddenDays", "must be between 0 and hiddenAfterDays - 1"));
        }
        if (change.maxStrikes() != null && (change.maxStrikes() < 1 || change.maxStrikes() > 100)) {
            errors.add(new ProblemFieldError("maxStrikes", "must be between 1 and 100"));
        }
        if (change.unansweredAfterHours() != null
                && (change.unansweredAfterHours() < 1 || change.unansweredAfterHours() > 720)) {
            errors.add(new ProblemFieldError("unansweredAfterHours", "must be between 1 and 720"));
        }
        if (change.name() != null && change.name().trim().length() > 80) {
            errors.add(new ProblemFieldError("name", "must be at most 80 characters"));
        }
        return errors;
    }

    private static Map<String, Object> thresholds(FreshnessPolicy policy) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("agingAfterDays", policy.agingAfterDays());
        values.put("staleAfterDays", policy.staleAfterDays());
        values.put("hiddenAfterDays", policy.hiddenAfterDays());
        values.put("warnBeforeHiddenDays", policy.warnBeforeHiddenDays());
        values.put("maxStrikes", policy.maxStrikes());
        values.put("unansweredAfterHours", policy.unansweredAfterHours());
        return values;
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
     * New thresholds of a policy.
     *
     * @param name new display name; unchanged when blank
     * @param agingAfterDays first day of AGING
     * @param staleAfterDays first day of STALE
     * @param hiddenAfterDays first day of HIDDEN
     * @param warnBeforeHiddenDays warning lead time
     * @param maxStrikes strikes before listings are paused; unchanged when null
     * @param unansweredAfterHours hours before a waiting conversation counts as unanswered;
     *     unchanged when null
     */
    public record PolicyChange(
            @Nullable String name,
            int agingAfterDays,
            int staleAfterDays,
            int hiddenAfterDays,
            int warnBeforeHiddenDays,
            @Nullable Integer maxStrikes,
            @Nullable Integer unansweredAfterHours) {

        /** A change keeping the unanswered window. */
        public PolicyChange(
                @Nullable String name,
                int agingAfterDays,
                int staleAfterDays,
                int hiddenAfterDays,
                int warnBeforeHiddenDays,
                @Nullable Integer maxStrikes) {
            this(
                    name,
                    agingAfterDays,
                    staleAfterDays,
                    hiddenAfterDays,
                    warnBeforeHiddenDays,
                    maxStrikes,
                    null);
        }
    }
}
