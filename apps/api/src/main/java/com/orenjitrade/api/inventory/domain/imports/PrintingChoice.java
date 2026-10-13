package com.orenjitrade.api.inventory.domain.imports;

/** How the printing of a row was chosen. */
public enum PrintingChoice {
    /** By the import: the row fits exactly one printing. */
    AUTO,
    /** By the collector, for this row. */
    MANUAL,
    /** By "use the most recent printing for all unchosen rows". */
    MOST_RECENT,
    /**
     * By that bulk action, for a card whose most recent set holds it in several editions or
     * finishes: the release date decides nothing between them, so the plain copy was taken (the
     * Unlimited edition, the normal finish: the one that claims least), and the row says so until
     * the collector confirms or changes it.
     */
    MOST_RECENT_ASSUMED
}
