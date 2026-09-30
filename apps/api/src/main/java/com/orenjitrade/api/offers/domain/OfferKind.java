package com.orenjitrade.api.offers.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What the buyer offers: cash, cards from their inventory, or both. */
@Schema(name = "OfferKind")
public enum OfferKind {
    CASH,
    TRADE,
    MIXED;

    /** Whether the offer has a cash part. */
    public boolean hasCash() {
        return this != TRADE;
    }

    /** Whether the offer has cards in trade. */
    public boolean hasTradeItems() {
        return this != CASH;
    }
}
