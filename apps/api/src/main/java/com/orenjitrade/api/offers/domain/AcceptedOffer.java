package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.offers.domain.OfferTerms.TradeLine;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * An accepted proposal handed to {@link AcceptedOfferHandler#openTrade}.
 *
 * @param offerId the accepted proposal
 * @param rootOfferId the first proposal of its chain
 * @param itemId the seller's inventory item
 * @param itemQuantity copies of the item in the seller's inventory right now
 * @param sellerId the item's owner
 * @param buyerId the offering collector
 * @param kind CASH, TRADE or MIXED
 * @param cashAmount cash part
 * @param currency currency of the cash part
 * @param protectionRequested whether the buyer asked for payment protection
 * @param tradeItems the buyer's cards in trade
 * @param acceptedBy the accepting party
 * @param acceptedAt when
 */
public record AcceptedOffer(
        UUID offerId,
        UUID rootOfferId,
        UUID itemId,
        int itemQuantity,
        UUID sellerId,
        UUID buyerId,
        OfferKind kind,
        @Nullable BigDecimal cashAmount,
        @Nullable String currency,
        boolean protectionRequested,
        List<TradeLine> tradeItems,
        UUID acceptedBy,
        Instant acceptedAt) {

    public AcceptedOffer {
        tradeItems = List.copyOf(tradeItems);
    }
}
