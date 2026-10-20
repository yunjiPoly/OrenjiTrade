package com.orenjitrade.api.cards.domain.scan;

/** What a scan match found (owner spec 2026-10-15, section 3.5). */
public enum ScanStatus {
    /** One card and one printing: the code exists in one rarity, or the card has one printing. */
    FOUND,
    /** One card and one code that comes in several rarities: the collector picks the rarity. */
    PICK_RARITY,
    /** The card is known but not the printing (the code was unreadable or matched none). */
    PICK_PRINTING,
    /** Nothing. */
    NOT_FOUND
}
