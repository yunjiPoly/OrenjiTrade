package com.orenjitrade.api.cards.infra.tcgdex;

import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.domain.provider.ImageDownload;
import com.orenjitrade.api.cards.domain.provider.ImageHostingPolicy;
import com.orenjitrade.api.cards.domain.provider.ImageMissingAtSourceException;
import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderMarketPrice;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderRequestException;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import com.orenjitrade.api.cards.domain.provider.SyncOptions;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.infra.http.HostRateLimiter;
import com.orenjitrade.api.cards.infra.http.ProviderHttpClient;
import com.orenjitrade.api.cards.infra.http.ProviderSnapshotStore;
import com.orenjitrade.api.cards.infra.http.RetryPolicy;
import com.orenjitrade.api.cards.infra.http.Sleeper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.ref.SoftReference;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@link CardProvider} for the Pokémon TCG from TCGdex's open card database
 * (github.com/tcgdex/cards-database, MIT licence; ADR 0021, docs/providers/tcgdex.md). English
 * cards only.
 *
 * <p>Etiquette: the database is downloaded instead of one API call per card. A sync asks GitHub
 * once for the branch's newest commit ({@code Accept: application/vnd.github.sha}); when an archive
 * of that commit is stored under {@code PROVIDER_DATA_DIR/tcgdex/<sha>/} (git-ignored) it is
 * reused, otherwise the archive is downloaded once and kept with the repository's {@code LICENSE}.
 * An archive younger than {@code refreshInterval} (24 h) is reused without any call. Every request
 * carries a descriptive {@code User-Agent} and an {@code Accept} header and is paced per host.
 *
 * <p>Images: {@link ImageHostingPolicy#REHOST_REQUIRED}, one per printing from TCGdex's asset host,
 * downloaded only by the capped card image cache and served from OrenjiTrade's own endpoint. Card
 * data courtesy of TCGdex; Pokémon card content is © The Pokémon Company, Nintendo, Creatures and
 * GAME FREAK.
 */
@Component
@ConditionalOnProperty(
        name = "orenji.card-providers.tcgdex.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class TcgdexCardProvider implements CardProvider {

    public static final String PROVIDER_ID = TcgdexMapper.PROVIDER_ID;

    static final String ARCHIVE_FILE = "cards-database.zip";
    static final String LICENSE_FILE = "LICENSE";

    private static final Logger log = LoggerFactory.getLogger(TcgdexCardProvider.class);
    private static final Pattern SHA = Pattern.compile("^[0-9a-f]{40}$");
    private static final Pattern IMAGE_PATH =
            Pattern.compile(
                    "^en/[A-Za-z0-9._-]{1,32}/[A-Za-z0-9._-]{1,32}/[A-Za-z0-9._-]{1,32}/"
                            + "(high|low)\\.(jpg|png|webp)$");

    private final TcgdexProperties properties;
    private final JsonMapper jsonMapper;
    private final ProviderHttpClient api;
    private final ProviderHttpClient images;
    private final ProviderSnapshotStore snapshots;
    private final Clock clock;

    /** Parsed newest archive for the lookup methods; softly held. */
    private volatile SoftReference<@Nullable SyncResult> latest = new SoftReference<>(null);

    @Autowired
    public TcgdexCardProvider(TcgdexProperties properties, JsonMapper jsonMapper) {
        this(properties, jsonMapper, Sleeper.SYSTEM, Clock.systemUTC());
    }

    public TcgdexCardProvider(
            TcgdexProperties properties, JsonMapper jsonMapper, Sleeper sleeper, Clock clock) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
        HostRateLimiter limiter =
                new HostRateLimiter(properties.requestsPerSecond(), System::nanoTime, sleeper);
        RetryPolicy retry =
                new RetryPolicy(
                        properties.maxAttempts(),
                        properties.initialBackoff(),
                        properties.maxBackoff(),
                        properties.maxRetryAfter());
        this.api =
                new ProviderHttpClient(
                        "TCGdex",
                        properties.userAgent(),
                        properties.connectTimeout(),
                        properties.readTimeout(),
                        limiter,
                        retry,
                        sleeper);
        this.images =
                new ProviderHttpClient(
                        "TCGdex images",
                        properties.userAgent(),
                        properties.connectTimeout(),
                        properties.imageReadTimeout(),
                        limiter,
                        retry,
                        sleeper);
        this.snapshots = new ProviderSnapshotStore(Path.of(properties.snapshotDir()), ARCHIVE_FILE);
    }

    @Override
    public String providerId() {
        return PROVIDER_ID;
    }

    @Override
    public Set<String> supportedGameSlugs() {
        return Set.of(properties.gameSlug());
    }

    @Override
    public ImageHostingPolicy imageHostingPolicy() {
        return ImageHostingPolicy.REHOST_REQUIRED;
    }

    @Override
    public boolean supportsImageDownloads() {
        return true;
    }

    // -------------------------------------------------------------------------------------
    // Sync
    // -------------------------------------------------------------------------------------

    /**
     * The whole English catalog of the archive (no change feed; unchanged rows are not rewritten).
     *
     * @throws ProviderUnavailableException GitHub is unreachable (nothing was imported)
     */
    @Override
    public SyncResult syncCards(String gameSlug, SyncOptions options) {
        requireGame(gameSlug);
        return parse(currentSnapshot());
    }

    /** A fresh stored archive first; otherwise the newest commit, and a download only if new. */
    ProviderSnapshotStore.Snapshot currentSnapshot() {
        Optional<ProviderSnapshotStore.Snapshot> newest = snapshots.newest();
        if (properties.snapshotOnly()) {
            return newest.orElseThrow(
                    () ->
                            new ProviderUnavailableException(
                                    "TCGdex snapshot-only mode: no local archive under the"
                                            + " provider data directory"));
        }
        Instant now = clock.instant();
        if (newest.isPresent()
                && newest.get().storedAt().isAfter(now.minus(properties.refreshInterval()))) {
            log.info(
                    "TCGdex archive {} is younger than {}: reusing it without a call",
                    newest.get().version(),
                    properties.refreshInterval());
            return newest.get();
        }
        String sha = newestCommit();
        Optional<ProviderSnapshotStore.Snapshot> stored = snapshots.find(sha);
        if (stored.isPresent()) {
            log.info("TCGdex commit {} unchanged: reusing the local archive", sha);
            touch(stored.get());
            return stored.get();
        }
        log.info("TCGdex commit {}: downloading the card database archive", sha);
        try {
            Path dir = snapshots.prepare(sha);
            long bytes =
                    api.get(
                            URI.create(properties.archiveBaseUrl() + sha),
                            "application/zip",
                            response -> {
                                try (InputStream body = response.getBody()) {
                                    return ProviderSnapshotStore.write(
                                            dir, ARCHIVE_FILE, body, properties.maxArchiveBytes());
                                }
                            });
            log.info("TCGdex archive {} stored ({} bytes)", sha, bytes);
        } catch (IOException e) {
            throw new ProviderUnavailableException(
                    "Could not store the TCGdex archive (" + e.getClass().getSimpleName() + ")", e);
        }
        ProviderSnapshotStore.Snapshot fresh =
                snapshots
                        .find(sha)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "Archive incomplete after download"));
        touch(fresh);
        return fresh;
    }

    /** The branch's newest commit, as GitHub answers it ({@code application/vnd.github.sha}). */
    String newestCommit() {
        String sha =
                api.get(
                        URI.create(
                                properties.repositoryApiUrl() + "commits/" + properties.branch()),
                        "application/vnd.github.sha",
                        response -> {
                            try (InputStream body = response.getBody()) {
                                return new String(body.readNBytes(256), StandardCharsets.US_ASCII)
                                        .strip()
                                        .toLowerCase(Locale.ROOT);
                            }
                        });
        if (sha == null || !SHA.matcher(sha).matches()) {
            throw new ProviderRequestException("GitHub returned no usable commit for TCGdex", 200);
        }
        return sha;
    }

    /** Restarts the refresh interval of an archive GitHub confirmed as current. */
    private void touch(ProviderSnapshotStore.Snapshot snapshot) {
        try {
            Files.setLastModifiedTime(snapshot.data(), FileTime.from(clock.instant()));
        } catch (IOException e) {
            log.debug("Could not touch the TCGdex archive {}", snapshot.version(), e);
        }
    }

    SyncResult parse(ProviderSnapshotStore.Snapshot snapshot) {
        TcgdexMapper.Builder builder =
                new TcgdexMapper.Builder(
                        properties.gameSlug(),
                        properties.assetBaseUrl(),
                        properties.imageFile(),
                        Set.copyOf(properties.excludedSeries()));
        try {
            @Nullable String license = TcgdexArchive.read(snapshot.data(), jsonMapper, builder);
            keepLicense(snapshot, license);
        } catch (IOException e) {
            throw new ProviderRequestException(
                    "The TCGdex archive " + snapshot.version() + " cannot be read", 200);
        }
        return builder.build(snapshot.version());
    }

    /** The MIT notice stays beside the copy of the data ({@code <sha>/LICENSE}). */
    private static void keepLicense(
            ProviderSnapshotStore.Snapshot snapshot, @Nullable String text) {
        Path file = snapshot.dir().resolve(LICENSE_FILE);
        if (text == null || Files.exists(file)) {
            return;
        }
        try {
            Files.writeString(file, text, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("Could not keep the TCGdex licence beside archive {}", snapshot.version());
        }
    }

    // -------------------------------------------------------------------------------------
    // Images
    // -------------------------------------------------------------------------------------

    @Override
    public ImageDownload openImage(String sourceUrl) throws IOException {
        URI uri = imageUri(sourceUrl);
        try {
            ProviderHttpClient.OpenResponse response = images.open(uri, "image/jpeg,image/*;q=0.8");
            return new ImageDownload(
                    response.body(),
                    response.contentLength(),
                    response.contentType(),
                    response.response()::close);
        } catch (ProviderHttpClient.HttpStatusFailure e) {
            if (e.status() == 404 || e.status() == 410) {
                throw new ImageMissingAtSourceException(
                        "TCGdex has no image " + uri.getPath() + " (HTTP " + e.status() + ")");
            }
            throw e;
        }
    }

    /** Only card images under the configured asset host are downloaded (SSRF guard). */
    URI imageUri(String sourceUrl) {
        String base = properties.assetBaseUrl();
        if (!sourceUrl.startsWith(base)
                || sourceUrl.contains("..")
                || !IMAGE_PATH.matcher(sourceUrl.substring(base.length())).matches()) {
            throw new ProviderRequestException("Not a TCGdex card image URL", 0);
        }
        return URI.create(sourceUrl);
    }

    // -------------------------------------------------------------------------------------
    // Lookups (served from the newest local archive; never call GitHub)
    // -------------------------------------------------------------------------------------

    @Override
    public List<ProviderCard> searchCards(String gameSlug, String query, int limit) {
        String needle = CatalogText.normalise(query);
        return local(gameSlug).cards().stream()
                .filter(card -> CatalogText.normalise(card.name()).contains(needle))
                .limit(Math.max(0, limit))
                .toList();
    }

    @Override
    public Optional<ProviderCard> getCard(String gameSlug, String externalId) {
        return local(gameSlug).cards().stream()
                .filter(card -> card.externalId().equals(externalId))
                .findFirst();
    }

    @Override
    public List<ProviderSet> getSets(String gameSlug) {
        return local(gameSlug).sets();
    }

    @Override
    public List<ProviderPrinting> getCardPrintings(String gameSlug, String externalCardId) {
        return getCard(gameSlug, externalCardId).map(ProviderCard::printings).orElse(List.of());
    }

    @Override
    public List<ProviderImage> getImages(String gameSlug, String externalPrintingId) {
        return local(gameSlug).cards().stream()
                .flatMap(card -> card.printings().stream())
                .filter(printing -> printing.externalId().equals(externalPrintingId))
                .findFirst()
                .map(ProviderPrinting::images)
                .orElse(List.of());
    }

    @Override
    public Optional<ProviderMarketPrice> getMarketPrices(
            String gameSlug, String externalPrintingId) {
        return Optional.empty();
    }

    private SyncResult local(String gameSlug) {
        requireGame(gameSlug);
        @Nullable SyncResult result = latest.get();
        if (result != null) {
            return result;
        }
        Optional<ProviderSnapshotStore.Snapshot> newest;
        try {
            newest = snapshots.newest();
        } catch (UncheckedIOException e) {
            newest = Optional.empty();
        }
        if (newest.isEmpty()) {
            return new SyncResult(PROVIDER_ID, gameSlug, List.of(), List.of());
        }
        SyncResult parsed = parse(newest.get());
        latest = new SoftReference<>(parsed);
        return parsed;
    }

    private void requireGame(String gameSlug) {
        if (!properties.gameSlug().equals(gameSlug)) {
            throw new IllegalArgumentException("TCGdex only serves " + properties.gameSlug());
        }
    }
}
