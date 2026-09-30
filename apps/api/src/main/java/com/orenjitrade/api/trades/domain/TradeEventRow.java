package com.orenjitrade.api.trades.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One entry of a trade's timeline ({@code trade_event} row).
 *
 * @param id event id
 * @param tradeId the trade
 * @param actorId the acting party, {@code null} for the platform
 * @param event what happened (a {@link TradeEventType} name; Phase 9 adds more)
 * @param detailsJson event data (JSON object)
 * @param createdAt when
 */
public record TradeEventRow(
        UUID id,
        UUID tradeId,
        @Nullable UUID actorId,
        String event,
        String detailsJson,
        Instant createdAt) {}
