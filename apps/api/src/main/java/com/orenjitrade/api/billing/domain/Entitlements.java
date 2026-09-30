package com.orenjitrade.api.billing.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.infra.EntitlementRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Per-user overrides of plan features and limits ({@code Entitlements.has(userId, featureKey)}).
 * Explicit overrides beat plan values; when several active entitlements target the same key, the
 * most generous wins (a feature is on when any says so; unlimited beats any number, then the
 * highest number). Active entitlements of a user are cached in Redis for {@link #CACHE_TTL} and
 * evicted on grant and revoke; expiry is re-checked on every read.
 */
@Service
public class Entitlements {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_GRANT = "entitlement.grant";
    public static final String ACTION_REVOKE = "entitlement.revoke";
    public static final String UNLIMITED = "unlimited";

    static final String CACHE_PREFIX = "entitlements:v1:";

    private static final Logger log = LoggerFactory.getLogger(Entitlements.class);

    private final EntitlementRepository repository;
    private final RedisJsonCache cache;
    private final PlanService planService;
    private final UserAccountService userAccountService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    public Entitlements(
            EntitlementRepository repository,
            RedisJsonCache cache,
            PlanService planService,
            UserAccountService userAccountService,
            AuditService auditService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.planService = planService;
        this.userAccountService = userAccountService;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Evaluation
    // ---------------------------------------------------------------------------------------

    /**
     * Whether {@code userId} has {@code featureKey}: an active entitlement for the key decides,
     * otherwise the feature switch of the user's plan. Unknown keys are {@code false}.
     */
    public boolean has(UUID userId, String featureKey) {
        Optional<Boolean> override = featureOverride(active(userId), featureKey);
        if (override.isPresent()) {
            return override.get();
        }
        return planService
                .planOf(userId)
                .feature(featureKey)
                .map(PlanFeatureRule::enabled)
                .orElse(false);
    }

    /** Every known feature key with its effective value for {@code userId}. */
    public Map<String, Boolean> features(UUID userId) {
        List<EntitlementView> active = active(userId);
        PlanRules plan = planService.planOf(userId);
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (String key : planService.featureKeys()) {
            result.put(
                    key,
                    featureOverride(active, key)
                            .orElseGet(
                                    () ->
                                            plan.feature(key)
                                                    .map(PlanFeatureRule::enabled)
                                                    .orElse(false)));
        }
        return result;
    }

    /** Active (not revoked, not expired) entitlements of {@code userId}, newest first. */
    public List<EntitlementView> active(UUID userId) {
        Instant now = timeProvider.now();
        return cache
                .get(
                        CACHE_PREFIX + userId,
                        EntitlementSnapshot.class,
                        CACHE_TTL,
                        () -> new EntitlementSnapshot(repository.findActive(userId, now)))
                .entitlements()
                .stream()
                .filter(entitlement -> entitlement.activeAt(now))
                .toList();
    }

    /**
     * The limit override of {@code limitKey} for {@code userId}, if any active entitlement targets
     * it. The optional's value is the new maximum, {@code null} for unlimited.
     */
    public Optional<LimitOverride> limitOverride(UUID userId, String limitKey) {
        return limitOverride(active(userId), limitKey);
    }

    static Optional<LimitOverride> limitOverride(List<EntitlementView> active, String limitKey) {
        Optional<LimitOverride> best = Optional.empty();
        for (EntitlementView entitlement : active) {
            if (!entitlement.featureKey().equals(limitKey)) {
                continue;
            }
            Optional<LimitOverride> parsed = parseLimit(entitlement);
            if (parsed.isEmpty()) {
                continue;
            }
            if (parsed.get().maxValue() == null) {
                return parsed;
            }
            if (best.isEmpty() || best.get().maxValue() < parsed.get().maxValue()) {
                best = parsed;
            }
        }
        return best;
    }

    static Optional<Boolean> featureOverride(List<EntitlementView> active, String featureKey) {
        Optional<Boolean> result = Optional.empty();
        for (EntitlementView entitlement : active) {
            if (!entitlement.featureKey().equals(featureKey)) {
                continue;
            }
            boolean value =
                    entitlement.value() == null
                            || !"false".equals(entitlement.value().toLowerCase(Locale.ROOT));
            if (value) {
                return Optional.of(true);
            }
            result = Optional.of(false);
        }
        return result;
    }

    private static Optional<LimitOverride> parseLimit(EntitlementView entitlement) {
        @Nullable String value = entitlement.value();
        if (value == null || UNLIMITED.equalsIgnoreCase(value.trim())) {
            return Optional.of(new LimitOverride(null));
        }
        try {
            int max = Integer.parseInt(value.trim());
            return max >= 0 ? Optional.of(new LimitOverride(max)) : Optional.empty();
        } catch (NumberFormatException e) {
            log.warn("Ignoring entitlement {} with a non-numeric limit value", entitlement.id());
            return Optional.empty();
        }
    }

    // ---------------------------------------------------------------------------------------
    // Administration (ADMIN, SUPER_ADMIN; audited)
    // ---------------------------------------------------------------------------------------

    /** Entitlement history of an account (404 for unknown accounts), newest first. */
    @Transactional(readOnly = true)
    public List<EntitlementView> history(UUID userId) {
        requireAccount(userId);
        return repository.findAll(userId);
    }

    /**
     * Grants an entitlement ({@code ADMIN_GRANT}). The key must be a known limit or feature key;
     * limit values are a non-negative integer or {@code unlimited}/{@code null}; feature values
     * {@code true}/{@code false}/{@code null}; {@code expiresAt} must be in the future.
     */
    @Transactional
    public EntitlementView grant(
            AuthenticatedUser actor,
            UUID userId,
            String featureKey,
            @Nullable String value,
            @Nullable Instant expiresAt,
            @Nullable String note) {
        requireAccount(userId);
        Instant now = timeProvider.now();
        String key = featureKey.trim();
        @Nullable String normalisedValue = normaliseValue(key, value);
        if (expiresAt != null && !expiresAt.isAfter(now)) {
            throw invalid("expiresAt", "must be in the future");
        }
        @Nullable String cleanNote = note == null || note.isBlank() ? null : note.trim();
        EntitlementView created =
                repository.insert(
                        userId,
                        key,
                        normalisedValue,
                        EntitlementSource.ADMIN_GRANT,
                        expiresAt,
                        actor.userId(),
                        cleanNote,
                        now);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("entitlementId", created.id().toString());
        details.put("featureKey", key);
        details.put("value", normalisedValue == null ? "default" : normalisedValue);
        if (expiresAt != null) {
            details.put("expiresAt", expiresAt.toString());
        }
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_GRANT,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        evictAfterCommit(userId);
        return created;
    }

    /** Revokes an active entitlement of {@code userId} (404 when unknown or already inactive). */
    @Transactional
    public void revoke(AuthenticatedUser actor, UUID userId, UUID entitlementId) {
        requireAccount(userId);
        EntitlementView entitlement =
                repository
                        .findForUpdate(entitlementId, userId)
                        .filter(found -> found.activeAt(timeProvider.now()))
                        .orElseThrow(() -> ApiException.notFound("Entitlement not found"));
        repository.revoke(entitlementId, actor.userId(), timeProvider.now());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("entitlementId", entitlementId.toString());
        details.put("featureKey", entitlement.featureKey());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_REVOKE,
                AuditService.TARGET_USER,
                userId.toString(),
                details);
        evictAfterCommit(userId);
    }

    /** Drops the cached entitlements of {@code userId}. */
    public void invalidate(UUID userId) {
        cache.evict(CACHE_PREFIX + userId);
    }

    // ---------------------------------------------------------------------------------------
    // Grants by other modules (credit spends, Phase 10)
    // ---------------------------------------------------------------------------------------

    /**
     * Validates and normalises an override value for {@code featureKey} the way admin grants do
     * (limits: a non-negative integer or {@code unlimited}; features: {@code true}/{@code false}).
     *
     * @throws ApiException 400 for unknown keys or values
     */
    public @Nullable String normaliseOverride(String featureKey, @Nullable String value) {
        return normaliseValue(featureKey.trim(), value);
    }

    /**
     * Grants a time-boxed entitlement on behalf of the platform (no admin actor, not audited here:
     * the calling module keeps the record, e.g. the credit ledger). Joins the caller's transaction;
     * the cache is evicted after commit.
     */
    @Transactional
    public EntitlementView grantBySystem(
            UUID userId,
            String featureKey,
            @Nullable String value,
            EntitlementSource source,
            Instant expiresAt,
            @Nullable String note) {
        requireAccount(userId);
        String key = featureKey.trim();
        EntitlementView created =
                repository.insert(
                        userId,
                        key,
                        normaliseValue(key, value),
                        source,
                        expiresAt,
                        null,
                        note,
                        timeProvider.now());
        evictAfterCommit(userId);
        return created;
    }

    /**
     * The latest expiry among the active entitlements of {@code userId} for {@code featureKey} from
     * {@code source} (credit purchases stack after each other), empty when none is active.
     */
    @Transactional(readOnly = true)
    public Optional<Instant> latestActiveExpiry(
            UUID userId, String featureKey, EntitlementSource source) {
        Instant now = timeProvider.now();
        return repository.findActive(userId, now).stream()
                .filter(entitlement -> entitlement.featureKey().equals(featureKey))
                .filter(entitlement -> entitlement.source() == source)
                .map(EntitlementView::expiresAt)
                .filter(java.util.Objects::nonNull)
                .max(Instant::compareTo);
    }

    private @Nullable String normaliseValue(String key, @Nullable String value) {
        @Nullable String trimmed = value == null || value.isBlank() ? null : value.trim();
        if (planService.limitKeys().contains(key)) {
            if (trimmed == null || UNLIMITED.equalsIgnoreCase(trimmed)) {
                return UNLIMITED;
            }
            try {
                int max = Integer.parseInt(trimmed);
                if (max < 0) {
                    throw invalid("value", "must be a non-negative integer or 'unlimited'");
                }
                return Integer.toString(max);
            } catch (NumberFormatException e) {
                throw invalid("value", "must be a non-negative integer or 'unlimited'");
            }
        }
        if (planService.featureKeys().contains(key)) {
            if (trimmed == null) {
                return "true";
            }
            String lower = trimmed.toLowerCase(Locale.ROOT);
            if (!lower.equals("true") && !lower.equals("false")) {
                throw invalid("value", "must be true or false for a feature");
            }
            return lower;
        }
        throw invalid("featureKey", "unknown limit or feature key");
    }

    private void requireAccount(UUID userId) {
        if (userAccountService.findPlanCode(userId).isEmpty()) {
            throw ApiException.notFound("Account not found");
        }
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    private void evictAfterCommit(UUID userId) {
        invalidate(userId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            invalidate(userId);
                        }
                    });
        }
    }

    /**
     * A limit override.
     *
     * @param maxValue the overriding maximum, {@code null} = unlimited
     */
    public record LimitOverride(@Nullable Integer maxValue) {}

    /** Cache envelope. */
    public record EntitlementSnapshot(List<EntitlementView> entitlements) {}
}
