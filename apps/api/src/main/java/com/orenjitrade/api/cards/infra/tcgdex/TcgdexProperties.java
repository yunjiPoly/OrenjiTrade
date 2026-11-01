package com.orenjitrade.api.cards.infra.tcgdex;

import com.orenjitrade.api.cards.infra.http.HostRateLimiter;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.card-providers.tcgdex.*}: the TCGdex adapter for the Pokémon TCG (ADR 0021,
 * docs/providers/tcgdex.md). The card database is the open-source repository
 * github.com/tcgdex/cards-database (MIT licence): one call asks GitHub for the branch's newest
 * commit, and an archive of that commit is downloaded once (instead of one API call per card) and
 * kept raw; card images come from TCGdex's asset host, one per printing.
 *
 * @param enabled registers the provider
 * @param gameSlug the OrenjiTrade game the catalog is imported into
 * @param repositoryApiUrl GitHub API address of the repository (ends with {@code /}); {@code
 *     commits/<branch>} answers the newest commit
 * @param branch the branch imported
 * @param archiveBaseUrl where the archive of a commit is downloaded ({@code <archiveBaseUrl><sha>})
 * @param assetBaseUrl TCGdex's image host (ends with {@code /}); image URLs stay server-side
 * @param imageFile the image of a card folder downloaded for the cache ({@code high.jpg}, 600 px
 *     wide, scaled to the 320 px rendition)
 * @param excludedSeries TCGdex serie ids left out (Pokémon TCG Pocket is a digital game)
 * @param userAgent descriptive {@code User-Agent} of every request (GitHub requires one)
 * @param requestsPerSecond pacing per host
 * @param connectTimeout TCP connect timeout
 * @param readTimeout response timeout of the commit call and the archive download
 * @param imageReadTimeout response timeout of image downloads
 * @param maxAttempts attempts per request including the first (transient failures only)
 * @param initialBackoff first retry delay, doubled per attempt
 * @param maxBackoff longest computed retry delay
 * @param maxRetryAfter longest {@code Retry-After} honoured before giving up
 * @param snapshotDir where the raw archives are kept ({@code <dir>/<commit sha>/}, git-ignored)
 * @param snapshotOnly never call GitHub: import the newest local archive (offline work)
 * @param refreshInterval an archive younger than this is reused without asking GitHub
 * @param maxArchiveBytes largest archive accepted
 */
@ConfigurationProperties(prefix = "orenji.card-providers.tcgdex")
public record TcgdexProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("pokemon") String gameSlug,
        @DefaultValue("https://api.github.com/repos/tcgdex/cards-database/")
                String repositoryApiUrl,
        @DefaultValue("master") String branch,
        @DefaultValue("https://codeload.github.com/tcgdex/cards-database/zip/")
                String archiveBaseUrl,
        @DefaultValue("https://assets.tcgdex.net/") String assetBaseUrl,
        @DefaultValue("high.jpg") String imageFile,
        @DefaultValue("tcgp") List<String> excludedSeries,
        @DefaultValue("OrenjiTrade-catalog-importer/0.1 (+https://www.orenjitrade.com)")
                String userAgent,
        @DefaultValue("5") double requestsPerSecond,
        @DefaultValue("5s") Duration connectTimeout,
        @DefaultValue("600s") Duration readTimeout,
        @DefaultValue("20s") Duration imageReadTimeout,
        @DefaultValue("4") int maxAttempts,
        @DefaultValue("1s") Duration initialBackoff,
        @DefaultValue("16s") Duration maxBackoff,
        @DefaultValue("120s") Duration maxRetryAfter,
        @DefaultValue("./.local-dev/provider-data/tcgdex") String snapshotDir,
        @DefaultValue("false") boolean snapshotOnly,
        @DefaultValue("24h") Duration refreshInterval,
        @DefaultValue("1073741824") long maxArchiveBytes) {

    public TcgdexProperties {
        HostRateLimiter.validate(requestsPerSecond);
        repositoryApiUrl = withSlash(requireHttp(repositoryApiUrl, "repository-api-url"));
        archiveBaseUrl = withSlash(requireHttp(archiveBaseUrl, "archive-base-url"));
        assetBaseUrl = withSlash(requireHttp(assetBaseUrl, "asset-base-url"));
        if (gameSlug == null || !gameSlug.matches("^[a-z0-9]+(-[a-z0-9]+)*$")) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.game-slug must be a game slug");
        }
        if (branch == null || !branch.matches("^[A-Za-z0-9._-]{1,64}$")) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.branch must be a branch name");
        }
        if (imageFile == null || !imageFile.matches("^(high|low)\\.(jpg|png|webp)$")) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.image-file must be high or low .jpg, .png or"
                            + " .webp");
        }
        excludedSeries = excludedSeries == null ? List.of() : List.copyOf(excludedSeries);
        if (userAgent == null || userAgent.isBlank()) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.user-agent must not be blank");
        }
        if (maxAttempts < 1 || maxAttempts > 10) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.max-attempts must be between 1 and 10");
        }
        if (refreshInterval == null || refreshInterval.compareTo(Duration.ofHours(24)) < 0) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.refresh-interval must be at least 24h");
        }
        if (maxArchiveBytes <= 0) {
            throw new IllegalArgumentException(
                    "orenji.card-providers.tcgdex.max-archive-bytes must be positive");
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
                "orenji.card-providers.tcgdex." + name + " must be an http(s) URL");
    }

    private static String withSlash(String url) {
        return url.endsWith("/") ? url : url + "/";
    }
}
