package com.orenjitrade.api.billing.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Pure rules: UTC windows and how several entitlements combine (most generous wins). */
class LimitRulesTest {

    static final Instant NOW = Instant.parse("2026-09-29T17:45:12Z");

    private static EntitlementView entitlement(String key, String value) {
        return new EntitlementView(
                UUID.randomUUID(),
                UUID.randomUUID(),
                key,
                value,
                EntitlementSource.ADMIN_GRANT,
                null,
                null,
                null,
                NOW,
                null);
    }

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
    void mostGenerousLimitEntitlementWins() {
        assertThat(Entitlements.limitOverride(List.of(), "binders.max")).isEmpty();
        assertThat(
                        Entitlements.limitOverride(
                                        List.of(
                                                entitlement("binders.max", "10"),
                                                entitlement("binders.max", "25"),
                                                entitlement("offers.per_day", "unlimited")),
                                        "binders.max")
                                .orElseThrow()
                                .maxValue())
                .isEqualTo(25);
        assertThat(
                        Entitlements.limitOverride(
                                        List.of(
                                                entitlement("binders.max", "10"),
                                                entitlement("binders.max", "unlimited")),
                                        "binders.max")
                                .orElseThrow()
                                .maxValue())
                .isNull();
        assertThat(
                        Entitlements.limitOverride(
                                List.of(entitlement("binders.max", "not-a-number")), "binders.max"))
                .isEmpty();
    }

    @Test
    void featureEntitlementsDefaultToOnAndAnyTrueWins() {
        assertThat(Entitlements.featureOverride(List.of(), "filters.advanced")).isEmpty();
        assertThat(
                        Entitlements.featureOverride(
                                List.of(entitlement("filters.advanced", null)), "filters.advanced"))
                .contains(true);
        assertThat(
                        Entitlements.featureOverride(
                                List.of(entitlement("ads.enabled", "false")), "ads.enabled"))
                .contains(false);
        assertThat(
                        Entitlements.featureOverride(
                                List.of(
                                        entitlement("ads.enabled", "false"),
                                        entitlement("ads.enabled", "TRUE")),
                                "ads.enabled"))
                .contains(true);
    }

    @Test
    void expiryAndRevocationEndAnEntitlement() {
        EntitlementView active = entitlement("binders.max", "10");
        assertThat(active.activeAt(NOW)).isTrue();
        EntitlementView expired =
                new EntitlementView(
                        active.id(),
                        active.userId(),
                        "binders.max",
                        "10",
                        EntitlementSource.PROMO,
                        NOW,
                        null,
                        null,
                        NOW.minusSeconds(60),
                        null);
        assertThat(expired.activeAt(NOW)).isFalse();
        EntitlementView revoked =
                new EntitlementView(
                        active.id(),
                        active.userId(),
                        "binders.max",
                        "10",
                        EntitlementSource.PROMO,
                        null,
                        null,
                        null,
                        NOW.minusSeconds(60),
                        NOW.minusSeconds(1));
        assertThat(revoked.activeAt(NOW)).isFalse();
    }
}
