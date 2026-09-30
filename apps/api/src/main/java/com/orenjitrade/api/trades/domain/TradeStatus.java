package com.orenjitrade.api.trades.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Status of a trade (Phase 8 contract): AGREED (no payment protection) or AWAITING_PAYMENT, then
 * the Phase 9 protected flow PAID, SHIPPED, RECEIVED (or DISPUTED), and COMPLETED or CANCELLED.
 */
@Schema(name = "TradeStatus")
public enum TradeStatus {
    AGREED,
    AWAITING_PAYMENT,
    PAID,
    SHIPPED,
    RECEIVED,
    COMPLETED,
    CANCELLED,
    DISPUTED;

    /** Whether the trade still binds the parties (not COMPLETED or CANCELLED). */
    public boolean isOpen() {
        return this != COMPLETED && this != CANCELLED;
    }
}
