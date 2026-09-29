package com.orenjitrade.api.location.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Where the trading-area centre came from. The server snaps both kinds identically. */
@Schema(name = "TradingAreaSource")
public enum TradingAreaSource {
    /** Picked on the map or chosen from a region list. */
    MANUAL,
    /** Suggested by the device location (only recorded; never stored as a precise home point). */
    DEVICE
}
