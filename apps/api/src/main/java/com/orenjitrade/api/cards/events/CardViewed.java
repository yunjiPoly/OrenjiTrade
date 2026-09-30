package com.orenjitrade.api.cards.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A card or printing detail page was served ({@code GET /cards/{id}}, {@code GET /printings/{id}}).
 * An in-process notification for the analytics module (plain listener, never persisted); catalog
 * ids are public, the viewer id is pseudonymised by the analytics module.
 *
 * @param viewerId the viewer, {@code null} for signed-out visitors
 * @param cardId the card
 * @param printingId the printing when a printing page was served
 * @param game game slug
 * @param occurredAt when
 */
public record CardViewed(
        @Nullable UUID viewerId,
        UUID cardId,
        @Nullable UUID printingId,
        String game,
        Instant occurredAt) {}
