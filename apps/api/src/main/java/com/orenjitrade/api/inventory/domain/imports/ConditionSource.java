package com.orenjitrade.api.inventory.domain.imports;

/** Where the condition of a row comes from. */
public enum ConditionSource {
    /**
     * The file names none: the lowest grade of the game, the one that claims least about the card.
     */
    DEFAULT,
    /** The file. */
    FILE,
    /** The collector, for this row. */
    EDITED
}
