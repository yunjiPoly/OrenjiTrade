package com.orenjitrade.api.cards.infra.http;

import java.time.Duration;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Client-side request pacing per host: at most {@code permitsPerSecond} request starts per host,
 * evenly spaced (a request waits for the next free slot). Provider etiquette (ADR 0015): YGOPRODeck
 * blocks an IP for an hour above 20 requests/second, so OrenjiTrade defaults to 5 and never allows
 * more than {@link #HARD_CEILING_PER_SECOND}, whatever the configuration says.
 */
public final class HostRateLimiter {

    /** Upper bound for any provider host, independent of configuration. */
    public static final double HARD_CEILING_PER_SECOND = 15.0;

    private final long intervalNanos;
    private final LongSupplier nanoTime;
    private final Sleeper sleeper;
    private final Map<String, Long> nextSlot = new HashMap<>();

    public HostRateLimiter(double permitsPerSecond) {
        this(permitsPerSecond, System::nanoTime, Sleeper.SYSTEM);
    }

    public HostRateLimiter(double permitsPerSecond, LongSupplier nanoTime, Sleeper sleeper) {
        validate(permitsPerSecond);
        this.intervalNanos = (long) Math.ceil(1_000_000_000.0 / permitsPerSecond);
        this.nanoTime = nanoTime;
        this.sleeper = sleeper;
    }

    /** Refuses values outside (0, {@value #HARD_CEILING_PER_SECOND}]. */
    public static void validate(double permitsPerSecond) {
        if (!(permitsPerSecond > 0) || permitsPerSecond > HARD_CEILING_PER_SECOND) {
            throw new IllegalArgumentException(
                    "Provider request rate must be > 0 and <= "
                            + HARD_CEILING_PER_SECOND
                            + " requests/second per host (configured: "
                            + permitsPerSecond
                            + ")");
        }
    }

    /** Minimum spacing between two request starts on one host. */
    public Duration interval() {
        return Duration.ofNanos(intervalNanos);
    }

    /** Blocks until a request to {@code host} may start. */
    public void acquire(String host) throws InterruptedException {
        long wait;
        String key = host.toLowerCase(Locale.ROOT);
        synchronized (nextSlot) {
            long now = nanoTime.getAsLong();
            long slot = Math.max(now, nextSlot.getOrDefault(key, now));
            nextSlot.put(key, slot + intervalNanos);
            wait = slot - now;
        }
        if (wait > 0) {
            sleeper.sleep(Duration.ofNanos(wait));
        }
    }
}
