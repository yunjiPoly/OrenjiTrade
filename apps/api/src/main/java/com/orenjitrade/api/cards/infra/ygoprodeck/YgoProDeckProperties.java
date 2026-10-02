package com.orenjitrade.api.cards.infra.ygoprodeck;

import com.orenjitrade.api.cards.infra.http.HostRateLimiter;
import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.card-providers.ygoprodeck.*}: the YGOPRODeck adapter (ADR 0015,
 * docs/providers/ygoprodeck.md). Documented API: base {@code https://db.ygoprodeck.com/api/v7/}
 * ({@code checkDBVer.php}, {@code cardinfo.php}, {@code cardsets.php}), images under {@code
 * https://images.ygoprodeck.com/images/cards/<id>.jpg}. Rate limit 20 requests/second (an IP is
 * blocked for an hour above it): OrenjiTrade paces at {@code requestsPerSecond} per host (default
 * 5, refused above {@value HostRateLimiter#HARD_CEILING_PER_SECOND}).
 *
 * @param enabled registers the provider
 * @param gameSlug the OrenjiTrade game the catalog is imported into
 * @param apiBaseUrl API base URL (ends with {@code /})
 * @param imageBaseUrl base URL of the full-size card images (ends with {@code /}); artwork source
 *     URLs are {@code <imageBaseUrl><imageId>.jpg} and stay server-side
 * @param userAgent descriptive {@code User-Agent} of every request
 * @param requestsPerSecond pacing per host
 * @param connectTimeout TCP connect timeout
 * @param readTimeout response timeout of API calls ({@code cardinfo.php} is about 25 MB)
 * @param imageReadTimeout response timeout of image downloads
 * @param maxAttempts attempts per request including the first (transient failures only)
 * @param initialBackoff first retry delay, doubled per attempt
 * @param maxBackoff longest computed retry delay
 * @param maxRetryAfter longest {@code Retry-After} honoured before giving up
 * @param snapshotDir where the raw JSON snapshots are kept ({@code <dir>/<database_version>/},
 *     git-ignored): the full catalog is downloaded once per provider database version and reused
 * @param snapshotOnly never call the API: import the newest local snapshot (offline work)
 */
@ConfigurationProperties(prefix = "orenji.card-providers.ygoprodeck")
public record YgoProDeckProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("yugioh") String gameSlug,
        @DefaultValue("https://db.ygoprodeck.com/api/v7/") String apiBaseUrl,
        @DefaultValue("https://images.ygoprodeck.com/images/cards/") String imageBaseUrl,
        @DefaultValue("OrenjiTrade-catalog-importer/0.1 (+https://www.orenjitrade.com)")
                String userAgent,
        @DefaultValue("5") double requestsPerSecond,
        @DefaultValue("5s") Duration connectTimeout,
        @DefaultValue("120s") Duration readTimeout,
        @DefaultValue("20s") Duration imageReadTimeout,
        @DefaultValue("4") int maxAttempts,
        @DefaultValue("1s") Duration initialBackoff,
        @DefaultValue("16s") Duration maxBackoff,
        @DefaultValue("120s") Duration maxRetryAfter,
        @DefaultValue("./.local-dev/provider-data/ygoprodeck") String snapshotDir,
        @DefaultValue("false") boolean snapshotOnly) {

    public YgoProDeckProperties {
        HostRateLimiter.validate(requestsPerSecond);
        apiBaseUrl = withSlash(requireHttp(apiBaseUrl, "api-base-url"));
        imageBaseUrl = withSlash(requireHttp(imageBaseUrl, "image-base-url"));
        if (gameSlug == null || !gameSlug.matches("^[a-z0-9]+(-[a-z0-9]+)*$")) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.ygoprodeck.game-slug must be a game slug");
        }
        if (userAgent == null || userAgent.isBlank()) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.ygoprodeck.user-agent must not be blank");
        }
        if (maxAttempts < 1 || maxAttempts > 10) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.ygoprodeck.max-attempts must be between 1 and 10");
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
                "orenji.card-providers.ygoprodeck." + name + " must be an http(s) URL");
    }

    private static String withSlash(String url) {
        return url.endsWith("/") ? url : url + "/";
    }
}
