package com.orenjitrade.api.cards.infra.scryfall;

import com.orenjitrade.api.cards.infra.http.HostRateLimiter;
import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.card-providers.scryfall.*}: the Scryfall adapter for Magic: The Gathering (ADR
 * 0021, docs/providers/scryfall.md). Documented API: base {@code https://api.scryfall.com/} ({@code
 * GET /bulk-data} lists the daily bulk files), bulk files on {@code https://data.scryfall.io/},
 * card images on {@code https://cards.scryfall.io/}. Scryfall asks for 50 to 100 ms between API
 * requests (at most 10 a second), a {@code User-Agent} and an {@code Accept} header on every call,
 * and the bulk files instead of per-card calls.
 *
 * @param enabled registers the provider
 * @param gameSlug the OrenjiTrade game the catalog is imported into
 * @param apiBaseUrl API base URL (ends with {@code /})
 * @param bulkType the bulk file imported ({@code unique_artwork}: one card object per artwork)
 * @param bulkBaseUrl where bulk files may be downloaded from (a {@code download_uri} elsewhere is
 *     refused)
 * @param imageBaseUrl where card images may be downloaded from (image URLs of the bulk file
 *     elsewhere are dropped); they stay server-side
 * @param imageVersion the image size downloaded for the cache ({@code normal}, 488 px wide JPEG,
 *     scaled to the 320 px rendition, never cropped)
 * @param userAgent descriptive {@code User-Agent} of every request
 * @param requestsPerSecond pacing per host (at most 10)
 * @param connectTimeout TCP connect timeout
 * @param readTimeout response timeout of API calls and the bulk download
 * @param imageReadTimeout response timeout of image downloads
 * @param maxAttempts attempts per request including the first (transient failures only)
 * @param initialBackoff first retry delay, doubled per attempt
 * @param maxBackoff longest computed retry delay
 * @param maxRetryAfter longest {@code Retry-After} honoured before giving up
 * @param snapshotDir where the raw bulk files are kept ({@code <dir>/<updated_at>/}, git-ignored)
 * @param snapshotOnly never call Scryfall: import the newest local bulk file (offline work)
 * @param refreshInterval a bulk file younger than this is reused without asking Scryfall (the files
 *     are refreshed at most daily)
 * @param maxBulkBytes largest bulk file accepted
 */
@ConfigurationProperties(prefix = "orenji.card-providers.scryfall")
public record ScryfallProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("mtg") String gameSlug,
        @DefaultValue("https://api.scryfall.com/") String apiBaseUrl,
        @DefaultValue("unique_artwork") String bulkType,
        @DefaultValue("https://data.scryfall.io/") String bulkBaseUrl,
        @DefaultValue("https://cards.scryfall.io/") String imageBaseUrl,
        @DefaultValue("normal") String imageVersion,
        @DefaultValue("OrenjiTrade-catalog-importer/0.1 (+https://www.orenjitrade.com)")
                String userAgent,
        @DefaultValue("8") double requestsPerSecond,
        @DefaultValue("5s") Duration connectTimeout,
        @DefaultValue("600s") Duration readTimeout,
        @DefaultValue("20s") Duration imageReadTimeout,
        @DefaultValue("4") int maxAttempts,
        @DefaultValue("1s") Duration initialBackoff,
        @DefaultValue("16s") Duration maxBackoff,
        @DefaultValue("120s") Duration maxRetryAfter,
        @DefaultValue("./.local-dev/provider-data/scryfall") String snapshotDir,
        @DefaultValue("false") boolean snapshotOnly,
        @DefaultValue("24h") Duration refreshInterval,
        @DefaultValue("1073741824") long maxBulkBytes) {

    /** Scryfall asks for 50 to 100 ms between requests. */
    public static final double MAX_REQUESTS_PER_SECOND = 10.0;

    static final Set<String> IMAGE_VERSIONS = Set.of("small", "normal", "large", "png");

    public ScryfallProperties {
        HostRateLimiter.validate(requestsPerSecond);
        if (requestsPerSecond > MAX_REQUESTS_PER_SECOND) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.requests-per-second must be at most 10"
                            + " (Scryfall asks for 50 to 100 ms between requests)");
        }
        apiBaseUrl = withSlash(requireHttp(apiBaseUrl, "api-base-url"));
        bulkBaseUrl = withSlash(requireHttp(bulkBaseUrl, "bulk-base-url"));
        imageBaseUrl = withSlash(requireHttp(imageBaseUrl, "image-base-url"));
        if (gameSlug == null || !gameSlug.matches("^[a-z0-9]+(-[a-z0-9]+)*$")) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.game-slug must be a game slug");
        }
        if (bulkType == null || !bulkType.matches("^[a-z_]{1,40}$")) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.bulk-type must be a bulk data type");
        }
        if (imageVersion == null || !IMAGE_VERSIONS.contains(imageVersion)) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.image-version must be one of "
                            + IMAGE_VERSIONS
                            + " (never a crop)");
        }
        if (userAgent == null || userAgent.isBlank()) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.user-agent must not be blank");
        }
        if (maxAttempts < 1 || maxAttempts > 10) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.max-attempts must be between 1 and 10");
        }
        if (refreshInterval == null || refreshInterval.compareTo(Duration.ofHours(24)) < 0) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.refresh-interval must be at least 24h"
                            + " (Scryfall's bulk files are refreshed at most daily)");
        }
        if (maxBulkBytes <= 0) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.scryfall.max-bulk-bytes must be positive");
        }
    }

    private static String requireHttp(String url, String name) {
        try {
            URI uri = URI.create(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if ((scheme.equals("https") || scheme.equals("http")) && uri.getHost() != null) {
                return url;
            }
        } catch (IllegalArgumentException e) {
            // reported below
        }
        throw new IllegalArgumentException(
                "orenji.card-providers.scryfall." + name + " must be an http(s) URL");
    }

    private static String withSlash(String url) {
        return url.endsWith("/") ? url : url + "/";
    }
}
