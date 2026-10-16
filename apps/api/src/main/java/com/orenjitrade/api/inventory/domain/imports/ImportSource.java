package com.orenjitrade.api.inventory.domain.imports;

/** Where an inventory import comes from ({@code inventory_import.source}). */
public enum ImportSource {
    /** A YDK deck file: passcodes per section, no printing, no condition. */
    YDK,
    /** A CSV file the collector exported from Collectr. */
    COLLECTR_CSV
}
