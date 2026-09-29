package com.orenjitrade.api.users.infra;

import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Limits {@code last_active_at} writes to one per user per {@link #WINDOW} with a Redis {@code SET
 * NX}. Fails open: when Redis is unreachable the write is allowed (the database still copes).
 */
@Component
public class LastActiveThrottle {

    public static final Duration WINDOW = Duration.ofMinutes(5);
    static final String KEY_PREFIX = "user:last-active:";

    private static final Logger log = LoggerFactory.getLogger(LastActiveThrottle.class);

    private final StringRedisTemplate redis;

    public LastActiveThrottle(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** {@code true} when the caller should persist the activity timestamp now. */
    public boolean shouldTouch(UUID userId) {
        try {
            Boolean acquired = redis.opsForValue().setIfAbsent(KEY_PREFIX + userId, "1", WINDOW);
            return Boolean.TRUE.equals(acquired);
        } catch (DataAccessException e) {
            log.warn(
                    "Redis unavailable for last-active throttling, writing without throttle: {}",
                    e.getMessage());
            return true;
        }
    }
}
