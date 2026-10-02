package com.orenjitrade.api.cards.domain.images;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

/**
 * {@code orenji.card-images.cache.*}: the capped local card image cache (ADR 0015).
 *
 * <p>The cache never holds more than {@code maxMb} megabytes of image files (final files, temporary
 * download files and outstanding reservations together). {@code maxMb} comes from {@code
 * CARD_IMAGE_LOCAL_CACHE_MAX_MB} (default {@value #MAX_ALLOWED_MB}); values above {@value
 * #MAX_ALLOWED_MB} are refused at start-up (never silently lowered), smaller values are allowed.
 *
 * @param maxMb capacity in MiB (1 to {@value #MAX_ALLOWED_MB})
 * @param dir cache directory ({@code CARD_IMAGE_CACHE_DIR}, default {@code
 *     <STORAGE_LOCAL_ROOT>/card-images}); one directory per database
 * @param targetWidth width of the single stored rendition in pixels (never upscaled)
 * @param jpegQuality JPEG quality of the re-encoded rendition (the JVM has no WebP encoder)
 * @param maxDownloadSize largest accepted download per image; also the reservation when the
 *     provider announces no {@code Content-Length}
 * @param maxParallelDownloads concurrent downloads (all providers together)
 * @param reservationTtl lifetime of a capacity reservation; expired ones are reclaimed, so a crash
 *     cannot leak capacity (must exceed {@code downloadTimeout})
 * @param downloadTimeout deadline of one download (opening, streaming and processing)
 * @param maxAttempts download attempts of one image when the connection drops mid-stream
 * @param failedRetryAfter on-demand fills skip images that failed more recently than this
 * @param reconcileOnStartup reconcile files, rows and accounting when the API starts
 */
@ConfigurationProperties(prefix = "orenji.card-images.cache")
public record CardImageCacheProperties(
        @DefaultValue("500") int maxMb,
        @DefaultValue("./.local-storage/card-images") String dir,
        @DefaultValue("320") int targetWidth,
        @DefaultValue("0.82") float jpegQuality,
        @DefaultValue("2MB") DataSize maxDownloadSize,
        @DefaultValue("4") int maxParallelDownloads,
        @DefaultValue("10m") Duration reservationTtl,
        @DefaultValue("60s") Duration downloadTimeout,
        @DefaultValue("3") int maxAttempts,
        @DefaultValue("1h") Duration failedRetryAfter,
        @DefaultValue("true") boolean reconcileOnStartup) {

    /** Hard ceiling of the local image cache (owner requirement), in MiB. */
    public static final int MAX_ALLOWED_MB = 500;

    public static final long BYTES_PER_MB = 1024L * 1024L;

    public CardImageCacheProperties {
        if (maxMb < 1 || maxMb > MAX_ALLOWED_MB) {
            throw new IllegalArgumentException(
                    "CARD_IMAGE_LOCAL_CACHE_MAX_MB (orenji.card-images.cache.max-mb) must be"
                            + " between 1 and "
                            + MAX_ALLOWED_MB
                            + " (configured: "
                            + maxMb
                            + "); the local card image cache may never exceed "
                            + MAX_ALLOWED_MB
                            + " MB");
        }
        if (dir == null || dir.isBlank()) {
            throw new IllegalArgumentException("orenji.card-images.cache.dir must not be blank");
        }
        if (targetWidth < 64 || targetWidth > 1200) {
            throw new IllegalArgumentException(
                    "orenji.card-images.cache.target-width must be between 64 and 1200");
        }
        if (!(jpegQuality >= 0.3f && jpegQuality <= 1.0f)) {
            throw new IllegalArgumentException(
                    "orenji.card-images.cache.jpeg-quality must be between 0.3 and 1.0");
        }
        if (maxDownloadSize == null
                || maxDownloadSize.toBytes() < 1024
                || maxDownloadSize.toBytes() > 20L * BYTES_PER_MB) {
            throw new IllegalArgumentException(
                    "orenji.card-images.cache.max-download-size must be between 1KB and 20MB");
        }
        if (maxParallelDownloads < 1 || maxParallelDownloads > 16) {
            throw new IllegalArgumentException(
                    "orenji.card-images.cache.max-parallel-downloads must be between 1 and 16");
        }
        if (maxAttempts < 1 || maxAttempts > 5) {
            throw new IllegalArgumentException(
                    "orenji.card-images.cache.max-attempts must be between 1 and 5");
        }
        if (downloadTimeout == null || reservationTtl == null || failedRetryAfter == null) {
            throw new IllegalArgumentException("orenji.card-images.cache durations are required");
        }
        if (reservationTtl.compareTo(downloadTimeout.multipliedBy(2)) < 0) {
            throw new IllegalArgumentException(
                    "orenji.card-images.cache.reservation-ttl must be at least twice the download"
                            + " timeout");
        }
    }

    /** Capacity in bytes. */
    public long limitBytes() {
        return maxMb * BYTES_PER_MB;
    }

    public long maxDownloadBytes() {
        return maxDownloadSize.toBytes();
    }
}
