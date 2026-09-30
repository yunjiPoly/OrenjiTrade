package com.orenjitrade.api.payments.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Pure money and window rules of payment protection. */
class PaymentRulesTest {

    private static BigDecimal money(String value) {
        return new BigDecimal(value);
    }

    @Test
    void feesRoundHalfUpToTheCentAndNeverExceedTheAmount() {
        assertThat(PaymentRules.fee(money("40.00"), money("5.00"))).isEqualByComparingTo("2.00");
        assertThat(PaymentRules.fee(money("33.33"), money("5.00"))).isEqualByComparingTo("1.67");
        assertThat(PaymentRules.fee(money("0.10"), money("5.00"))).isEqualByComparingTo("0.01");
        assertThat(PaymentRules.fee(money("0.09"), money("5.00"))).isEqualByComparingTo("0.00");
        assertThat(PaymentRules.fee(money("10.00"), money("0"))).isEqualByComparingTo("0.00");
        assertThat(PaymentRules.fee(money("10.00"), money("100"))).isEqualByComparingTo("10.00");
        assertThat(PaymentRules.fee(money("40.00"), money("5.00")).scale()).isEqualTo(2);
    }

    @Test
    void payoutsKeepTheFeeOnWhatTheBuyerDidNotGetBack() {
        assertThat(PaymentRules.payout(money("60.00"), money("0.00"), money("5.00")))
                .isEqualByComparingTo("57.00");
        assertThat(PaymentRules.payout(money("60.00"), money("10.00"), money("5.00")))
                .isEqualByComparingTo("47.50");
        assertThat(PaymentRules.payout(money("60.00"), money("60.00"), money("5.00")))
                .isEqualByComparingTo("0.00");
        assertThat(PaymentRules.payout(money("33.33"), money("0.00"), money("5.00")))
                .isEqualByComparingTo("31.66");
        assertThat(
                        PaymentRules.payout(money("33.33"), money("0.00"), money("5.00"))
                                .add(PaymentRules.fee(money("33.33"), money("5.00"))))
                .as("payout + fee = amount without refunds")
                .isEqualByComparingTo("33.33");
    }

    @Test
    void theDisputeWindowStartsAtShipmentAndOnlyOneDisputeIsPossible() {
        Instant shipped = Instant.parse("2026-09-01T10:00:00Z");
        Instant end = PaymentRules.windowEnd(shipped, 7);
        assertThat(end).isEqualTo(shipped.plus(Duration.ofDays(7)));
        Instant before = end.minusSeconds(1);
        assertThat(PaymentRules.disputeOpenable(PaymentStatus.SECURED, false, null, before))
                .as("not shipped yet")
                .isTrue();
        assertThat(PaymentRules.disputeOpenable(PaymentStatus.SECURED, false, end, before))
                .isTrue();
        assertThat(PaymentRules.disputeOpenable(PaymentStatus.SECURED, false, end, end))
                .as("window ended")
                .isFalse();
        assertThat(PaymentRules.disputeOpenable(PaymentStatus.SECURED, true, end, before))
                .as("already disputed")
                .isFalse();
        for (PaymentStatus status : PaymentStatus.values()) {
            if (status != PaymentStatus.SECURED) {
                assertThat(PaymentRules.disputeOpenable(status, false, end, before))
                        .as("%s", status)
                        .isFalse();
            }
        }
    }

    @Test
    void amountsArePositiveWithAtMostTwoDecimals() {
        assertThat(PaymentRules.validAmount(money("0.01"))).isTrue();
        assertThat(PaymentRules.validAmount(money("10.50"))).isTrue();
        assertThat(PaymentRules.validAmount(money("10.500"))).isTrue();
        assertThat(PaymentRules.validAmount(money("10.505"))).isFalse();
        assertThat(PaymentRules.validAmount(money("0"))).isFalse();
        assertThat(PaymentRules.validAmount(money("-1"))).isFalse();
        assertThat(PaymentRules.validAmount(null)).isFalse();
        assertThat(PaymentRules.same(money("10"), money("10.00"))).isTrue();
    }

    @Test
    void statusesKnowWhetherMoneyIsHeld() {
        assertThat(PaymentStatus.REQUIRES_ACTION.secured()).isFalse();
        assertThat(PaymentStatus.FAILED.unpaid()).isTrue();
        assertThat(PaymentStatus.SECURED.secured()).isTrue();
        assertThat(PaymentStatus.PAID_OUT.secured()).isTrue();
        assertThat(DisputeStatus.FROZEN.isOpen()).isTrue();
        assertThat(DisputeStatus.RESOLVED_SPLIT.isOpen()).isFalse();
        assertThat(DisputeOutcome.SPLIT.status()).isEqualTo(DisputeStatus.RESOLVED_SPLIT);
        assertThat(EvidenceKind.VIDEO.enabled()).isFalse();
        assertThat(EvidenceKind.DOCUMENT.hasFile()).isTrue();
        assertThat(EvidenceKind.TRACKING.hasFile()).isFalse();
    }
}
