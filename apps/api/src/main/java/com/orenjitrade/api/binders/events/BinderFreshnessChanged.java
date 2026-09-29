package com.orenjitrade.api.binders.events;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.time.Instant;
import java.util.UUID;

/**
 * The freshness state of a binder changed (freshness job, confirmation or policy change).
 *
 * @param binderId binder
 * @param ownerId owner
 * @param previousState state before
 * @param state new state
 * @param changedAt when
 */
public record BinderFreshnessChanged(
        UUID binderId,
        UUID ownerId,
        FreshnessState previousState,
        FreshnessState state,
        Instant changedAt) {}
