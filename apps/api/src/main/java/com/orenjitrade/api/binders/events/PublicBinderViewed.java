package com.orenjitrade.api.binders.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A public binder was opened by someone other than its owner ({@code GET /public/binders/{id}}),
 * after the binder-view limit accepted the view. An in-process notification for the analytics
 * module (plain listener, never persisted); no coordinates, only the owner's public region label.
 *
 * @param viewerId the viewer, {@code null} for signed-out visitors
 * @param binderId the binder
 * @param ownerId its owner
 * @param regionLabel the owner's public region label while discoverable
 * @param occurredAt when
 */
public record PublicBinderViewed(
        @Nullable UUID viewerId,
        UUID binderId,
        UUID ownerId,
        @Nullable String regionLabel,
        Instant occurredAt) {}
