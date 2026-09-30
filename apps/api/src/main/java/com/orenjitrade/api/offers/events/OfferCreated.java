package com.orenjitrade.api.offers.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that stored a new offer (Phase 8): the seller's OFFER_RECEIVED
 * notification and the SYSTEM message in the pair conversation are produced after commit, analytics
 * counts it. Ids and codes only (never the message or amounts' free text).
 *
 * @param offerId the offer (root of its counter chain)
 * @param itemId the seller's inventory item
 * @param sellerId the item's owner
 * @param buyerId the offering collector
 * @param kind CASH, TRADE or MIXED
 * @param game game slug of the card
 * @param hasMessage whether the buyer wrote a message
 * @param protectionRequested whether the buyer asked for payment protection
 * @param occurredAt when
 */
public record OfferCreated(
        UUID offerId,
        UUID itemId,
        UUID sellerId,
        UUID buyerId,
        String kind,
        String game,
        boolean hasMessage,
        boolean protectionRequested,
        Instant occurredAt) {}
