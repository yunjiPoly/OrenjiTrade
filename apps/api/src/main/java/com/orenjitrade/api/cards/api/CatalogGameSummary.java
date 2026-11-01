package com.orenjitrade.api.cards.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.cards.domain.SyncRunView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * One game of the console's "Games and sources" (spec 15.6, board A12; web stage WH2): what the
 * catalogue holds, the sources that serve it and its newest sync run.
 *
 * @param game the game's slug
 * @param cards cards in the catalogue
 * @param sets card sets
 * @param printings printings
 * @param providers the sources that serve the game (empty: "No source yet")
 * @param lastRun the newest sync run of the game, {@code null} when none ran
 */
@Schema(name = "CatalogGameSummary", description = "A game's catalogue and sources (admin)")
public record CatalogGameSummary(
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "13942") long cards,
        @Schema(requiredMode = RequiredMode.REQUIRED) long sets,
        @Schema(requiredMode = RequiredMode.REQUIRED) long printings,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<String> providers,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable SyncRunView lastRun) {}
