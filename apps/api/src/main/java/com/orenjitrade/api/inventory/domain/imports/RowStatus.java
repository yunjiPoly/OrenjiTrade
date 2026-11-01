package com.orenjitrade.api.inventory.domain.imports;

/** What the catalog made of a row of an import. */
public enum RowStatus {
    /** The card is known and a printing is chosen. */
    READY,
    /** The card is known; the collector has to say which printing. */
    CHOOSE_PRINTING,
    /** Nothing in the catalog fits the row: it is reported and never imported. */
    UNMATCHED
}
