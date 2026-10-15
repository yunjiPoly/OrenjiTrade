package com.orenjitrade.api.limits.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.limits.infra.UsageCounterRepository;
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
 * Usage limits ({@code Limits.check(userId, key)}, ADR 0014): the same caps for every collector
 * since stage F1 (ADR 0019: no plans, no per-account overrides). Numbers are data ({@code
 * usage_limit}, edited in {@code /admin/usage-limits}); this class contains none.
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

    private final UsageLimitService rules;
    private final UsageCounterRepository counters;
    private final StringRedisTemplate redis;
    private final TimeProvider timeProvider;
    private final List<LimitUsageSource> usageSources;

    public Limits(
            UsageLimitService rules,
            UsageCounterRepository counters,
            StringRedisTemplate redis,
            TimeProvider timeProvider,
            List<LimitUsageSource> usageSources) {
        this.rules = rules;
        this.counters = counters;
        this.redis = redis;
        this.timeProvider = timeProvider;
        this.usageSources = List.copyOf(usageSources);
    }

    /**
     * Whether {@code userId} may perform one more {@code limitKey} action now (no consumption). For
     * caps the decision is always allowed and carries the maximum.
     *
     * @throws IllegalArgumentException when no usage limit has the key {@code limitKey}
     */
    public LimitDecision check(UUID userId, String limitKey) {
        UsageLimitRule rule = rule(limitKey);
        Instant now = timeProvider.now();
        if (rule.kind() == LimitKind.CAP) {
            return decision(rule, true, null, now);
        }
        long used = usage(userId, rule, now);
        return decision(rule, rule.maxValue() == null || used < rule.maxValue(), used, now);
    }

    /**
     * Consumes one unit of a counter limit.
     *
     * @return the decision after consumption ({@code used} includes this action)
     * @throws LimitReachedException when the limit is already reached (nothing is consumed)
     * @throws IllegalArgumentException for cap limits (use {@link #checkValue}) and unknown keys
     */
    public LimitDecision consume(UUID userId, String limitKey) {
        UsageLimitRule rule = rule(limitKey);
        if (rule.kind() == LimitKind.CAP) {
            throw new IllegalArgumentException(limitKey + " is a cap; use checkValue");
        }
        Instant now = timeProvider.now();
        Optional<LimitUsageSource> source = sourceFor(limitKey);
        if (source.isPresent()) {
            long used = source.get().currentUsage(userId, limitKey);
            boolean allowed = rule.maxValue() == null || used < rule.maxValue();
            LimitDecision decision = decision(rule, allowed, used, now);
            if (!allowed) {
                throw new LimitReachedException(decision);
            }
            return decision;
        }
        Instant windowStart = rule.window().start(now);
        OptionalLong count =
                counters.incrementIfBelow(userId, limitKey, windowStart, rule.maxValue(), now);
        if (count.isEmpty()) {
            long used = counters.count(userId, limitKey, windowStart);
            mirror(userId, rule, windowStart, used, now);
            throw new LimitReachedException(decision(rule, false, used, now));
        }
        mirror(userId, rule, windowStart, count.getAsLong(), now);
        return decision(rule, true, count.getAsLong(), now);
    }

    /**
     * Checks a requested value against a cap (a {@code CAP} usage limit; none is seeded since the
     * map radius was removed, ADR 0017); {@code used} of the decision is the requested value. The
     * cap is the same for everyone, signed in or not. Callers throw {@link LimitReachedException}
     * when it is not allowed.
     */
    public LimitDecision checkValue(String limitKey, long requested) {
        UsageLimitRule rule = rule(limitKey);
        boolean allowed = rule.maxValue() == null || requested <= rule.maxValue();
        return decision(rule, allowed, requested, timeProvider.now());
    }

    /** The status of every usage limit for {@code userId} (for {@code GET /me/limits}), by key. */
    public List<LimitDecision> overview(UUID userId) {
        Instant now = timeProvider.now();
        List<LimitDecision> result = new ArrayList<>();
        for (UsageLimitRule rule : rules.all()) {
            if (rule.kind() == LimitKind.CAP) {
                result.add(decision(rule, true, null, now));
            } else {
                long used = usage(userId, rule, now);
                result.add(
                        decision(
                                rule,
                                rule.maxValue() == null || used < rule.maxValue(),
                                used,
                                now));
            }
        }
        return result;
    }

    private UsageLimitRule rule(String limitKey) {
        return rules.find(limitKey)
                .orElseThrow(() -> new IllegalArgumentException("Unknown limit key " + limitKey));
    }

    private Optional<LimitUsageSource> sourceFor(String limitKey) {
        return usageSources.stream().filter(source -> source.supports(limitKey)).findFirst();
    }

    private static LimitDecision decision(
            UsageLimitRule rule, boolean allowed, @Nullable Long used, Instant now) {
        @Nullable Integer max = rule.maxValue();
        @Nullable Long remaining =
                max == null || used == null || rule.kind() == LimitKind.CAP
                        ? null
                        : Math.max(0L, max - used);
        return new LimitDecision(
                rule.key(),
                allowed,
                rule.kind(),
                rule.window(),
                max,
                used,
                remaining,
                rule.kind() == LimitKind.CAP ? null : rule.window().resetsAt(now));
    }

    // ---------------------------------------------------------------------------------------
    // Usage (Redis mirror + database)
    // ---------------------------------------------------------------------------------------

    private long usage(UUID userId, UsageLimitRule rule, Instant now) {
        Optional<LimitUsageSource> source = sourceFor(rule.key());
        if (source.isPresent()) {
            return source.get().currentUsage(userId, rule.key());
        }
        Instant windowStart = rule.window().start(now);
        String redisKey = usageKey(userId, rule.key(), windowStart);
        try {
            @Nullable String cached = redis.opsForValue().get(redisKey);
            if (cached != null) {
                return Long.parseLong(cached);
            }
        } catch (DataAccessException | NumberFormatException e) {
            log.warn("Usage mirror unavailable for {}: {}", rule.key(), e.getMessage());
        }
        long count = counters.count(userId, rule.key(), windowStart);
        writeMirror(redisKey, count, ttl(rule.window(), now));
        return count;
    }

    private void mirror(
            UUID userId, UsageLimitRule rule, Instant windowStart, long count, Instant now) {
        String redisKey = usageKey(userId, rule.key(), windowStart);
        Duration ttl = ttl(rule.window(), now);
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
}
