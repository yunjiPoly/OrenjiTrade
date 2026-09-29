package com.orenjitrade.api.inventory.events;

import java.time.Instant;
import java.util.UUID;

/**
 * An inventory item stopped being effectively public (made private, expired, hidden by freshness,
 * deleted, binder unpublished or deleted, owner suspended, pending deletion or no longer
 * discoverable). Emitted exactly once per transition.
 *
 * @param itemId item
 * @param ownerId owner
 * @param unpublishedAt when the transition was observed
 */
public record InventoryItemUnpublished(UUID itemId, UUID ownerId, Instant unpublishedAt) {}
