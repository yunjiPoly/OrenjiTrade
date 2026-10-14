package com.orenjitrade.api.limits.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** Pure rules: UTC windows and the plain 429 LIMIT_REACHED problem (no plan, no upgrade). */
class LimitRulesTest {

    static final Instant NOW = Instant.parse("2026-09-29T17:45:12Z");

    @Test
    void windowsAreAlignedOnUtc() {
        assertThat(LimitWindow.DAY.start(NOW)).isEqualTo(Instant.parse("2026-09-29T00:00:00Z"));
        assertThat(LimitWindow.DAY.resetsAt(NOW)).isEqualTo(Instant.parse("2026-09-30T00:00:00Z"));
        assertThat(LimitWindow.MONTH.start(NOW)).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(LimitWindow.MONTH.resetsAt(NOW))
                .isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
        assertThat(LimitWindow.MONTH.resetsAt(Instant.parse("2026-12-31T23:59:59Z")))
                .isEqualTo(Instant.parse("2027-01-01T00:00:00Z"));
        assertThat(LimitWindow.TOTAL.start(NOW)).isEqualTo(Instant.EPOCH);
        assertThat(LimitWindow.TOTAL.resetsAt(NOW)).isNull();
    }

    @Test
    void aReachedLimitNamesTheLimitAndItsResetButNoPlan() {
        Instant resetsAt = Instant.parse("2026-09-30T00:00:00Z");
        LimitReachedException daily =
                new LimitReachedException(
                        new LimitDecision(
                                "binder.views.per_day",
                                false,
                                LimitKind.COUNTER,
                                LimitWindow.DAY,
                                30,
                                30L,
                                0L,
                                resetsAt));
        assertThat(daily.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(daily.getMessage()).isEqualTo("You have reached the limit for this action");
        assertThat(daily.getProperties())
                .containsEntry("limitKey", "binder.views.per_day")
                .containsEntry("limit", 30)
                .containsEntry("used", 30L)
                .containsEntry("resetsAt", "2026-09-30T00:00:00Z")
                .doesNotContainKeys("planCode", "upgradeUrl");

        LimitReachedException total =
                new LimitReachedException(
                        new LimitDecision(
                                "binders.max",
                                false,
                                LimitKind.COUNTER,
                                LimitWindow.TOTAL,
                                5,
                                5L,
                                0L,
                                null));
        assertThat(total.getProperties())
                .containsEntry("limit", 5)
                .doesNotContainKeys("resetsAt", "planCode", "upgradeUrl");
    }
}
