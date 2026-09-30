package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Status of a dispute ({@code dispute.status}): OPEN when the buyer opens it, UNDER_REVIEW once an
 * admin works on it, FROZEN while an admin holds the case (no new evidence or messages from the
 * parties), then RESOLVED_BUYER, RESOLVED_SELLER or RESOLVED_SPLIT (CLOSED is reserved).
 */
@Schema(name = "DisputeStatus")
public enum DisputeStatus {
    OPEN,
    UNDER_REVIEW,
    FROZEN,
    RESOLVED_BUYER,
    RESOLVED_SELLER,
    RESOLVED_SPLIT,
    CLOSED;

    /** Whether the dispute still waits for a decision (the payout stays frozen). */
    public boolean isOpen() {
        return this == OPEN || this == UNDER_REVIEW || this == FROZEN;
    }
}
