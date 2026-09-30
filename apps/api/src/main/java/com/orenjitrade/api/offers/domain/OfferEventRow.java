package com.orenjitrade.api.offers.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One entry of an offer's history ({@code offer_event} row).
 *
 * @param id event id
 * @param offerId the proposal concerned
 * @param rootOfferId the first proposal of the chain
 * @param actorId the acting party, {@code null} for the expiry job
 * @param event what happened
 * @param snapshotJson the proposal after the event (JSON object)
 * @param reason optional decline / cancel reason
 * @param createdAt when
 */
public record OfferEventRow(
        UUID id,
        UUID offerId,
        UUID rootOfferId,
        @Nullable UUID actorId,
        OfferEventType event,
        String snapshotJson,
        @Nullable String reason,
        Instant createdAt) {}
