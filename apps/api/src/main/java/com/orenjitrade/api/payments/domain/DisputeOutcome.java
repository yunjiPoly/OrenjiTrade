package com.orenjitrade.api.payments.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * An admin's decision on a dispute: BUYER (full refund, trade cancelled), SELLER (payout released,
 * trade completed) or SPLIT (part refunded, the rest paid out, trade completed).
 */
@Schema(name = "DisputeOutcome")
public enum DisputeOutcome {
    BUYER,
    SELLER,
    SPLIT;

    public DisputeStatus status() {
        return switch (this) {
            case BUYER -> DisputeStatus.RESOLVED_BUYER;
            case SELLER -> DisputeStatus.RESOLVED_SELLER;
            case SPLIT -> DisputeStatus.RESOLVED_SPLIT;
        };
    }
}
