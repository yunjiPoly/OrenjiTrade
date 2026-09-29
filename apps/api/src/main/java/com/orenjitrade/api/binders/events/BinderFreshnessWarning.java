package com.orenjitrade.api.binders.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Public listings will be hidden soon unless the owner confirms them ("Confirm your binder is still
 * available", notification types BINDER_STALE_WARNING, Phase 6). Emitted by the freshness job at
 * most once per binder (or per owner for unfiled items) and run, and at most once per listing and
 * confirmation cycle.
 *
 * @param ownerId owner to notify
 * @param binderId binder concerned, {@code null} for items without a binder
 * @param itemCount public items that are about to be hidden (0 when only the binder is concerned)
 * @param hidesAt earliest time at which one of the concerned listings is hidden
 * @param warnedAt when the warning was emitted
 */
public record BinderFreshnessWarning(
        UUID ownerId, @Nullable UUID binderId, int itemCount, Instant hidesAt, Instant warnedAt) {}
