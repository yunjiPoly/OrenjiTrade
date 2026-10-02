package com.orenjitrade.api.cards.domain;

/**
 * Which artworks a catalog import stores in the local card image cache after the metadata (ADR
 * 0015). Metadata and image source references are always imported, whatever the mode.
 */
public enum ImageMode {
    /** No downloads. */
    NONE,
    /**
     * Artworks of cards that members reference: inventory items and binders, wishlists, offers and
     * trades, message and community card links (default).
     */
    REFERENCED,
    /** Every artwork of the game, referenced ones first, until the cache is full. */
    ALL,
    /** The first {@code imageLimit} artworks (referenced ones first, then by card name). */
    LIMIT
}
