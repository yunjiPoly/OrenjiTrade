package com.orenjitrade.api.cards.domain;

/** Lifecycle of a {@code catalog_sync_run}. */
public enum SyncRunStatus {
    QUEUED,
    RUNNING,
    SUCCEEDED,
    FAILED
}
