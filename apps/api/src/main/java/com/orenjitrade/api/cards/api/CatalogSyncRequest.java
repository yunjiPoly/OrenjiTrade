package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.provider.SyncMode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/v1/admin/catalog/sync}.
 *
 * @param gameSlug game to import
 * @param provider provider id ({@code mock} locally)
 * @param mode FULL or INCREMENTAL
 */
@Schema(description = "Catalog sync request")
public record CatalogSyncRequest(
        @NotBlank @Size(max = 32) @Schema(example = "yugioh") String gameSlug,
        @NotBlank @Size(max = 32) @Schema(example = "mock") String provider,
        @NotNull SyncMode mode) {}
