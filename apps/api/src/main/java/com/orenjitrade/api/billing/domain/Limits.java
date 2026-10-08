package com.orenjitrade.api.billing.domain;

import com.orenjitrade.api.billing.infra.UsageCounterRepository;
import com.orenjitrade.api.common.TimeProvider;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Freemium limits ({@code Limits.check(userId, key)}, ADR 0014, Phase 10 contract "Plans and
 * limits"). The effective limit is the value of the user's plan ({@code user_account.plan_code},
 * FREE when unknown or inactive) unless an active entitlement overrides it. Numbers are data
 * ({@code usage_limit}); this class contains none.
 *
 * <p>Counters: {@link #consume} increments {@code usage_counter} with an atomic conditional upsert
 * (the database is the source of truth and never lets a counter pass its limit under concurrency)
 * and mirrors the new value in Redis after commit; {@link #check} reads the Redis mirror first
 * (fast path) and falls back to the database. TOTAL counters owned by another module are read
 * through a {@link LimitUsageSource}. Callers turn a refused decision into {@link
 * LimitReachedException} ({@code consume} throws it itself).
 */
@Service
public class Limits {

    static final String USAGE_KEY_PREFIX = "orenji:usage:";

    /** Upper bound of a Redis mirror's life (bounds staleness if a database write rolled back). */
    static final Duration MIRROR_MAX_TTL = Duration.ofMinutes(10);

    private static final Logger log = LoggerFactory.getLogger(Limits.class);

    private final PlanService planService;
    private final Entitlements entitlements;
    private final UsageCounterRepository counters;
    private final StringRedisTemplate redis;
    private final TimeProvider timeProvider;
    private final List<LimitUsageSource> usageSources;

    public Limits(
            PlanService planService,
            Entitlements entitlements,
            UsageCounterRepository counters,
            StringRedisTemplate redis,
            TimeProvider timeProvider,
            List<LimitUsageSource> usageSources) {
        this.planService = planService;
        this.entitlements = entitlements;
        this.counters = counters;
        this.redis = redis;
        this.timeProvider = timeProvider;
        this.usageSources = List.copyOf(usageSources);
    }

    /**
     * Whether {@code userId} may perform one more {@code limitKey} action now (no consumption). For
     * caps the decision is always allowed and carries the effective maximum.
     *
     * @throws IllegalArgumentException when no plan defines {@code limitKey}
     */
    public LimitDecision check(UUID userId, String limitKey) {
        Resolved resolved = resolve(userId, limitKey);
        Instant now = timeProvider.now();
        if (resolved.kind() == LimitKind.CAP) {
            return decision(resolved, true, null, now);
        }
        long used = usage(userId, resolved, now);
        return decision(resolved, resolved.max() == null || used < resolved.max(), used, now);
    }

    /**
     * Consumes one unit of a counter limit.
     *
     * @return the decision after consumption ({@code used} includes this action)
     * @throws LimitReachedException when the limit is already reached (nothing is consumed)
     * @throws IllegalArgumentException for cap limits (use {@link #checkValue}) and unknown keys
     */
    public LimitDecision consume(UUID userId, String limitKey) {
        Resolved resolved = resolve(userId, limitKey);
        if (resolved.kind() == LimitKind.CAP) {
            throw new IllegalArgumentException(limitKey + " is a cap; use checkValue");
        }
        Instant now = timeProvider.now();
        Optional<LimitUsageSource> source = sourceFor(limitKey);
        if (source.isPresent()) {
            long used = source.get().currentUsage(userId, limitKey);
            boolean allowed = resolved.max() == null || used < resolved.max();
            LimitDecision decision = decision(resolved, allowed, used, now);
            if (!allowed) {
                throw new LimitReachedException(decision);
            }
            return decision;
        }
        Instant windowStart = resolved.window().start(now);
        OptionalLong count =
                counters.incrementIfBelow(userId, limitKey, windowStart, resolved.max(), now);
        if (count.isEmpty()) {
            long used = counters.count(userId, limitKey, windowStart);
            mirror(userId, resolved, windowStart, used, now);
            throw new LimitReachedException(decision(resolved, false, used, now));
        }
        mirror(userId, resolved, windowStart, count.getAsLong(), now);
        return decision(resolved, true, count.getAsLong(), now);
    }

    /**
     * Checks a requested value against a cap (a {@code CAP} usage limit; none is seeded since the
     * map radius was removed, ADR 0017); {@code used} of the decision is the requested value.
     * Callers throw {@link LimitReachedException} when it is not allowed.
     */
    public LimitDecision checkValue(UUID userId, String limitKey, long requested) {
        Resolved resolved = resolve(userId, limitKey);
        boolean allowed = resolved.max() == null || requested <= resolved.max();
        return decision(resolved, allowed, requested, timeProvider.now());
    }

    /**
     * {@link #checkValue} for a signed-out caller: the FREE plan's rule applies (no entitlements),
     * e.g. a cap on an anonymous request.
     */
    public LimitDecision checkValueForAnonymous(String limitKey, long requested) {
        PlanRules free =
                planService
                        .find(PlanCodes.FREE)
                        .orElseThrow(() -> new IllegalStateException("The FREE plan is missing"));
        UsageLimitRule rule =
                free.limit(limitKey)
                        .or(
                                () ->
                                        planService
                                                .anyLimit(limitKey)
                                                .map(
                                                        other ->
                                                                new UsageLimitRule(
                                                                        other.id(),
                                                                        other.key(),
                                                                        other.kind(),
                                                                        other.window(),
                                                                        null,
                                                                        other.description(),
                                                                        null,
                                                                        other.updatedAt())))
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "Unknown limit key " + limitKey));
        Resolved resolved = resolve(free, rule, List.of());
        boolean allowed = resolved.max() == null || requested <= resolved.max();
        return decision(resolved, allowed, requested, timeProvider.now());
    }

    /** The status of every limit of the user's plan (for {@code GET /me/plan}), by key. */
    public List<LimitDecision> overview(UUID userId) {
        PlanRules plan = planService.planOf(userId);
        List<EntitlementView> active = entitlements.active(userId);
        Instant now = timeProvider.now();
        List<LimitDecision> result = new ArrayList<>();
        for (UsageLimitRule rule : plan.limits()) {
            Resolved resolved = resolve(plan, rule, active);
            if (resolved.kind() == LimitKind.CAP) {
                result.add(decision(resolved, true, null, now));
            } else {
                long used = usage(userId, resolved, now);
                result.add(
                        decision(
                                resolved,
                                resolved.max() == null || used < resolved.max(),
                                used,
                                now));
            }
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Resolution
    // ---------------------------------------------------------------------------------------

    private Resolved resolve(UUID userId, String limitKey) {
        PlanRules plan = planService.planOf(userId);
        Optional<UsageLimitRule> rule = plan.limit(limitKey);
        if (rule.isEmpty()) {
            // Defined for another plan only: unlimited for this one (with that rule's shape).
            UsageLimitRule other =
                    planService
                            .anyLimit(limitKey)
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "Unknown limit key " + limitKey));
            log.warn("Plan {} does not define {}; treating it as unlimited", plan.code(), limitKey);
            rule =
                    Optional.of(
                            new UsageLimitRule(
                                    other.id(),
                                    other.key(),
                                    other.kind(),
                                    other.window(),
                                    null,
                                    other.description(),
                                    null,
                                    other.updatedAt()));
        }
        return resolve(plan, rule.get(), entitlements.active(userId));
    }

    private static Resolved resolve(
            PlanRules plan, UsageLimitRule rule, List<EntitlementView> active) {
        Optional<Entitlements.LimitOverride> override =
                Entitlements.limitOverride(active, rule.key());
        return new Resolved(
                plan.code(),
                rule.key(),
                rule.kind(),
                rule.window(),
                override.isPresent() ? override.get().maxValue() : rule.maxValue(),
                override.isPresent());
    }

    private Optional<LimitUsageSource> sourceFor(String limitKey) {
        return usageSources.stream().filter(source -> source.supports(limitKey)).findFirst();
    }

    private static LimitDecision decision(
            Resolved resolved, boolean allowed, @Nullable Long used, Instant now) {
        @Nullable Long remaining =
                resolved.max() == null || used == null || resolved.kind() == LimitKind.CAP
                        ? null
                        : Math.max(0L, resolved.max() - used);
        return new LimitDecision(
                resolved.key(),
                allowed,
                resolved.kind(),
                resolved.window(),
                resolved.max(),
                used,
                remaining,
                resolved.kind() == LimitKind.CAP ? null : resolved.window().resetsAt(now),
                resolved.planCode(),
                resolved.overridden(),
                PlanCodes.UPGRADE_URL);
    }

    // ---------------------------------------------------------------------------------------
    // Usage (Redis mirror + database)
    // ---------------------------------------------------------------------------------------

    private long usage(UUID userId, Resolved resolved, Instant now) {
        Optional<LimitUsageSource> source = sourceFor(resolved.key());
        if (source.isPresent()) {
            return source.get().currentUsage(userId, resolved.key());
        }
        Instant windowStart = resolved.window().start(now);
        String redisKey = usageKey(userId, resolved.key(), windowStart);
        try {
            @Nullable String cached = redis.opsForValue().get(redisKey);
            if (cached != null) {
                return Long.parseLong(cached);
            }
        } catch (DataAccessException | NumberFormatException e) {
            log.warn("Usage mirror unavailable for {}: {}", resolved.key(), e.getMessage());
        }
        long count = counters.count(userId, resolved.key(), windowStart);
        writeMirror(redisKey, count, ttl(resolved.window(), now));
        return count;
    }

    private void mirror(
            UUID userId, Resolved resolved, Instant windowStart, long count, Instant now) {
        String redisKey = usageKey(userId, resolved.key(), windowStart);
        Duration ttl = ttl(resolved.window(), now);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            // Never mirror a value the surrounding transaction might still roll back.
            deleteMirror(redisKey);
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            writeMirror(redisKey, count, ttl);
                        }
                    });
        } else {
            writeMirror(redisKey, count, ttl);
        }
    }

    private void writeMirror(String redisKey, long count, Duration ttl) {
        try {
            redis.opsForValue().set(redisKey, Long.toString(count), ttl);
        } catch (DataAccessException e) {
            log.warn("Usage mirror not written: {}", e.getMessage());
        }
    }

    private void deleteMirror(String redisKey) {
        try {
            redis.delete(redisKey);
        } catch (DataAccessException e) {
            log.warn("Usage mirror not deleted: {}", e.getMessage());
        }
    }

    private static Duration ttl(LimitWindow window, Instant now) {
        @Nullable Instant resetsAt = window.resetsAt(now);
        if (resetsAt == null) {
            return MIRROR_MAX_TTL;
        }
        Duration untilReset = Duration.between(now, resetsAt).plusSeconds(1);
        return untilReset.compareTo(MIRROR_MAX_TTL) < 0 ? untilReset : MIRROR_MAX_TTL;
    }

    static String usageKey(UUID userId, String limitKey, Instant windowStart) {
        return USAGE_KEY_PREFIX + userId + ":" + limitKey + ":" + windowStart.getEpochSecond();
    }

    /** A limit resolved for one user. */
    private record Resolved(
            String planCode,
            String key,
            LimitKind kind,
            LimitWindow window,
            @Nullable Integer max,
            boolean overridden) {}
}
