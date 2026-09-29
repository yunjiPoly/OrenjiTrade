package com.orenjitrade.api.cards.domain.provider;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * A printing as a {@link CardProvider} describes it.
 *
 * @param externalId provider id of the printing
 * @param externalCardId provider id of the card
 * @param setCode code of the set (matches a {@link ProviderSet#code()})
 * @param collectorNumber collector number within the set
 * @param rarity rarity label
 * @param edition edition code (FIRST_EDITION, UNLIMITED, ...)
 * @param language ISO 639-1 code
 * @param finish finish code (NORMAL, FOIL, HOLO, ...)
 * @param printingCode code printed on the card (e.g. {@code LOB-EN001})
 * @param metadata printing-specific attributes
 * @param images images of the printing
 * @param marketPrice indicative market price
 */
public record ProviderPrinting(
        String externalId,
        String externalCardId,
        String setCode,
        String collectorNumber,
        @Nullable String rarity,
        String edition,
        String language,
        String finish,
        @Nullable String printingCode,
        Map<String, Object> metadata,
        List<ProviderImage> images,
        @Nullable ProviderMarketPrice marketPrice) {

    public ProviderPrinting {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        images = images == null ? List.of() : List.copyOf(images);
    }
}
