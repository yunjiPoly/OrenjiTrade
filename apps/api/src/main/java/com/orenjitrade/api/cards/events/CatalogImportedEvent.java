package com.orenjitrade.api.cards.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published synchronously (outside any transaction) right after the metadata of a catalog import
 * was committed, before the image cache fill starts. Listeners run in the importing thread; the
 * local/dev demo seed uses it to add real printings to the demo binder so a {@code REFERENCED}
 * image fill picks them up (ADR 0015).
 *
 * @param runId the import run
 * @param provider provider id
 * @param gameSlug game slug
 * @param occurredAt commit time of the metadata
 */
public record CatalogImportedEvent(
        UUID runId, String provider, String gameSlug, Instant occurredAt) {}
