package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A card set.
 *
 * @param id set id
 * @param game game slug
 * @param code set code
 * @param name set name
 * @param releaseDate release date
 * @param totalCards number of cards in the set
 * @param series series / block
 * @param printingCount printings in the catalog
 */
@Schema(name = "SetSummary", description = "Card set")
public record SetSummary(
        UUID id,
        @Schema(example = "yugioh") String game,
        @Schema(example = "AZR") String code,
        @Schema(example = "Azure Dawn") String name,
        @Nullable LocalDate releaseDate,
        @Nullable Integer totalCards,
        @Nullable String series,
        int printingCount) {}
