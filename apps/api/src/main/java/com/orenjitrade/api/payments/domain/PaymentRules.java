package com.orenjitrade.api.payments.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Pure money and window rules of payment protection (Phase 9 contract; unit-tested).
 *
 * <ul>
 *   <li>fee: {@code amount × percent / 100}, rounded half-up to the cent, never above the amount;
 *   <li>payout: the amount the buyer did not get back, minus the fee on that retained amount (the
 *       whole {@code seller_amount} without refunds; less after a partial refund or a split);
 *   <li>dispute window: shipment + {@code payments.dispute_window_days}; a dispute can be opened
 *       while the trade is PAID (not shipped) or SHIPPED before the window ends, once.
 * </ul>
 */
public final class PaymentRules {

    /** Most evidence items one party may add to a dispute. */
    public static final int MAX_EVIDENCE_PER_PARTY = 10;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private PaymentRules() {}

    /** The platform fee of {@code amount} at {@code percent} (0-100). */
    public static BigDecimal fee(BigDecimal amount, BigDecimal percent) {
        BigDecimal fee =
                amount.multiply(percent).divide(HUNDRED, 2, RoundingMode.HALF_UP).max(money(0));
        return fee.min(amount.setScale(2, RoundingMode.HALF_UP));
    }

    /**
     * What the seller receives when the payout is released after {@code refunded} went back to the
     * buyer: {@code retained - fee(retained)} with {@code retained = amount - refunded}.
     */
    public static BigDecimal payout(BigDecimal amount, BigDecimal refunded, BigDecimal percent) {
        BigDecimal retained = amount.subtract(refunded).max(money(0));
        return retained.subtract(fee(retained, percent)).setScale(2, RoundingMode.HALF_UP);
    }

    /** End of the dispute window of a trade shipped at {@code shippedAt}. */
    public static Instant windowEnd(Instant shippedAt, int windowDays) {
        return shippedAt.plus(Duration.ofDays(windowDays));
    }

    /**
     * Whether the buyer may open a dispute now: the payment is secured and not paid out, no dispute
     * exists, and the window (when the card was shipped) has not ended.
     */
    public static boolean disputeOpenable(
            PaymentStatus paymentStatus,
            boolean disputeExists,
            @Nullable Instant windowEndsAt,
            Instant now) {
        if (paymentStatus != PaymentStatus.SECURED || disputeExists) {
            return false;
        }
        return windowEndsAt == null || now.isBefore(windowEndsAt);
    }

    /** Whether an amount has at most two decimals and is positive. */
    public static boolean validAmount(@Nullable BigDecimal amount) {
        return amount != null
                && amount.signum() > 0
                && amount.stripTrailingZeros().scale() <= 2
                && amount.compareTo(new BigDecimal("9999999999.99")) <= 0;
    }

    /** Whether {@code amount} equals {@code other} as money. */
    public static boolean same(BigDecimal amount, BigDecimal other) {
        return amount.compareTo(other) == 0;
    }

    static BigDecimal money(long value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }
}
