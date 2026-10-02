package com.orenjitrade.api.cards.domain.images;

import java.util.Set;
import java.util.UUID;

/**
 * Extension point of the cards module: modules whose data shows card pictures (inventory items and
 * binders, wishlists, offers and trades through their inventory items, private message and
 * community card links) report which printings and cards they reference, so an import in {@code
 * REFERENCED} image mode caches exactly the artworks members can see (ADR 0015). Implementations
 * read their own tables only.
 */
public interface CardImageReferenceSource {

    /** Short name for logs. */
    String name();

    /** Printings referenced by this module's rows. */
    Set<UUID> referencedPrintingIds();

    /** Cards referenced without a specific printing (e.g. "any printing" wishes). */
    default Set<UUID> referencedCardIds() {
        return Set.of();
    }
}
