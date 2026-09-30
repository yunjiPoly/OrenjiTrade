package com.orenjitrade.api.trades.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Entry of a trade's timeline ({@code trade_event.event}; Phase 9 adds its payment, shipping and
 * dispute events to this list).
 */
@Schema(name = "TradeEventType")
public enum TradeEventType {
    /** The trade was opened by an accepted offer. */
    CREATED,
    /** One party marked the trade as an in-person meetup. */
    MEETUP_PROPOSED,
    /** Both parties marked the meetup. */
    MEETUP_AGREED,
    /** An agreed meetup dropped payment protection (AWAITING_PAYMENT back to AGREED). */
    PROTECTION_REMOVED,
    /** One party confirmed the exchange. */
    COMPLETION_CONFIRMED,
    /** Both parties confirmed: inventory transferred, interaction recorded. */
    COMPLETED,
    /** A party cancelled before any payment. */
    CANCELLED
}
