package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Report of a catalog import run ({@code catalog_sync_run.report}, ADR 0015): metadata counts,
 * image cache fill and cache figures. Client-safe: never provider URLs or stack traces.
 *
 * @param provider provider id
 * @param providerDbVersion provider catalog version (YGOPRODeck {@code database_version})
 * @param imageMode NONE, REFERENCED, ALL or LIMIT
 * @param imageLimit artworks of a LIMIT run
 * @param totalCardsProcessed cards the provider delivered
 * @param cardsCreated new cards
 * @param cardsUpdated existing cards whose values or artworks changed
 * @param cardsUnchanged existing cards left untouched
 * @param cardsFailed cards skipped because of an error (listed in {@code errors})
 * @param setsUpserted sets inserted or changed
 * @param printingsUpserted printings inserted or changed
 * @param printingsSkipped printings skipped (invalid or conflicting provider data)
 * @param imagesReferenced provider artworks known for the game (source references stored, cached or
 *     not)
 * @param imagesSelected artworks the image mode selected for the cache
 * @param imagesAlreadyCached selected artworks already cached
 * @param imagesDownloaded selected artworks downloaded into a new file
 * @param imagesDeduplicated selected artworks identical to an already cached file
 * @param imagesSkippedCacheFull selected artworks skipped because the cache limit was reached
 * @param imagesFailed downloads that failed
 * @param imagesMissingAtSource artworks the provider no longer has
 * @param bytesDownloaded bytes received from the provider for images
 * @param cacheUsedMb cache usage after the run, MiB
 * @param cacheReservedMb capacity still reserved by in-flight downloads, MiB
 * @param cacheLimitMb cache limit, MiB
 * @param cacheLimitReached whether the limit stopped the image fill
 * @param durationSeconds run duration
 * @param errors first errors (truncated)
 * @param warnings provider data notes (skipped rows)
 */
@Schema(name = "CatalogImportReport", description = "Catalog import report")
public record CatalogImportReport(
        @Schema(requiredMode = RequiredMode.REQUIRED) String provider,
        @Nullable String providerDbVersion,
        @Schema(requiredMode = RequiredMode.REQUIRED) ImageMode imageMode,
        @Nullable Integer imageLimit,
        @Schema(requiredMode = RequiredMode.REQUIRED) int totalCardsProcessed,
        @Schema(requiredMode = RequiredMode.REQUIRED) int cardsCreated,
        @Schema(requiredMode = RequiredMode.REQUIRED) int cardsUpdated,
        @Schema(requiredMode = RequiredMode.REQUIRED) int cardsUnchanged,
        @Schema(requiredMode = RequiredMode.REQUIRED) int cardsFailed,
        @Schema(requiredMode = RequiredMode.REQUIRED) int setsUpserted,
        @Schema(requiredMode = RequiredMode.REQUIRED) int printingsUpserted,
        @Schema(requiredMode = RequiredMode.REQUIRED) int printingsSkipped,
        @Schema(requiredMode = RequiredMode.REQUIRED) long imagesReferenced,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesSelected,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesAlreadyCached,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesDownloaded,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesDeduplicated,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesSkippedCacheFull,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesFailed,
        @Schema(requiredMode = RequiredMode.REQUIRED) int imagesMissingAtSource,
        @Schema(requiredMode = RequiredMode.REQUIRED) long bytesDownloaded,
        @Schema(requiredMode = RequiredMode.REQUIRED) double cacheUsedMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) double cacheReservedMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) int cacheLimitMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean cacheLimitReached,
        @Schema(requiredMode = RequiredMode.REQUIRED) double durationSeconds,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<String> errors,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<String> warnings) {

    /** Errors and warnings kept in a report. */
    public static final int MAX_MESSAGES = 50;

    public CatalogImportReport {
        errors = errors == null ? List.of() : List.copyOf(errors);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
