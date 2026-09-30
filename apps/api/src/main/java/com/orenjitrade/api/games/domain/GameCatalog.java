package com.orenjitrade.api.games.domain;

import java.util.List;

/**
 * The games module's service interface for game slugs ({@code yugioh}, {@code pokemon}, {@code
 * mtg}, {@code riftbound}, ...). Backed by the {@code game} table ({@link GameService}): only
 * ACTIVE games are listed, so hiding a game in the admin console removes it from profile choices.
 */
public interface GameCatalog {

    /** Every supported game slug, in display order. */
    List<String> slugs();

    /** Whether {@code slug} names a supported game (exact, lower-case match). */
    default boolean isKnown(String slug) {
        return slugs().contains(slug);
    }
}
