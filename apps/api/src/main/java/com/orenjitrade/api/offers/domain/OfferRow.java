package com.orenjitrade.api.offers.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One stored proposal ({@code offer} row).
 *
 * @param id proposal id
 * @param rootOfferId first proposal of the chain (= id for the root)
 * @param parentOfferId the proposal this counter-offer answers
 * @param supersededBy the counter-offer that replaced this proposal
 * @param itemId the seller's inventory item ({@code null} after an account purge)
 * @param sellerId the item's owner
 * @param buyerId the offering collector
 * @param kind CASH, TRADE or MIXED
 * @param cashAmount cash part
 * @param currency currency of the cash part
 * @param status status
 * @param currentTurn the party expected to answer
 * @param message the proposing party's note
 * @param protectionRequested whether the buyer asked for payment protection
 * @param expiresAt expiry of the proposal
 * @param createdAt creation
 * @param updatedAt last transition
 * @param closedAt when it left the live states
 * @param version optimistic lock
 */
public record OfferRow(
        UUID id,
        UUID rootOfferId,
        @Nullable UUID parentOfferId,
        @Nullable UUID supersededBy,
        @Nullable UUID itemId,
        UUID sellerId,
        UUID buyerId,
        OfferKind kind,
        @Nullable BigDecimal cashAmount,
        @Nullable String currency,
        OfferStatus status,
        OfferRole currentTurn,
        @Nullable String message,
        boolean protectionRequested,
        Instant expiresAt,
        Instant createdAt,
        Instant updatedAt,
        @Nullable Instant closedAt,
        int version) {

    /** Whether a counter-offer replaced this proposal. */
    public boolean superseded() {
        return supersededBy != null;
    }

    /** Whether {@code userId} is the buyer or the seller. */
    public boolean involves(UUID userId) {
        return sellerId.equals(userId) || buyerId.equals(userId);
    }

    /** The role of a party ({@code null} for anybody else). */
    public @Nullable OfferRole roleOf(UUID userId) {
        if (buyerId.equals(userId)) {
            return OfferRole.BUYER;
        }
        return sellerId.equals(userId) ? OfferRole.SELLER : null;
    }

    /** The account of a role. */
    public UUID partyOf(OfferRole role) {
        return role == OfferRole.BUYER ? buyerId : sellerId;
    }

    /** The party who made this proposal (the other side answers it). */
    public OfferRole proposer() {
        return currentTurn.other();
    }
}
