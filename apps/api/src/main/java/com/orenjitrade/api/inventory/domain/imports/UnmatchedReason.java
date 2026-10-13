package com.orenjitrade.api.inventory.domain.imports;

/** Why a row of an import fits nothing in the catalog. */
public enum UnmatchedReason {
    /** YDK: no card has this passcode, as a card id or as an artwork id. */
    UNKNOWN_PASSCODE,
    /** CSV: no card has this name (in the row's game). */
    UNKNOWN_CARD,
    /** CSV: several cards fit and the row does not tell them apart. */
    AMBIGUOUS_CARD,
    /** CSV: the row names a game OrenjiTrade does not have. */
    UNKNOWN_GAME,
    /** The card is known but the catalog holds no printing of it. */
    NO_PRINTING,
    /** CSV: the quantity is not a number of copies. */
    INVALID_QUANTITY,
    /** The card left the catalog after the preview was made. */
    CARD_REMOVED
}
