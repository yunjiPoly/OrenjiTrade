package com.orenjitrade.api.wishlist.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * How a collector wants to get a wished card: {@code ANY} availability, items offered for {@code
 * TRADE} (TRADE, TRADE_OR_SALE) or for {@code SALE} (SALE, TRADE_OR_SALE).
 */
@Schema(name = "TradePreference")
public enum TradePreference {
    ANY,
    TRADE,
    SALE
}
