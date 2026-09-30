package com.orenjitrade.api.messaging.infra;

import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Presence keys in Redis ({@code presence:{userId}}, TTL {@link #TTL}): present while the account
 * has an open realtime session on some instance, refreshed by client activity and heartbeats. Fails
 * open (offline) when Redis is unavailable.
 */
@Component
public class PresenceStore {

    public static final Duration TTL = Duration.ofSeconds(60);
    static final String KEY_PREFIX = "presence:";

    private static final Logger log = LoggerFactory.getLogger(PresenceStore.class);

    private final StringRedisTemplate redis;

    public PresenceStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public boolean isOnline(UUID userId) {
        try {
            return Boolean.TRUE.equals(redis.hasKey(KEY_PREFIX + userId));
        } catch (DataAccessException e) {
            log.warn("Presence unavailable: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Marks the account online for {@link #TTL}.
     *
     * @return whether it was offline before (a presence change)
     */
    public boolean touch(UUID userId) {
        String key = KEY_PREFIX + userId;
        try {
            Boolean created = redis.opsForValue().setIfAbsent(key, "1", TTL);
            if (Boolean.TRUE.equals(created)) {
                return true;
            }
            redis.expire(key, TTL);
            return false;
        } catch (DataAccessException e) {
            log.warn("Presence not refreshed: {}", e.getMessage());
            return false;
        }
    }

    /** Marks the account offline. */
    public void clear(UUID userId) {
        try {
            redis.delete(KEY_PREFIX + userId);
        } catch (DataAccessException e) {
            log.warn("Presence not cleared (TTL applies): {}", e.getMessage());
        }
    }
}
