package com.orenjitrade.api.inventory.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Publicly listed items were hidden by the freshness job because nobody confirmed them (HIDDEN,
 * notification type BINDER_HIDDEN, Phase 6). Emitted once per run and group of items (binder, or
 * the owner's unfiled items), inside the job's transaction. Carries ids and a count only.
 *
 * @param ownerId owner to notify
 * @param binderId binder of the items, {@code null} for unfiled items
 * @param itemCount items hidden in this run
 * @param hiddenAt when the job hid them
 */
public record InventoryListingsHidden(
        UUID ownerId, @Nullable UUID binderId, int itemCount, Instant hiddenAt) {}
