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
        @Nullable String imageUrl) {

    public static final String CARD = "CARD";
    public static final String PRINTING = "PRINTING";
}
