package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Status of a protected payment ({@code payment.status}, Phase 9 contract): REQUIRES_ACTION until
 * the provider secures it, SECURED while the platform holds it for the trade, PAYOUT_PENDING /
 * PAID_OUT once released to the seller, REFUNDED / PARTIALLY_REFUNDED after refunds, FAILED or
 * CANCELLED before it was secured.
 */
@Schema(name = "PaymentStatus")
public enum PaymentStatus {
    REQUIRES_ACTION,
    SECURED,
    PAYOUT_PENDING,
    PAID_OUT,
    REFUNDED,
    PARTIALLY_REFUNDED,
    FAILED,
    CANCELLED;

    /** Whether the provider holds (or held) the buyer's money. */
    public boolean secured() {
        return this != REQUIRES_ACTION && this != FAILED && this != CANCELLED;
    }

    /** Whether the checkout is not paid yet (a new attempt or a cancellation is possible). */
    public boolean unpaid() {
        return this == REQUIRES_ACTION || this == FAILED || this == CANCELLED;
    }
}
