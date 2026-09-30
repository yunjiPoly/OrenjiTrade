package com.orenjitrade.api.delisting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.delisting.domain.DelistPolicyService.PolicyChange;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The pure freshness rules: states, warning window, labels and event types. */
class FreshnessPolicyTest {

    static final Instant NOW = Instant.parse("2026-09-29T12:00:00Z");

    static final FreshnessPolicy DEFAULT =
            new FreshnessPolicy(UUID.randomUUID(), "Default", 15, 31, 46, 5, 3, null, NOW);

    private static Instant daysAgo(double days) {
        return NOW.minus(Duration.ofMinutes(Math.round(days * 24 * 60)));
    }

    @Test
    void statesFollowTheContractThresholds() {
        assertThat(DEFAULT.stateAt(NOW, NOW)).isEqualTo(FreshnessState.ACTIVE);
        assertThat(DEFAULT.stateAt(daysAgo(14.99), NOW)).isEqualTo(FreshnessState.ACTIVE);
        assertThat(DEFAULT.stateAt(daysAgo(15), NOW)).isEqualTo(FreshnessState.AGING);
        assertThat(DEFAULT.stateAt(daysAgo(30.99), NOW)).isEqualTo(FreshnessState.AGING);
        assertThat(DEFAULT.stateAt(daysAgo(31), NOW)).isEqualTo(FreshnessState.STALE);
        assertThat(DEFAULT.stateAt(daysAgo(45.99), NOW)).isEqualTo(FreshnessState.STALE);
        assertThat(DEFAULT.stateAt(daysAgo(46), NOW)).isEqualTo(FreshnessState.HIDDEN);
        assertThat(DEFAULT.stateAt(daysAgo(400), NOW)).isEqualTo(FreshnessState.HIDDEN);
        assertThat(DEFAULT.stateAt(NOW.plusSeconds(60), NOW)).isEqualTo(FreshnessState.ACTIVE);
    }

    @Test
    void theWarningWindowOpensFiveDaysBeforeHiding() {
        assertThat(DEFAULT.isInWarningWindow(daysAgo(40.99), NOW)).isFalse();
        assertThat(DEFAULT.isInWarningWindow(daysAgo(41), NOW)).isTrue();
        assertThat(DEFAULT.isInWarningWindow(daysAgo(45.99), NOW)).isTrue();
        assertThat(DEFAULT.isInWarningWindow(daysAgo(46), NOW)).isFalse();
        assertThat(DEFAULT.hidesAt(daysAgo(41))).isEqualTo(NOW.plus(Duration.ofDays(5)));
        assertThat(DEFAULT.warnCutoff(NOW)).isEqualTo(NOW.minus(Duration.ofDays(41)));
    }

    @Test
    void eventTypesDescribeTransitions() {
        assertThat(FreshnessEventType.forTransition(FreshnessState.ACTIVE, FreshnessState.ACTIVE))
                .isNull();
        assertThat(FreshnessEventType.forTransition(FreshnessState.ACTIVE, FreshnessState.AGING))
                .isEqualTo(FreshnessEventType.AGED);
        assertThat(FreshnessEventType.forTransition(FreshnessState.AGING, FreshnessState.STALE))
                .isEqualTo(FreshnessEventType.STALED);
        assertThat(FreshnessEventType.forTransition(FreshnessState.ACTIVE, FreshnessState.STALE))
                .isEqualTo(FreshnessEventType.STALED);
        assertThat(FreshnessEventType.forTransition(FreshnessState.STALE, FreshnessState.HIDDEN))
                .isEqualTo(FreshnessEventType.HIDDEN);
        assertThat(FreshnessEventType.forTransition(FreshnessState.HIDDEN, FreshnessState.ACTIVE))
                .isEqualTo(FreshnessEventType.RESTORED);
        assertThat(FreshnessEventType.forTransition(FreshnessState.HIDDEN, FreshnessState.STALE))
                .isEqualTo(FreshnessEventType.RESTORED);
        assertThat(FreshnessEventType.forTransition(FreshnessState.STALE, FreshnessState.AGING))
                .as("a more lenient policy is not an event unless the listing was hidden")
                .isNull();
    }

    @Test
    void labelsAreCoarse() {
        assertThat(FreshnessLabels.label(NOW, NOW)).isEqualTo("Updated just now");
        assertThat(FreshnessLabels.label(NOW.plusSeconds(30), NOW)).isEqualTo("Updated just now");
        assertThat(FreshnessLabels.label(NOW.minusSeconds(60), NOW))
                .isEqualTo("Updated 1 minute ago");
        assertThat(FreshnessLabels.label(NOW.minus(Duration.ofMinutes(59)), NOW))
                .isEqualTo("Updated 59 minutes ago");
        assertThat(FreshnessLabels.label(NOW.minus(Duration.ofHours(3)), NOW))
                .isEqualTo("Updated 3 hours ago");
        assertThat(FreshnessLabels.label(NOW.minus(Duration.ofHours(1)), NOW))
                .isEqualTo("Updated 1 hour ago");
        assertThat(FreshnessLabels.label(NOW.minus(Duration.ofHours(30)), NOW))
                .isEqualTo("Updated yesterday");
        assertThat(FreshnessLabels.label(daysAgo(5), NOW)).isEqualTo("Updated 5 days ago");
        assertThat(FreshnessLabels.label(daysAgo(45), NOW)).isEqualTo("Updated 1 month ago");
        assertThat(FreshnessLabels.label(daysAgo(200), NOW)).isEqualTo("Updated 6 months ago");
        assertThat(FreshnessLabels.label(daysAgo(400), NOW)).isEqualTo("Updated over a year ago");
    }

    @Test
    void policyEditsMustKeepTheThresholdsOrdered() {
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 46, 5, 3)))
                .isEmpty();
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 0, 31, 46, 5, null)))
                .extracting(error -> error.field())
                .containsExactly("agingAfterDays");
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 15, 46, 5, null)))
                .extracting(error -> error.field())
                .containsExactly("staleAfterDays");
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 31, 5, null)))
                .extracting(error -> error.field())
                .containsExactly("hiddenAfterDays");
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 46, 46, null)))
                .extracting(error -> error.field())
                .containsExactly("warnBeforeHiddenDays");
        assertThat(DelistPolicyService.validate(new PolicyChange(null, 15, 31, 46, 5, 0)))
                .extracting(error -> error.field())
                .containsExactly("maxStrikes");
        assertThat(
                        DelistPolicyService.validate(
                                new PolicyChange("x".repeat(81), 15, 31, 4000, 5, null)))
                .extracting(error -> error.field())
                .containsExactlyInAnyOrder("hiddenAfterDays", "name");
    }
}
