package com.orenjitrade.api.games.api;

import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code POST /api/v1/admin/games} (slug required) and {@code PUT
 * /api/v1/admin/games/{slug}} (slug ignored: slugs are immutable).
 */
@Schema(name = "GameRequest", description = "Game creation or change")
public record GameRequest(
        @Pattern(
                        regexp = "^[a-z0-9]+(-[a-z0-9]+)*$",
                        message = "must be lower-case letters and digits separated by dashes")
                @Size(min = 2, max = 32)
                @Schema(
                        example = "lorcana",
                        description = "Required on creation, ignored on update")
                @Nullable String slug,
        @NotBlank @Size(max = 80) String name,
        @NotBlank @Size(max = 24) String shortName,
        @NotNull @Size(max = 80) String publisher,
        @NotNull GameStatus status,
        @NotNull @Min(0) @Max(10_000) Integer sortOrder,
        @NotNull @Valid GameSchema schema) {

    public GameService.GameDraft toDraft() {
        return new GameService.GameDraft(name, shortName, publisher, status, sortOrder, schema);
    }
}
