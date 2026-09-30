package com.orenjitrade.api.inventory.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** What the owner offers for an item. */
@Schema(name = "Availability")
public enum Availability {
    COLLECTION_ONLY,
    TRADE,
    SALE,
    TRADE_OR_SALE,
    NOT_AVAILABLE
}
