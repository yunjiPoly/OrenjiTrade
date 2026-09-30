package com.orenjitrade.api.trades.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.EnumSet;
import java.util.Set;

/**
 * Entry of a trade's timeline ({@code trade_event.event}): the Phase 8 events and the payment,
 * shipping and dispute events of Phase 9 (recorded by the payments module through {@link
 * TradeService}).
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
    /** Both parties confirmed (or the protected payout was released): the trade is complete. */
    COMPLETED,
    /** A party cancelled before any payment, or the platform after a full refund. */
    CANCELLED,
    /** Phase 9: the buyer started (or restarted) the protected checkout. */
    PAYMENT_STARTED,
    /** Phase 9: the provider reported a failed payment; the buyer may pay again. */
    PAYMENT_FAILED,
    /** Phase 9: an unpaid checkout was cancelled (trade cancelled or meetup agreed). */
    PAYMENT_CANCELLED,
    /** Phase 9: the provider secured the payment (AWAITING_PAYMENT to PAID). */
    PAYMENT_SECURED,
    /** Phase 9: the seller shipped the card (PAID to SHIPPED; the dispute window starts). */
    SHIPPED,
    /**
     * Phase 9: the buyer confirmed receipt, or the dispute window ran out (SHIPPED to RECEIVED).
     */
    RECEIPT_CONFIRMED,
    /** Phase 9: the seller's payout was released. */
    PAYOUT_RELEASED,
    /** Phase 9: the buyer opened a dispute (PAID or SHIPPED to DISPUTED; payout frozen). */
    DISPUTE_OPENED,
    /** Phase 9: an admin resolved the dispute. */
    DISPUTE_RESOLVED,
    /** Phase 9: money went back to the buyer. */
    REFUNDED;

    /** The Phase 9 payment, shipping and dispute events (notified by the payments module). */
    public static final Set<TradeEventType> PROTECTED_FLOW =
            EnumSet.of(
                    PAYMENT_STARTED,
                    PAYMENT_FAILED,
                    PAYMENT_CANCELLED,
                    PAYMENT_SECURED,
                    SHIPPED,
                    RECEIPT_CONFIRMED,
                    PAYOUT_RELEASED,
                    DISPUTE_OPENED,
                    DISPUTE_RESOLVED,
                    REFUNDED);
}
