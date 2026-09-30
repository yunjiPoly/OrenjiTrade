package com.orenjitrade.api.trades.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published inside the transaction of every trade change (Phase 8): CREATED, MEETUP_PROPOSED,
 * MEETUP_AGREED, COMPLETION_CONFIRMED, COMPLETED, CANCELLED. Consumed after commit for TRADE_UPDATE
 * notifications, SYSTEM messages and analytics; Phase 9 reacts to it for payments. Ids and codes
 * only.
 *
 * @param tradeId the trade
 * @param offerId the accepted proposal
 * @param event what happened
 * @param status the trade's status after the event
 * @param kind CASH, TRADE or MIXED
 * @param actorId the acting party, {@code null} for the platform
 * @param sellerId the seller
 * @param buyerId the buyer
 * @param protectionEnabled payment protection
 * @param meetup in-person meetup agreed
 * @param occurredAt when
 */
public record TradeUpdated(
        UUID tradeId,
        UUID offerId,
        String event,
        String status,
        String kind,
        @Nullable UUID actorId,
        UUID sellerId,
        UUID buyerId,
        boolean protectionEnabled,
        boolean meetup,
        Instant occurredAt) {}
