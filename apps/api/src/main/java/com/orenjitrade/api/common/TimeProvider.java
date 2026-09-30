package com.orenjitrade.api.common;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Single source of the current time for the application. Inject this instead of calling {@link
 * Instant#now()} so tests can freeze time by supplying a {@link Clock} bean (or by using {@link
 * #fixed(Instant)} directly).
 *
 * <p>The default clock is UTC; the API never exposes local time.
 */
@Component
public class TimeProvider {

    private final Clock clock;

    /**
     * Spring injection point: uses a {@link Clock} bean when one exists, UTC system clock
     * otherwise.
     */
    @Autowired
    public TimeProvider(ObjectProvider<Clock> clock) {
        this(clock.getIfAvailable(Clock::systemUTC));
    }

    public TimeProvider(Clock clock) {
        this.clock = clock;
    }

    /** A provider backed by the system UTC clock. */
    public static TimeProvider system() {
        return new TimeProvider(Clock.systemUTC());
    }

    /** A provider that always returns {@code instant} (tests). */
    public static TimeProvider fixed(Instant instant) {
        return new TimeProvider(Clock.fixed(instant, ZoneOffset.UTC));
    }

    public Instant now() {
        return clock.instant();
    }

    public Clock clock() {
        return clock;
    }
}
