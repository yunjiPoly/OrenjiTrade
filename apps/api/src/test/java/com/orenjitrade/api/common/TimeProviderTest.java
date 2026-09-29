package com.orenjitrade.api.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

class TimeProviderTest {

    @Test
    void fixedProviderAlwaysReturnsTheSameInstant() {
        Instant frozen = Instant.parse("2026-09-29T12:00:00Z");
        TimeProvider provider = TimeProvider.fixed(frozen);

        assertThat(provider.now()).isEqualTo(frozen);
        assertThat(provider.now()).isEqualTo(frozen);
        assertThat(provider.clock().getZone()).isEqualTo(ZoneOffset.UTC);
    }

    @Test
    void systemProviderIsUtcAndCloseToNow() {
        TimeProvider provider = TimeProvider.system();

        Instant before = Instant.now();
        Instant now = provider.now();
        Instant after = Instant.now();

        assertThat(now).isBetween(before, after);
        assertThat(provider.clock().getZone()).isEqualTo(ZoneOffset.UTC);
    }

    @Test
    void usesClockBeanWhenOneIsAvailable() {
        Instant frozen = Instant.parse("2000-01-01T00:00:00Z");
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        beanFactory.registerSingleton("clock", Clock.fixed(frozen, ZoneOffset.UTC));
        ObjectProvider<Clock> clocks = beanFactory.getBeanProvider(Clock.class);

        TimeProvider provider = new TimeProvider(clocks);

        assertThat(provider.now()).isEqualTo(frozen);
    }

    @Test
    void fallsBackToSystemUtcClockWithoutClockBean() {
        ObjectProvider<Clock> clocks = new DefaultListableBeanFactory().getBeanProvider(Clock.class);

        TimeProvider provider = new TimeProvider(clocks);

        assertThat(provider.clock().getZone()).isEqualTo(ZoneOffset.UTC);
        assertThat(Duration.between(provider.now(), Instant.now()).abs())
                .isLessThan(Duration.ofSeconds(5));
    }
}
