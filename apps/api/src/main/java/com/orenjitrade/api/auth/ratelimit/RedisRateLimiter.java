package com.orenjitrade.api.auth.ratelimit;

import java.util.List;
import java.util.OptionalLong;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * Fixed-window counter in Redis: one atomic Lua script does {@code INCR} and, for a fresh key,
 * {@code PEXPIRE}, so a window can never be left without an expiry.
 */
@Component
public class RedisRateLimiter implements RateLimiter {

    static final String SCRIPT =
            """
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
              redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            return current
            """;

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    private final StringRedisTemplate redis;
    private final RedisScript<Long> script = new DefaultRedisScript<>(SCRIPT, Long.class);

    public RedisRateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public OptionalLong hit(String key, long windowMillis) {
        try {
            @Nullable Long count =
                    redis.execute(script, List.of(key), String.valueOf(windowMillis));
            return count == null ? OptionalLong.empty() : OptionalLong.of(count);
        } catch (DataAccessException e) {
            log.warn("Redis unavailable for rate limiting, failing open: {}", e.getMessage());
            return OptionalLong.empty();
        }
    }
}
