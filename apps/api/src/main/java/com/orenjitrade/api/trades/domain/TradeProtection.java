package com.orenjitrade.api.trades.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Extension point of the trades module implemented by the payments module (Phase 9): the payment,
 * shipment and dispute of protected trades for the trade page ({@code TradeResponse.payment},
 * {@code shipment}, {@code dispute}) and whether the buyer may still open a dispute. Keeps the
 * dependency one-way (payments depends on trades).
 */
public interface TradeProtection {

    /** Protection state of the given trades at {@code now}, by trade id (absent: nothing yet). */
    Map<UUID, State> statesOf(Collection<UUID> tradeIds, Instant now);

    /**
     * Protection state of one trade.
     *
     * @param payment the protected payment, if created
     * @param shipment the seller's shipping confirmation, if shipped
     * @param dispute the dispute, if opened
     * @param disputeOpenable whether the buyer may open a dispute now (PAID or SHIPPED within the
     *     dispute window, no dispute yet)
     */
    record State(
            @Nullable Payment payment,
            @Nullable Shipment shipment,
            @Nullable Dispute dispute,
            boolean disputeOpenable) {}

    /**
     * The protected payment of a trade.
     *
     * @param id payment id
     * @param provider provider id ({@code fake}, {@code stripe})
     * @param status payment status
     * @param amount amount paid by the buyer
     * @param currency ISO currency
     * @param platformFee fee kept by the platform
     * @param sellerAmount what the seller receives with a full payout
     * @param refundedAmount refunded to the buyer so far
     * @param payoutAmount released to the seller, once released
     * @param payoutFrozen held by an open dispute
     * @param checkoutUrl where the buyer completes an unpaid checkout
     * @param securedAt when the provider secured the payment
     * @param disputeWindowEndsAt end of the dispute window (after shipment)
     * @param payoutReleasedAt when the payout was released
     * @param refundedAt last refund
     */
    record Payment(
            UUID id,
            String provider,
            String status,
            BigDecimal amount,
            String currency,
            BigDecimal platformFee,
            BigDecimal sellerAmount,
            BigDecimal refundedAmount,
            @Nullable BigDecimal payoutAmount,
            boolean payoutFrozen,
            @Nullable String checkoutUrl,
            @Nullable Instant securedAt,
            @Nullable Instant disputeWindowEndsAt,
            @Nullable Instant payoutReleasedAt,
            @Nullable Instant refundedAt) {}

    /**
     * The seller's shipping confirmation.
     *
     * @param carrier carrier name
     * @param trackingNumber tracking number
     * @param notes the seller's notes
     * @param shippedAt when shipped
     * @param deliveredAt when receipt was confirmed
     */
    record Shipment(
            @Nullable String carrier,
            @Nullable String trackingNumber,
            @Nullable String notes,
            Instant shippedAt,
            @Nullable Instant deliveredAt) {}

    /**
     * The dispute of a trade.
     *
     * @param id dispute id
     * @param status dispute status
     * @param reason reason given by the buyer
     * @param openedAt when opened
     * @param resolvedAt when resolved
     * @param refundAmount refunded by the resolution
     */
    record Dispute(
            UUID id,
            String status,
            String reason,
            Instant openedAt,
            @Nullable Instant resolvedAt,
            @Nullable BigDecimal refundAmount) {}

    /** No payments module: trades have no protection state. */
    TradeProtection NONE = (tradeIds, now) -> Map.of();
}
