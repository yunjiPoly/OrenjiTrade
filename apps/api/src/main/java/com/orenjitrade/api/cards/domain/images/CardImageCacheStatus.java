package com.orenjitrade.api.cards.domain.images;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * State of the local card image cache (admin console, {@code npm run card-images:status}). Sizes in
 * bytes and MiB; {@code usedBytes + reservedBytes + remainingBytes = limitBytes} unless the limit
 * was lowered below the current content.
 *
 * @param usedBytes bytes of the final files
 * @param reservedBytes capacity held by in-flight downloads
 * @param remainingBytes capacity still available
 * @param limitBytes configured capacity ({@code CARD_IMAGE_LOCAL_CACHE_MAX_MB}, at most 5 GB = 5120
 *     MiB, so byte figures are 64-bit)
 * @param usedMb used, MiB (2 decimals)
 * @param reservedMb reserved, MiB
 * @param remainingMb remaining, MiB
 * @param limitMb limit, MiB
 * @param files final files on disk (deduplicated images share one file)
 * @param activeReservations in-flight reservations
 * @param images provider artworks by cache status (NOT_CACHED, CACHED, FAILED, MISSING_AT_SOURCE)
 * @param games the same per game and provider
 * @param reconciledAt last reconciliation of files, rows and accounting
 */
@Schema(name = "CardImageCacheStatus", description = "Local card image cache state")
public record CardImageCacheStatus(
        @Schema(requiredMode = RequiredMode.REQUIRED) long usedBytes,
        @Schema(requiredMode = RequiredMode.REQUIRED) long reservedBytes,
        @Schema(requiredMode = RequiredMode.REQUIRED) long remainingBytes,
        @Schema(requiredMode = RequiredMode.REQUIRED) long limitBytes,
        @Schema(requiredMode = RequiredMode.REQUIRED) double usedMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) double reservedMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) double remainingMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) int limitMb,
        @Schema(requiredMode = RequiredMode.REQUIRED) int files,
        @Schema(requiredMode = RequiredMode.REQUIRED) long activeReservations,
        @Schema(requiredMode = RequiredMode.REQUIRED) Map<String, Long> images,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<GameImages> games,
        @Nullable Instant reconciledAt) {

    /**
     * Provider artworks of one game and provider.
     *
     * @param game game slug
     * @param provider provider id
     * @param images artworks by cache status
     * @param cachedBytes bytes of the cached files of these artworks (a file shared by deduplicated
     *     artworks counts once)
     */
    @Schema(name = "CardImageCacheGameStatus")
    public record GameImages(
            @Schema(requiredMode = RequiredMode.REQUIRED) String game,
            @Schema(requiredMode = RequiredMode.REQUIRED) String provider,
            @Schema(requiredMode = RequiredMode.REQUIRED) Map<String, Long> images,
            @Schema(requiredMode = RequiredMode.REQUIRED) long cachedBytes) {}

    /** Bytes → MiB with two decimals. */
    public static double mb(long bytes) {
        return Math.round(bytes * 100.0 / CardImageCacheProperties.BYTES_PER_MB) / 100.0;
    }
}
