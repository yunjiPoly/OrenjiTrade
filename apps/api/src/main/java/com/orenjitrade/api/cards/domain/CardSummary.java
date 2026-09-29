package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Card in search results and lists.
 *
 * @param id card id
 * @param game game slug
 * @param name card name
 * @param slug URL slug (unique per game)
 * @param cardType main type
 * @param subtype sub type
 * @param primaryImageUrl front image of the earliest printing (placeholder when none)
 * @param printingCount number of printings
 * @param metadata the game's summary fields ({@code GameSchema.summaryFields}) only
 */
@Schema(name = "CardSummary", description = "Card in search results")
public record CardSummary(
        UUID id,
        @Schema(example = "yugioh") String game,
        @Schema(example = "Azure-Eyes Sky Dragon") String name,
        @Schema(example = "azure-eyes-sky-dragon") String slug,
        @Nullable String cardType,
        @Nullable String subtype,
        @Nullable String primaryImageUrl,
        int printingCount,
        Map<String, Object> metadata) {}
