package com.orenjitrade.api.delisting.domain;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * The listing-pause part of the effective public visibility (Phase 7): while a pause is in force
 * ({@code user_responsiveness.paused_at} set, {@code paused_until} unset or in the future) none of
 * the collector's binders and items is public. The SQL fragment and the Java predicate express the
 * same rule; the binders module adds the fragment to its owner rule ({@code
 * PublicVisibilityRules}), so every public read re-evaluates it.
 */
public final class ListingPauseRules {

    /**
     * The owner aliased {@code u} (a {@code user_account} row) has no pause in force at {@code
     * :now}. A correlated lookup on the {@code user_responsiveness} primary key, so it works in
     * every query that has the owner alias, whatever its other joins.
     */
    public static final String NOT_PAUSED =
            "NOT EXISTS (SELECT 1 FROM user_responsiveness ur_pause WHERE ur_pause.user_id = u.id"
                    + " AND ur_pause.paused_at IS NOT NULL AND (ur_pause.paused_until IS NULL OR"
                    + " ur_pause.paused_until > :now))";

    private ListingPauseRules() {}

    /**
     * Whether a pause started at {@code pausedAt} (optionally ending) is in force at {@code now}.
     */
    public static boolean isPaused(
            @Nullable Instant pausedAt, @Nullable Instant pausedUntil, Instant now) {
        return pausedAt != null && (pausedUntil == null || pausedUntil.isAfter(now));
    }
}
