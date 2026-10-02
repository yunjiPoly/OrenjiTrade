package com.orenjitrade.api.cards.infra.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

/** Client-side pacing per host with a virtual clock (no real waiting). */
class HostRateLimiterTest {

    /** A clock that only moves when the limiter sleeps. */
    private final AtomicLong now = new AtomicLong(1_000_000_000L);

    private HostRateLimiter limiter(double perSecond) {
        return new HostRateLimiter(
                perSecond, now::get, duration -> now.addAndGet(duration.toNanos()));
    }

    @Test
    void requestsToOneHostAreSpacedEvenly() throws InterruptedException {
        HostRateLimiter limiter = limiter(5);
        long start = now.get();
        for (int i = 0; i < 11; i++) {
            limiter.acquire("db.ygoprodeck.com");
        }
        // 11 request starts at 5/s: the last one starts 2 s after the first.
        assertThat(Duration.ofNanos(now.get() - start)).isEqualTo(Duration.ofSeconds(2));
        assertThat(limiter.interval()).isEqualTo(Duration.ofMillis(200));
    }

    @Test
    void hostsArePacedIndependently() throws InterruptedException {
        HostRateLimiter limiter = limiter(5);
        long start = now.get();
        limiter.acquire("db.ygoprodeck.com");
        limiter.acquire("images.ygoprodeck.com");
        limiter.acquire("IMAGES.ygoprodeck.com");
        assertThat(Duration.ofNanos(now.get() - start)).isEqualTo(Duration.ofMillis(200));
    }

    @Test
    void neverMoreThanFifteenRequestsPerSecond() {
        assertThatThrownBy(() -> new HostRateLimiter(16))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new HostRateLimiter(20)).hasMessageContaining("<= 15.0");
        assertThatThrownBy(() -> new HostRateLimiter(0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new HostRateLimiter(Double.NaN))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(new HostRateLimiter(15).interval()).isEqualTo(Duration.ofNanos(66_666_667));
    }
}
