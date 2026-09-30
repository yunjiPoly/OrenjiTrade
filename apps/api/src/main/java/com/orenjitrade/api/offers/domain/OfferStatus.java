package com.orenjitrade.api.offers.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Status of one proposal of an offer's counter chain (Phase 8 contract): OPEN (the buyer's first
 * proposal, waiting for the seller), COUNTERED (a counter-offer waiting for an answer, or a
 * proposal a counter-offer replaced), then ACCEPTED, DECLINED, CANCELLED or EXPIRED (terminal).
 */
@Schema(name = "OfferStatus")
public enum OfferStatus {
    OPEN,
    COUNTERED,
    ACCEPTED,
    DECLINED,
    CANCELLED,
    EXPIRED;

    /** Whether a live proposal in this status still waits for an answer. */
    public boolean isPending() {
        return this == OPEN || this == COUNTERED;
    }
}
