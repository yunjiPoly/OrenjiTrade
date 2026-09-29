package com.orenjitrade.api.cards.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published (inside the requesting transaction) when an admin queues a catalog sync; the cards
 * module's listener runs the import asynchronously after commit.
 *
 * @param runId the QUEUED {@code catalog_sync_run}
 * @param occurredAt request time
 */
public record CatalogSyncRequestedEvent(UUID runId, Instant occurredAt) {}
