package com.orenjitrade.api.profiles.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Bucketing of last activity on the public profile. */
class LastActiveBucketTest {

    private static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");

    @Test
    void buckets() {
        assertThat(CollectorProfileService.lastActiveBucket(null, NOW))
                .isEqualTo(LastActiveBucket.LONGER_AGO);
        assertThat(CollectorProfileService.lastActiveBucket(NOW.minus(Duration.ofHours(3)), NOW))
                .isEqualTo(LastActiveBucket.TODAY);
        assertThat(CollectorProfileService.lastActiveBucket(NOW.minus(Duration.ofDays(3)), NOW))
                .isEqualTo(LastActiveBucket.THIS_WEEK);
        assertThat(CollectorProfileService.lastActiveBucket(NOW.minus(Duration.ofDays(20)), NOW))
                .isEqualTo(LastActiveBucket.THIS_MONTH);
        assertThat(CollectorProfileService.lastActiveBucket(NOW.minus(Duration.ofDays(90)), NOW))
                .isEqualTo(LastActiveBucket.LONGER_AGO);
    }
}
