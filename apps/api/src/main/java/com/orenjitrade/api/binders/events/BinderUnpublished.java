package com.orenjitrade.api.binders.events;

import java.time.Instant;
import java.util.UUID;

/**
 * A binder stopped being effectively public (unpublished, expired, hidden by freshness, deleted,
 * owner suspended or pending deletion). Emitted once per transition.
 *
 * @param binderId binder
 * @param ownerId owner
 * @param unpublishedAt when the transition was observed
 */
public record BinderUnpublished(UUID binderId, UUID ownerId, Instant unpublishedAt) {}
