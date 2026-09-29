package com.orenjitrade.api.cards.domain.provider;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * A card as a {@link CardProvider} describes it, with its printings.
 *
 * @param externalId provider id of the card
 * @param name card name
 * @param cardType main type (Monster, Pokémon, Creature, Unit, ...)
 * @param subtype sub type
 * @param text rules text
 * @param metadata game-specific attributes (see the game's GameSchema)
 * @param printings printings of the card
 */
public record ProviderCard(
        String externalId,
        String name,
        @Nullable String cardType,
        @Nullable String subtype,
        String text,
        Map<String, Object> metadata,
        List<ProviderPrinting> printings) {

    public ProviderCard {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        printings = printings == null ? List.of() : List.copyOf(printings);
        text = text == null ? "" : text;
    }
}
