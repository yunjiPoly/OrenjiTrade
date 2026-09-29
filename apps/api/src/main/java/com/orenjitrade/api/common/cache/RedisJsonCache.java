package com.orenjitrade.api.common.cache;

import java.time.Duration;
import java.util.List;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Read-through JSON cache in Redis for configurable business rules (ADR 0014: feature flags, plans,
 * limits, games). Values live under {@code orenji:cache:<key>} with a short TTL and are evicted
 * explicitly by the owning module after every admin write, so every API instance sees a change
 * immediately after eviction and at worst after the TTL.
 *
 * <p>Fails open: when Redis is unreachable or a cached value cannot be read back (for example after
 * a DTO change), the loader is used and a warning is logged; callers never see a cache error.
 */
@Component
public class RedisJsonCache {

    /** Prefix of every key written by this cache. */
    public static final String KEY_PREFIX = "orenji:cache:";

    private static final Logger log = LoggerFactory.getLogger(RedisJsonCache.class);

    private final StringRedisTemplate redis;
    private final JsonMapper jsonMapper;

    public RedisJsonCache(StringRedisTemplate redis, JsonMapper jsonMapper) {
        this.redis = redis;
        this.jsonMapper = jsonMapper;
    }

    /**
     * The cached value of {@code key}, or the loader's result (then cached for {@code ttl}). The
     * type must be a concrete class (wrap collections in a record).
     */
    public <T> T get(String key, Class<T> type, Duration ttl, Supplier<T> loader) {
        String redisKey = KEY_PREFIX + key;
        @Nullable String cached = read(redisKey);
        if (cached != null) {
            try {
                return jsonMapper.readValue(cached, type);
            } catch (JacksonException e) {
                log.warn(
                        "Discarding unreadable cache entry {}: {}",
                        redisKey,
                        e.getOriginalMessage());
            }
        }
        T value = loader.get();
        write(redisKey, value, ttl);
        return value;
    }

    /** Removes the given keys (explicit invalidation after a write). */
    public void evict(String... keys) {
        if (keys.length == 0) {
            return;
        }
        try {
            redis.delete(List.of(keys).stream().map(key -> KEY_PREFIX + key).toList());
        } catch (DataAccessException e) {
            log.warn("Redis unavailable, cache eviction skipped (TTL applies): {}", e.getMessage());
        }
    }

    private @Nullable String read(String redisKey) {
        try {
            return redis.opsForValue().get(redisKey);
        } catch (DataAccessException e) {
            log.warn(
                    "Redis unavailable, reading {} from the database: {}",
                    redisKey,
                    e.getMessage());
            return null;
        }
    }

    private void write(String redisKey, Object value, Duration ttl) {
        try {
            redis.opsForValue().set(redisKey, jsonMapper.writeValueAsString(value), ttl);
        } catch (DataAccessException e) {
            log.warn("Redis unavailable, not caching {}: {}", redisKey, e.getMessage());
        } catch (JacksonException e) {
            log.warn("Value of {} is not cacheable: {}", redisKey, e.getOriginalMessage());
        }
    }
}
