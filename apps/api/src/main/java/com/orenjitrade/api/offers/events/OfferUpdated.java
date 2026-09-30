package com.orenjitrade.api.offers.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published inside the transaction of every later offer transition (Phase 8): COUNTERED (a new
 * proposal), ACCEPTED (with the new trade), DECLINED, CANCELLED and EXPIRED. Consumed after commit
 * for notifications, SYSTEM messages and analytics. Ids and codes only.
 *
 * @param offerId the proposal concerned (the new counter-offer for COUNTERED)
 * @param rootOfferId the first proposal of the chain
 * @param previousOfferId the answered proposal (COUNTERED only)
 * @param event COUNTERED, ACCEPTED, DECLINED, CANCELLED or EXPIRED
 * @param status the proposal's status after the event
 * @param kind CASH, TRADE or MIXED
 * @param actorId the acting party, {@code null} for the expiry job
 * @param sellerId the item's owner
 * @param buyerId the offering collector
 * @param tradeId the trade opened by an acceptance
 * @param round position of the proposal in its chain (1 = the buyer's first proposal)
 * @param occurredAt when
 */
public record OfferUpdated(
        UUID offerId,
        UUID rootOfferId,
        @Nullable UUID previousOfferId,
        String event,
        String status,
        String kind,
        @Nullable UUID actorId,
        UUID sellerId,
        UUID buyerId,
        @Nullable UUID tradeId,
        int round,
        Instant occurredAt) {}
