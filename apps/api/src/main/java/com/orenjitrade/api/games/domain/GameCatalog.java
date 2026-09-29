package com.orenjitrade.api.games.domain;

import java.util.List;

/**
 * The games module's service interface for game slugs ({@code yugioh}, {@code pokemon}, {@code
 * mtg}, {@code riftbound}). Until the Phase 2 catalogue lands it is backed by the {@code
 * orenji.games.slugs} property ({@code ConfiguredGameCatalog}); the database-backed catalogue will
 * replace that implementation without touching callers.
 */
public interface GameCatalog {

    /** Every supported game slug, in display order. */
    List<String> slugs();

    /** Whether {@code slug} names a supported game (exact, lower-case match). */
    default boolean isKnown(String slug) {
        return slugs().contains(slug);
    }
}
