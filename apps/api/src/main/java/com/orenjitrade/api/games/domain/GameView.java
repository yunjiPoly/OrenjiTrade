package com.orenjitrade.api.games.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

/**
 * A supported game as other modules and clients see it ({@code GameResponse} in the contract).
 *
 * @param id game id
 * @param slug stable identifier ({@code yugioh}, {@code pokemon}, {@code mtg}, {@code riftbound})
 * @param name full name
 * @param shortName short display name
 * @param publisher publisher name
 * @param status ACTIVE or HIDDEN
 * @param sortOrder display order
 * @param schema vocabularies and metadata fields
 * @param updatedAt last change
 */
@Schema(name = "GameResponse", description = "Supported trading card game")
public record GameView(
        UUID id,
        @Schema(example = "yugioh") String slug,
        @Schema(example = "Yu-Gi-Oh! Trading Card Game") String name,
        @Schema(example = "Yu-Gi-Oh!") String shortName,
        @Schema(example = "Konami") String publisher,
        GameStatus status,
        int sortOrder,
        GameSchema schema,
        Instant updatedAt) {

    @JsonIgnore
    public boolean isActive() {
        return status == GameStatus.ACTIVE;
    }
}
