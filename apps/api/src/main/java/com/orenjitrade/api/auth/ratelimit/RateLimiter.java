package com.orenjitrade.api.auth.ratelimit;

import java.util.OptionalLong;

/** Counts hits per key within a window. */
public interface RateLimiter {

    /**
     * Increments the counter of {@code key}, creating it with {@code windowMillis} time to live.
     *
     * @return the number of hits in the current window including this one, or empty when the
     *     backing store is unavailable (callers fail open)
     */
    OptionalLong hit(String key, long windowMillis);
}
