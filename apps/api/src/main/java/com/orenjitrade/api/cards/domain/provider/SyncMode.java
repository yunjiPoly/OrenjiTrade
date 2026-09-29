package com.orenjitrade.api.cards.domain.provider;

/** Scope of a catalog sync. */
public enum SyncMode {
    /** Everything the provider knows for the game. */
    FULL,
    /**
     * Only what changed since the last successful sync (providers without change tracking return
     * everything).
     */
    INCREMENTAL
}
