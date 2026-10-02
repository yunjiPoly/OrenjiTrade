package com.orenjitrade.api.cards.domain.images;

import java.util.List;

/**
 * Outcome of filling the cache for a catalog import (ADR 0015).
 *
 * @param selected artworks the image mode selected
 * @param alreadyCached selected artworks that were cached before
 * @param downloaded artworks downloaded and stored as a new file
 * @param deduplicated artworks downloaded whose rendition was identical to a cached file (no second
 *     file)
 * @param skippedCacheFull selected artworks not downloaded because the cache was full
 * @param failed downloads that failed (provider error, invalid content, timeouts)
 * @param missingAtSource artworks the provider no longer has (404/410)
 * @param notDownloadable artworks whose provider offers no downloads
 * @param bytesDownloaded bytes received from the provider
 * @param cacheLimitReached whether the cache limit stopped the fill
 * @param errors first client-safe error messages
 */
public record ImageFillResult(
        int selected,
        int alreadyCached,
        int downloaded,
        int deduplicated,
        int skippedCacheFull,
        int failed,
        int missingAtSource,
        int notDownloadable,
        long bytesDownloaded,
        boolean cacheLimitReached,
        List<String> errors) {

    public static ImageFillResult none() {
        return new ImageFillResult(0, 0, 0, 0, 0, 0, 0, 0, 0, false, List.of());
    }
}
