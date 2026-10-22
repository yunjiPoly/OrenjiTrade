package com.orenjitrade.api.cards.infra.scryfall;

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
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.ref.SoftReference;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.MappingIterator;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@link CardProvider} for Magic: The Gathering from Scryfall's daily bulk file "Unique Artwork"
 * (ADR 0021, docs/providers/scryfall.md).
 *
 * <p>Etiquette, as Scryfall asks: the bulk file instead of per-card calls; a {@code User-Agent} and
 * an {@code Accept} header on every request; requests paced per host (default 8 a second, at most
 * 10); the bulk files are refreshed at most daily, so a stored file younger than {@code
 * refreshInterval} (24 h) is reused without any call, and an older one is replaced only when {@code
 * GET /bulk-data} names a newer {@code updated_at}. The file is kept raw under {@code
 * PROVIDER_DATA_DIR/scryfall/<updated_at>/} (git-ignored).
 *
 * <p>Images: {@link ImageHostingPolicy#REHOST_REQUIRED}. Artworks are downloaded once by the capped
 * card image cache (the {@code normal} size, scaled to the 320 px JPEG; never cropped, covered,
 * recoloured or watermarked) and served from OrenjiTrade's own endpoint; Scryfall's image URLs
 * never reach clients. Card data and images courtesy of Scryfall; Magic: The Gathering content is
 * property of Wizards of the Coast.
 */
@Component
@ConditionalOnProperty(
        name = "orenji.card-providers.scryfall.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class ScryfallCardProvider implements CardProvider {

    public static final String PROVIDER_ID = ScryfallMapper.PROVIDER_ID;

    static final String BULK_FILE = "bulk.json";
    static final long MAX_SMALL_BYTES = 5L * 1024 * 1024;
    static final String ACCEPT_JSON = "application/json;q=0.9,*/*;q=0.8";

    private static final Logger log = LoggerFactory.getLogger(ScryfallCardProvider.class);
    private static final Pattern BULK_PATH =
            Pattern.compile("^[a-z0-9_-]{1,40}/[A-Za-z0-9._-]{1,120}$");
    private static final Pattern IMAGE_PATH =
            Pattern.compile(
                    "^(small|normal|large|png)/(front|back)/[0-9a-f]/[0-9a-f]/[0-9a-f-]{36}"
                            + "\\.(jpg|png)(\\?[0-9]{1,20})?$");

    private final ScryfallProperties properties;
    private final JsonMapper jsonMapper;
    private final ProviderHttpClient api;
    private final ProviderHttpClient images;
    private final ProviderSnapshotStore snapshots;
    private final Clock clock;

    /** Parsed newest bulk file for the lookup methods; softly held. */
    private volatile SoftReference<@Nullable SyncResult> latest = new SoftReference<>(null);

    @Autowired
    public ScryfallCardProvider(ScryfallProperties properties, JsonMapper jsonMapper) {
        this(properties, jsonMapper, Sleeper.SYSTEM, Clock.systemUTC());
    }

    public ScryfallCardProvider(
            ScryfallProperties properties, JsonMapper jsonMapper, Sleeper sleeper, Clock clock) {
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
                        "Scryfall",
                        properties.userAgent(),
                        properties.connectTimeout(),
                        properties.readTimeout(),
                        limiter,
                        retry,
                        sleeper);
        this.images =
                new ProviderHttpClient(
                        "Scryfall images",
                        properties.userAgent(),
                        properties.connectTimeout(),
                        properties.imageReadTimeout(),
                        limiter,
                        retry,
                        sleeper);
        this.snapshots = new ProviderSnapshotStore(Path.of(properties.snapshotDir()), BULK_FILE);
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
     * The whole bulk file (Scryfall has no change feed; unchanged rows are not rewritten).
     *
     * @throws ProviderUnavailableException Scryfall is unreachable (nothing was imported)
     */
    @Override
    public SyncResult syncCards(String gameSlug, SyncOptions options) {
        requireGame(gameSlug);
        return parse(currentSnapshot());
    }

    /** A fresh stored file first; otherwise the bulk list, and a download only for a new file. */
    ProviderSnapshotStore.Snapshot currentSnapshot() {
        Optional<ProviderSnapshotStore.Snapshot> newest = snapshots.newest();
        if (properties.snapshotOnly()) {
            return newest.orElseThrow(
                    () ->
                            new ProviderUnavailableException(
                                    "Scryfall snapshot-only mode: no local bulk file under the"
                                            + " provider data directory"));
        }
        Instant now = clock.instant();
        if (newest.isPresent()
                && newest.get().storedAt().isAfter(now.minus(properties.refreshInterval()))) {
            log.info(
                    "Scryfall bulk file {} is younger than {}: reusing it without a call",
                    newest.get().version(),
                    properties.refreshInterval());
            return newest.get();
        }
        ScryfallDtos.BulkData bulk = bulkData();
        String version = version(bulk.updatedAt());
        Optional<ProviderSnapshotStore.Snapshot> stored = snapshots.find(version);
        if (stored.isPresent()) {
            log.info("Scryfall bulk file {} unchanged: reusing the local copy", version);
            touch(stored.get());
            return stored.get();
        }
        URI download = bulkUri(bulk.downloadUri());
        log.info("Scryfall bulk file {}: downloading {}", version, download.getPath());
        try {
            Path dir = snapshots.prepare(version);
            long bytes =
                    api.get(
                            download,
                            ACCEPT_JSON,
                            response -> {
                                try (InputStream body = response.getBody()) {
                                    return ProviderSnapshotStore.write(
                                            dir, BULK_FILE, body, properties.maxBulkBytes());
                                }
                            });
            log.info("Scryfall bulk file {} stored ({} bytes)", version, bytes);
        } catch (IOException e) {
            throw new ProviderUnavailableException(
                    "Could not store the Scryfall bulk file (" + e.getClass().getSimpleName() + ")",
                    e);
        }
        ProviderSnapshotStore.Snapshot fresh =
                snapshots
                        .find(version)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "Bulk file incomplete after download"));
        touch(fresh);
        return fresh;
    }

    /** The configured bulk file of {@code GET /bulk-data}. */
    ScryfallDtos.BulkData bulkData() {
        ScryfallDtos.BulkList list =
                api.get(
                        URI.create(properties.apiBaseUrl() + "bulk-data"),
                        ACCEPT_JSON,
                        response -> {
                            try (InputStream body = response.getBody()) {
                                return jsonMapper.readValue(
                                        body.readNBytes((int) MAX_SMALL_BYTES),
                                        ScryfallDtos.BulkList.class);
                            }
                        });
        if (list == null || list.data() == null) {
            throw new ProviderRequestException("Scryfall /bulk-data returned no list", 200);
        }
        return list.data().stream()
                .filter(bulk -> properties.bulkType().equals(bulk.type()))
                .findFirst()
                .orElseThrow(
                        () ->
                                new ProviderRequestException(
                                        "Scryfall /bulk-data lists no " + properties.bulkType(),
                                        200));
    }

    /** {@code 2026-10-20T09:03:12.345+00:00} → {@code 20261020090312}. */
    static String version(@Nullable String updatedAt) {
        String digits = updatedAt == null ? "" : updatedAt.replaceAll("[^0-9]", "");
        if (digits.length() < 14) {
            throw new ProviderRequestException(
                    "Scryfall /bulk-data returned no usable updated_at", 200);
        }
        return digits.substring(0, 14);
    }

    /** Only bulk files under the configured bulk host are downloaded (SSRF guard). */
    URI bulkUri(@Nullable String downloadUri) {
        String base = properties.bulkBaseUrl();
        if (downloadUri == null
                || !downloadUri.startsWith(base)
                || !BULK_PATH.matcher(downloadUri.substring(base.length())).matches()) {
            throw new ProviderRequestException(
                    "Scryfall named a bulk file outside the configured bulk host", 200);
        }
        return URI.create(downloadUri);
    }

    /** Restarts the refresh interval of a file Scryfall confirmed as current. */
    private void touch(ProviderSnapshotStore.Snapshot snapshot) {
        try {
            Files.setLastModifiedTime(snapshot.data(), FileTime.from(clock.instant()));
        } catch (IOException e) {
            log.debug("Could not touch the Scryfall bulk file {}", snapshot.version(), e);
        }
    }

    SyncResult parse(ProviderSnapshotStore.Snapshot snapshot) {
        try (InputStream raw = Files.newInputStream(snapshot.data());
                InputStream body = maybeGunzip(new BufferedInputStream(raw, 64 * 1024));
                MappingIterator<ScryfallDtos.Card> cards =
                        jsonMapper.readerFor(ScryfallDtos.Card.class).readValues(body)) {
            return ScryfallMapper.map(
                    properties.gameSlug(),
                    properties.imageBaseUrl(),
                    properties.imageVersion(),
                    cards,
                    snapshot.version());
        } catch (IOException e) {
            throw new ProviderRequestException(
                    "The Scryfall bulk file " + snapshot.version() + " cannot be read", 200);
        } catch (tools.jackson.core.JacksonException e) {
            throw new ProviderRequestException(
                    "The Scryfall bulk file " + snapshot.version() + " is not valid JSON", 200);
        }
    }

    /** The bulk files are served gzip-encoded: stored as received, decompressed when read. */
    static InputStream maybeGunzip(BufferedInputStream in) throws IOException {
        in.mark(2);
        int first = in.read();
        int second = in.read();
        in.reset();
        return first == 0x1f && second == 0x8b ? new GZIPInputStream(in, 64 * 1024) : in;
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
                        "Scryfall has no image " + uri.getPath() + " (HTTP " + e.status() + ")");
            }
            throw e;
        }
    }

    /** Only card images under the configured image host are downloaded (SSRF guard). */
    URI imageUri(String sourceUrl) {
        String base = properties.imageBaseUrl();
        if (!sourceUrl.startsWith(base)
                || !IMAGE_PATH.matcher(sourceUrl.substring(base.length())).matches()) {
            throw new ProviderRequestException("Not a Scryfall card image URL", 0);
        }
        return URI.create(sourceUrl);
    }

    // -------------------------------------------------------------------------------------
    // Lookups (served from the newest local bulk file; never call the API)
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
            throw new IllegalArgumentException("Scryfall only serves " + properties.gameSlug());
        }
    }
}
