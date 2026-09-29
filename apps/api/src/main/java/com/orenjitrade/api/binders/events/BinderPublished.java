package com.orenjitrade.api.binders.events;

import java.time.Instant;
import java.util.UUID;

/**
 * A binder became effectively public (published, owner became listed, restored from HIDDEN).
 * Emitted once per transition, inside the transaction that caused it.
 *
 * @param binderId binder
 * @param ownerId owner
 * @param publishedAt when the transition happened
 */
public record BinderPublished(UUID binderId, UUID ownerId, Instant publishedAt) {}
