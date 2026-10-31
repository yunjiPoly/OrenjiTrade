package com.orenjitrade.api.cards.domain.scan;

/** Why a card is among the other matches of a scan. */
public enum ScanOtherMatchKind {
    /**
     * A printing code close to the one read belongs to it (one look-alike character away, the wider
     * look-alikes 3/8, 6/8, 5/6, 0/8 and 1/7 included), or the code read itself when several cards
     * fit.
     */
    CODE,
    /** Its name is close to the name read. */
    NAME
}
