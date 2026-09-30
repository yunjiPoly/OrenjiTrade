package com.orenjitrade.api.delisting.domain;

import org.jspecify.annotations.Nullable;

/** Rows of {@code inventory_freshness_event}. */
public enum FreshnessEventType {
    /** The listing will be hidden in {@code warn_before_hidden_days} days unless confirmed. */
    WARNED,
    AGED,
    STALED,
    HIDDEN,
    /** The listing left HIDDEN (owner confirmation, or a more lenient policy). */
    RESTORED;

    /**
     * The event recorded for a state change: {@link #RESTORED} when leaving HIDDEN, {@link #AGED} /
     * {@link #STALED} / {@link #HIDDEN} when getting older, {@code null} otherwise (no change, or a
     * younger state that was not HIDDEN).
     */
    public static @Nullable FreshnessEventType forTransition(
            FreshnessState from, FreshnessState to) {
        if (from == to) {
            return null;
        }
        if (from == FreshnessState.HIDDEN) {
            return RESTORED;
        }
        if (!to.isWorseThan(from)) {
            return null;
        }
        return switch (to) {
            case AGING -> AGED;
            case STALE -> STALED;
            case HIDDEN -> HIDDEN;
            case ACTIVE -> null;
        };
    }
}
