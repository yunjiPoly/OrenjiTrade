package com.orenjitrade.api.search.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Availability filter of discovery and card-holder searches (Phase 4 contract). Matches the items
 * an owner offers that way: TRADE also matches TRADE_OR_SALE items, SALE also matches TRADE_OR_SALE
 * items, TRADE_OR_SALE matches anything offered for trade or sale, ACCEPTS_OFFERS matches items
 * whose owner welcomes offers.
 */
@Schema(name = "SearchAvailability")
public enum SearchAvailability {
    TRADE("i.availability IN ('TRADE', 'TRADE_OR_SALE')"),
    SALE("i.availability IN ('SALE', 'TRADE_OR_SALE')"),
    TRADE_OR_SALE("i.availability IN ('TRADE', 'SALE', 'TRADE_OR_SALE')"),
    ACCEPTS_OFFERS("i.accepts_offers");

    private final String sql;

    SearchAvailability(String sql) {
        this.sql = sql;
    }

    /** SQL condition on {@code inventory_item i} (no parameters). */
    public String sql() {
        return sql;
    }
}
