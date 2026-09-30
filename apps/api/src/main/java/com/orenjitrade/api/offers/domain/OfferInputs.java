package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Inputs of the offer actions (validated by {@link OfferService}). */
public final class OfferInputs {

    private OfferInputs() {}

    /**
     * {@code POST /offers}.
     *
     * @param itemId the seller's public inventory item
     * @param kind CASH, TRADE or MIXED ({@code null}: derived from the cash amount and the cards)
     * @param cashAmount cash part
     * @param currency ISO 4217 code of the cash part (default: the item's currency)
     * @param tradeItems the buyer's own cards in trade
     * @param message optional note (at most 500 characters)
     * @param expiresInHours 1-168 (default 72)
     * @param protectionRequested ask for payment protection (needs a cash part and the
     *     protectedPayments flag)
     */
    public record Create(
            UUID itemId,
            @Nullable OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            List<TradeLine> tradeItems,
            @Nullable String message,
            @Nullable Integer expiresInHours,
            boolean protectionRequested) {

        public Create {
            tradeItems = List.copyOf(tradeItems);
        }
    }

    /**
     * {@code POST /offers/{id}/counter}. Without {@code kind}, absent parts keep the current
     * proposal's values and the kind follows the parts (adding cards to a cash offer makes it
     * MIXED, an empty card list makes a MIXED offer CASH); with {@code kind}, the terms are exactly
     * the given parts.
     *
     * @param kind explicit kind of the counter-offer
     * @param cashAmount new cash part
     * @param currency currency of the cash part
     * @param tradeItems new list of the buyer's cards
     * @param message optional note (at most 500 characters)
     * @param expiresInHours 1-168 (default 72)
     * @param version the version the caller saw (409 STALE_OFFER when it changed)
     */
    public record Counter(
            @Nullable OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            @Nullable List<TradeLine> tradeItems,
            @Nullable String message,
            @Nullable Integer expiresInHours,
            @Nullable Integer version) {}
}
