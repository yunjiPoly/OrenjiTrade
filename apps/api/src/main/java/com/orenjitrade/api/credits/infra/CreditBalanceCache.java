package com.orenjitrade.api.credits.infra;

import java.time.Duration;
import java.util.OptionalLong;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Redis cache of derived credit balances ({@code orenji:credits:balance:<userId>}, TTL {@link
 * #TTL}). Evicted after every committed ledger entry; the {@code credits-reconcile} job compares it
 * with {@code SUM(amount)} and repairs it. Fails open: without Redis the balance is summed from the
 * ledger. Spends never trust it (they sum under the account's ledger lock).
 */
@Component
public class CreditBalanceCache {

    public static final String KEY_PREFIX = "orenji:credits:balance:";
    public static final Duration TTL = Duration.ofMinutes(10);

    private static final Logger log = LoggerFactory.getLogger(CreditBalanceCache.class);

    private final StringRedisTemplate redis;

    public CreditBalanceCache(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public OptionalLong get(UUID userId) {
        try {
            @Nullable String value = redis.opsForValue().get(KEY_PREFIX + userId);
            if (value == null) {
                return OptionalLong.empty();
            }
            return OptionalLong.of(Long.parseLong(value));
        } catch (DataAccessException | NumberFormatException e) {
            log.warn("Credit balance cache unavailable: {}", e.getClass().getSimpleName());
            return OptionalLong.empty();
        }
    }

    public void put(UUID userId, long balance) {
        try {
            redis.opsForValue().set(KEY_PREFIX + userId, Long.toString(balance), TTL);
        } catch (DataAccessException e) {
            log.warn("Credit balance not cached: {}", e.getClass().getSimpleName());
        }
    }

    public void evict(UUID userId) {
        try {
            redis.delete(KEY_PREFIX + userId);
        } catch (DataAccessException e) {
            log.warn("Credit balance not evicted (TTL applies): {}", e.getClass().getSimpleName());
        }
    }
}
