package com.orenjitrade.api.cards.domain.provider;

import java.time.LocalDate;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * A set as a {@link CardProvider} describes it.
 *
 * @param externalId provider id of the set
 * @param code set code (upper-cased on import)
 * @param name set name
 * @param releaseDate release date
 * @param totalCards number of cards in the set
 * @param series series / block
 * @param metadata game-specific set attributes
 */
public record ProviderSet(
        String externalId,
        String code,
        String name,
        @Nullable LocalDate releaseDate,
        @Nullable Integer totalCards,
        @Nullable String series,
        Map<String, Object> metadata) {

    public ProviderSet {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
