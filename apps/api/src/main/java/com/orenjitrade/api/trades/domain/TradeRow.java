package com.orenjitrade.api.trades.domain;

import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferRole;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One stored trade ({@code trade} row).
 *
 * @param id trade id
 * @param offerId the accepted proposal
 * @param itemId the seller's item ({@code null} after an account purge)
 * @param sellerId the item's owner
 * @param buyerId the offering collector
 * @param kind CASH, TRADE or MIXED
 * @param cashAmount cash part
 * @param currency currency of the cash part
 * @param status status
 * @param protectionEnabled payment protection (Phase 9)
 * @param meetup both parties marked an in-person meetup
 * @param buyerMeetupAt when the buyer marked the meetup
 * @param sellerMeetupAt when the seller marked the meetup
 * @param buyerConfirmedAt when the buyer confirmed the exchange
 * @param sellerConfirmedAt when the seller confirmed the exchange
 * @param cancelledBy the cancelling party
 * @param cancelReason the cancelling party's reason
 * @param cancelledAt cancellation
 * @param createdAt creation
 * @param updatedAt last change
 * @param completedAt completion
 * @param version optimistic lock (Phase 9 webhooks)
 */
public record TradeRow(
        UUID id,
        UUID offerId,
        @Nullable UUID itemId,
        UUID sellerId,
        UUID buyerId,
        OfferKind kind,
        @Nullable BigDecimal cashAmount,
        @Nullable String currency,
        TradeStatus status,
        boolean protectionEnabled,
        boolean meetup,
        @Nullable Instant buyerMeetupAt,
        @Nullable Instant sellerMeetupAt,
        @Nullable Instant buyerConfirmedAt,
        @Nullable Instant sellerConfirmedAt,
        @Nullable UUID cancelledBy,
        @Nullable String cancelReason,
        @Nullable Instant cancelledAt,
        Instant createdAt,
        Instant updatedAt,
        @Nullable Instant completedAt,
        int version) {

    public boolean involves(UUID userId) {
        return sellerId.equals(userId) || buyerId.equals(userId);
    }

    public @Nullable OfferRole roleOf(UUID userId) {
        if (buyerId.equals(userId)) {
            return OfferRole.BUYER;
        }
        return sellerId.equals(userId) ? OfferRole.SELLER : null;
    }

    public UUID partyOf(OfferRole role) {
        return role == OfferRole.BUYER ? buyerId : sellerId;
    }

    public boolean markedMeetup(OfferRole role) {
        return (role == OfferRole.BUYER ? buyerMeetupAt : sellerMeetupAt) != null;
    }

    public boolean confirmed(OfferRole role) {
        return (role == OfferRole.BUYER ? buyerConfirmedAt : sellerConfirmedAt) != null;
    }
}
