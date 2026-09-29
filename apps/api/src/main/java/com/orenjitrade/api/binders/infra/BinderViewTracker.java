package com.orenjitrade.api.binders.infra;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * De-duplicates public binder views per viewer, binder and UTC day in Redis, so {@code
 * binder.views.per_day} counts distinct binders rather than page reloads. Nothing durable is stored
 * (who viewed which binder is never persisted). Fails open: without Redis a view is not counted.
 */
@Component
public class BinderViewTracker {

    static final String KEY_PREFIX = "orenji:binder-view:";

    private static final Logger log = LoggerFactory.getLogger(BinderViewTracker.class);

    private final StringRedisTemplate redis;

    public BinderViewTracker(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Whether this is the viewer's first view of the binder today (and remembers it). */
    public boolean firstViewToday(UUID viewerId, UUID binderId, Instant now) {
        Instant dayStart = now.truncatedTo(ChronoUnit.DAYS);
        Duration ttl = Duration.between(now, dayStart.plus(Duration.ofDays(1))).plusMinutes(1);
        try {
            Boolean created =
                    redis.opsForValue().setIfAbsent(key(viewerId, binderId, dayStart), "1", ttl);
            return Boolean.TRUE.equals(created);
        } catch (DataAccessException e) {
            log.warn("Binder view de-duplication unavailable: {}", e.getMessage());
            return false;
        }
    }

    /** Forgets today's view (the view was refused, e.g. by the plan limit). */
    public void forget(UUID viewerId, UUID binderId, Instant now) {
        try {
            redis.delete(key(viewerId, binderId, now.truncatedTo(ChronoUnit.DAYS)));
        } catch (DataAccessException e) {
            log.warn("Binder view de-duplication unavailable: {}", e.getMessage());
        }
    }

    private static String key(UUID viewerId, UUID binderId, Instant dayStart) {
        return KEY_PREFIX + viewerId + ":" + binderId + ":" + dayStart.getEpochSecond();
    }
}
