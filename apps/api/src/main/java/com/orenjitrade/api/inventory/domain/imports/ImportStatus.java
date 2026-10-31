package com.orenjitrade.api.inventory.domain.imports;

/** Where an inventory import stands ({@code inventory_import.status}). */
public enum ImportStatus {
    /** A preview the collector can still edit, commit or discard. */
    PENDING,
    /** The commit has started: the rows are frozen and at least one chunk is written. */
    COMMITTING,
    /** Every chunk is written; the result is kept until the import expires. */
    COMMITTED
}
