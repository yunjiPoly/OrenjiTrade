package com.orenjitrade.api.delisting.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Freshness of a public listing (item or binder), derived from its last owner confirmation and the
 * active {@link FreshnessPolicy}. {@link #HIDDEN} listings are not public until the owner confirms
 * them again; nothing is ever deleted.
 */
@Schema(
        name = "FreshnessState",
        description =
                "ACTIVE (recently confirmed), AGING, STALE (still public), HIDDEN (not public until"
                        + " confirmed)")
public enum FreshnessState {
    ACTIVE,
    AGING,
    STALE,
    HIDDEN;

    /** Whether the state is worse (older) than {@code other}. */
    public boolean isWorseThan(FreshnessState other) {
        return ordinal() > other.ordinal();
    }
}
