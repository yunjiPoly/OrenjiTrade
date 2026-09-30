package com.orenjitrade.api.offers.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** A party of an offer or a trade (also the {@code current_turn} of an offer). */
@Schema(name = "OfferRole")
public enum OfferRole {
    BUYER,
    SELLER;

    public OfferRole other() {
        return this == BUYER ? SELLER : BUYER;
    }
}
