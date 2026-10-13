package com.orenjitrade.api.inventory.domain.imports;

/** How the printing of a row was chosen. */
public enum PrintingChoice {
    /** By the import: the row fits exactly one printing. */
    AUTO,
    /** By the collector, for this row. */
    MANUAL,
    /** By "use the most recent printing for all unchosen rows". */
    MOST_RECENT
}
