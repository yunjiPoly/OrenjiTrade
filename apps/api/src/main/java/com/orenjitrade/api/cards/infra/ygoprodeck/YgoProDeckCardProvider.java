package com.orenjitrade.api.cards.infra.ygoprodeck;

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
import com.orenjitrade.api.cards.infra.http.RetryPolicy;
import com.orenjitrade.api.cards.infra.http.Sleeper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.ref.SoftReference;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@link CardProvider} for the real Yu-Gi-Oh! TCG catalog from YGOPRODeck (ADR 0015,
 * docs/providers/ygoprodeck.md).
 *
 * <p>Etiquette, as the provider asks: a sync first calls {@code checkDBVer.php}; when a raw
 * snapshot of that {@code database_version} is stored locally ({@link YgoProDeckSnapshotStore},
 * git-ignored) it is reused without any further call, otherwise the full catalog ({@code
 * cardinfo.php?misc=yes}, one request) and {@code cardsets.php} are downloaded once and stored.
 * Requests carry a descriptive {@code User-Agent}, are paced per host (default 5/s, hard ceiling
 * 15/s; the provider blocks above 20/s) and transient failures are retried with backoff.
 *
 * <p>Images: {@link ImageHostingPolicy#REHOST_REQUIRED}. YGOPRODeck forbids hotlinking ("download
 * and re-host the images yourself"), so artworks are only downloaded by the capped card image cache
 * and served from OrenjiTrade's own endpoint; their source URLs never reach clients. Content is
 * copyright 4K Media Inc., a subsidiary of Konami Digital Entertainment, Inc.
 */
@Component
@ConditionalOnProperty(
        name = "orenji.card-providers.ygoprodeck.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class YgoProDeckCardProvider implements CardProvider {

    public static final String PROVIDER_ID = YgoProDeckMapper.PROVIDER_ID;

    static final long MAX_CATALOG_BYTES = 300L * 1024 * 1024;
    static final long MAX_SMALL_BYTES = 20L * 1024 * 1024;

    private static final Logger log = LoggerFactory.getLogger(YgoProDeckCardProvider.class);
    private static final Pattern IMAGE_FILE = Pattern.compile("^[0-9]{1,15}\\.jpg$");

    private final YgoProDeckProperties properties;
    private final JsonMapper jsonMapper;
    private final ProviderHttpClient api;
    private final ProviderHttpClient images;
    private final YgoProDeckSnapshotStore snapshots;

    /** Parsed newest snapshot for the lookup methods; softly held (tens of MB). */
    private volatile SoftReference<@Nullable SyncResult> latest = new SoftReference<>(null);

    @Autowired
    public YgoProDeckCardProvider(YgoProDeckProperties properties, JsonMapper jsonMapper) {
        this(properties, jsonMapper, Sleeper.SYSTEM);
    }

    public YgoProDeckCardProvider(
            YgoProDeckProperties properties, JsonMapper jsonMapper, Sleeper sleeper) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        // One limiter shared by the API and the image host clients: pacing is per host.
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
                        "YGOPRODeck",
                        properties.userAgent(),
                        properties.connectTimeout(),
                        properties.readTimeout(),
                        limiter,
                        retry,
                        sleeper);
        this.images =
                new ProviderHttpClient(
                        "YGOPRODeck images",
                        properties.userAgent(),
                        properties.connectTimeout(),
                        properties.imageReadTimeout(),
                        limiter,
                        retry,
                        sleeper);
        this.snapshots = new YgoProDeckSnapshotStore(Path.of(properties.snapshotDir()));
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
     * The whole catalog (YGOPRODeck has no change feed; incremental syncs import everything,
     * unchanged rows are not rewritten).
     *
     * @throws ProviderUnavailableException the API is unreachable (nothing was imported)
     */
    @Override
    public SyncResult syncCards(String gameSlug, SyncOptions options) {
        requireGame(gameSlug);
        YgoProDeckSnapshotStore.Snapshot snapshot = currentSnapshot();
        return parse(snapshot);
    }

    /** Version check first; download the full catalog only for a version not stored yet. */
    YgoProDeckSnapshotStore.Snapshot currentSnapshot() {
        if (properties.snapshotOnly()) {
            return snapshots
                    .newest()
                    .orElseThrow(
                            () ->
                                    new ProviderUnavailableException(
                                            "YGOPRODeck snapshot-only mode: no local snapshot under"
                                                    + " the provider data directory"));
        }
        YgoProDeckDtos.DbVersion version = checkDbVersion();
        String databaseVersion = version.databaseVersion();
        if (databaseVersion == null
                || !YgoProDeckSnapshotStore.VERSION.matcher(databaseVersion).matches()) {
            throw new ProviderRequestException(
                    "YGOPRODeck checkDBVer.php returned no usable database_version", 200);
        }
        Optional<YgoProDeckSnapshotStore.Snapshot> stored = snapshots.find(databaseVersion);
        if (stored.isPresent()) {
            log.info(
                    "YGOPRODeck database {} unchanged: reusing the local snapshot",
                    databaseVersion);
            return stored.get();
        }
        log.info("YGOPRODeck database {}: downloading the catalog snapshot", databaseVersion);
        try {
            Path dir = snapshots.prepare(databaseVersion);
            download(
                    "cardinfo.php?misc=yes",
                    dir,
                    YgoProDeckSnapshotStore.CARD_INFO,
                    MAX_CATALOG_BYTES);
            download("cardsets.php", dir, YgoProDeckSnapshotStore.CARD_SETS, MAX_SMALL_BYTES);
            Files.writeString(
                    dir.resolve(YgoProDeckSnapshotStore.CHECK_DB_VER),
                    jsonMapper.writeValueAsString(List.of(version)));
        } catch (IOException e) {
            throw new ProviderUnavailableException(
                    "Could not store the YGOPRODeck snapshot ("
                            + e.getClass().getSimpleName()
                            + ")",
                    e);
        }
        return snapshots
                .find(databaseVersion)
                .orElseThrow(() -> new IllegalStateException("Snapshot incomplete after download"));
    }

    YgoProDeckDtos.DbVersion checkDbVersion() {
        List<YgoProDeckDtos.DbVersion> versions =
                api.get(
                        apiUri("checkDBVer.php"),
                        "application/json",
                        response -> {
                            try (InputStream body = response.getBody()) {
                                return jsonMapper.readValue(
                                        body.readNBytes((int) MAX_SMALL_BYTES),
                                        new TypeReference<List<YgoProDeckDtos.DbVersion>>() {});
                            }
                        });
        if (versions == null || versions.isEmpty()) {
            throw new ProviderRequestException("YGOPRODeck checkDBVer.php returned nothing", 200);
        }
        return versions.get(0);
    }

    private void download(String path, Path dir, String file, long maxBytes) {
        long bytes =
                api.get(
                        apiUri(path),
                        "application/json",
                        response -> {
                            try (InputStream body = response.getBody()) {
                                return YgoProDeckSnapshotStore.write(dir, file, body, maxBytes);
                            }
                        });
        log.info("YGOPRODeck {} stored ({} bytes)", file, bytes);
    }

    SyncResult parse(YgoProDeckSnapshotStore.Snapshot snapshot) {
        try {
            List<YgoProDeckDtos.DbVersion> version =
                    jsonMapper.readValue(
                            snapshot.checkDbVer().toFile(),
                            new TypeReference<List<YgoProDeckDtos.DbVersion>>() {});
            YgoProDeckDtos.CardInfo cardInfo =
                    jsonMapper.readValue(
                            snapshot.cardInfo().toFile(), YgoProDeckDtos.CardInfo.class);
            List<YgoProDeckDtos.SetInfo> sets =
                    jsonMapper.readValue(
                            snapshot.cardSets().toFile(),
                            new TypeReference<List<YgoProDeckDtos.SetInfo>>() {});
            if (cardInfo == null || cardInfo.data() == null || sets == null) {
                throw new ProviderRequestException(
                        "The YGOPRODeck snapshot " + snapshot.version() + " is incomplete", 200);
            }
            @Nullable String lastUpdate =
                    version == null || version.isEmpty() ? null : version.get(0).lastUpdate();
            return YgoProDeckMapper.map(
                    properties.gameSlug(),
                    properties.imageBaseUrl(),
                    cardInfo.data(),
                    sets,
                    snapshot.version(),
                    lastUpdate);
        } catch (tools.jackson.core.JacksonException e) {
            throw new ProviderRequestException(
                    "The YGOPRODeck snapshot " + snapshot.version() + " is not valid JSON", 200);
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
                        "YGOPRODeck has no image " + fileName(uri) + " (HTTP " + e.status() + ")");
            }
            throw e;
        }
    }

    /** Only full-size card images under the configured image base are downloaded (SSRF guard). */
    URI imageUri(String sourceUrl) {
        String base = properties.imageBaseUrl();
        if (!sourceUrl.startsWith(base)
                || !IMAGE_FILE.matcher(sourceUrl.substring(base.length())).matches()) {
            throw new ProviderRequestException(
                    "Not a YGOPRODeck card image URL of this installation", 0);
        }
        return URI.create(sourceUrl);
    }

    private static String fileName(URI uri) {
        String path = uri.getPath() == null ? "" : uri.getPath();
        return path.substring(path.lastIndexOf('/') + 1);
    }

    // -------------------------------------------------------------------------------------
    // Lookups (served from the newest local snapshot; never call the API)
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
        String cardId = externalPrintingId.split(":", 2)[0];
        return getCard(gameSlug, cardId).map(ProviderCard::images).orElse(List.of());
    }

    @Override
    public Optional<ProviderMarketPrice> getMarketPrices(
            String gameSlug, String externalPrintingId) {
        return local(gameSlug).cards().stream()
                .flatMap(card -> card.printings().stream())
                .filter(printing -> printing.externalId().equals(externalPrintingId))
                .findFirst()
                .map(ProviderPrinting::marketPrice);
    }

    private SyncResult local(String gameSlug) {
        requireGame(gameSlug);
        @Nullable SyncResult result = latest.get();
        if (result != null) {
            return result;
        }
        Optional<YgoProDeckSnapshotStore.Snapshot> newest;
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
            throw new IllegalArgumentException("YGOPRODeck only serves " + properties.gameSlug());
        }
    }

    private URI apiUri(String path) {
        return URI.create(properties.apiBaseUrl() + path);
    }
}
