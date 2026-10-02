package com.orenjitrade.api.cards.api;

import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code POST /api/v1/admin/catalog/sync} and {@code POST /internal/jobs/catalog-import}.
 *
 * @param gameSlug game to import
 * @param provider provider id ({@code mock} locally, {@code ygoprodeck} for the real Yu-Gi-Oh!
 *     catalog)
 * @param mode FULL or INCREMENTAL
 * @param imageMode image cache fill after the metadata (default: REFERENCED for providers that
 *     offer image downloads, NONE otherwise)
 * @param imageLimit number of artworks for {@code imageMode=LIMIT}
 */
@Schema(description = "Catalog sync request")
public record CatalogSyncRequest(
        @NotBlank @Size(max = 32) @Schema(example = "yugioh") String gameSlug,
        @NotBlank @Size(max = 32) @Schema(example = "ygoprodeck") String provider,
        @NotNull SyncMode mode,
        @Schema(
                        description =
                                "NONE, REFERENCED (artworks of cards members reference; default),"
                                        + " ALL (until the cache is full) or LIMIT (imageLimit"
                                        + " artworks)")
                @Nullable ImageMode imageMode,
        @Min(1) @Max(1_000_000) @Nullable Integer imageLimit) {}
