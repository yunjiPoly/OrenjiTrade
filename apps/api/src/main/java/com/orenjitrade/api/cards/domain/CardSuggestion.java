package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Autocomplete entry of {@code GET /cards/suggest}: a card (name match) or a printing
 * (printing-code match).
 *
 * @param kind CARD or PRINTING
 * @param id card id
 * @param printingId the printing for PRINTING entries
 * @param name card name
 * @param game game slug
 * @param setCode set of the printing (earliest printing for CARD entries)
 * @param printingCode printing code (earliest printing for CARD entries)
 * @param imageUrl front image (placeholder when none)
 * @param setName name of the printing's set (PRINTING entries; stage R2)
 * @param rarity rarity of the printing (PRINTING entries; stage R2)
 * @param printingCount printings of the card (CARD entries; stage R2)
 * @param edition edition code of the printing (PRINTING entries; review fix 1 of stage R2: the
 *     printings that share a code differ by it, by the language or by the finish)
 * @param language ISO 639-1 language of the printing (PRINTING entries)
 * @param finish finish code of the printing (PRINTING entries)
 */
@Schema(name = "CardSuggestion", description = "Autocomplete entry (card or printing)")
public record CardSuggestion(
        @Schema(allowableValues = {"CARD", "PRINTING"}) String kind,
        UUID id,
        @Nullable UUID printingId,
        String name,
        String game,
        @Nullable String setCode,
        @Nullable String printingCode,
        @Nullable String imageUrl,
        @Schema(example = "Azure Dawn", nullable = true) @Nullable String setName,
        @Schema(example = "Ultra Rare", nullable = true) @Nullable String rarity,
        @Schema(example = "3", nullable = true) @Nullable Integer printingCount,
        @Schema(example = "FIRST_EDITION", nullable = true) @Nullable String edition,
        @Schema(example = "en", nullable = true) @Nullable String language,
        @Schema(example = "NORMAL", nullable = true) @Nullable String finish) {

    public static final String CARD = "CARD";
    public static final String PRINTING = "PRINTING";
}
