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
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.ref.SoftReference;
import java.net.URI;
import java.net.URISyntaxException;
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
import tools.jackson.core.JacksonException;
import tools.jackson.core.exc.JacksonIOException;
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

    /**
     * The stored bulk file's name, whatever its shape (since 2026-10-28 gzip-compressed JSON Lines;
     * before, a JSON array): {@link #parse} goes by the content, not the name. Kept so that the
     * snapshots owners already hold stay found ({@code newest()}, {@code find(version)} look for
     * this one name): a new name would hide them, re-download a version already stored and leave
     * snapshot-only mode without a file.
     */
    static final String BULK_FILE = "bulk.json";

    static final long MAX_SMALL_BYTES = 5L * 1024 * 1024;
    static final String ACCEPT_JSON = "application/json;q=0.9,*/*;q=0.8";
    static final int MAX_REFUSED_ADDRESS = 200;

    private static final Logger log = LoggerFactory.getLogger(ScryfallCardProvider.class);

    /** {@code <folder>/<file>}; the file starts with a letter or digit (never {@code ..}). */
    private static final Pattern BULK_PATH =
            Pattern.compile("^[a-z0-9_-]{1,40}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$");

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
        URI download = bulkUri(bulk.downloadAddress());
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

    /**
     * Only bulk files under the configured bulk host are downloaded (SSRF guard): the address
     * starts with {@code bulkBaseUrl} and the rest is {@code <folder>/<file>}: exactly two
     * segments, the file starting with a letter or digit (so never {@code ..}), no query string, no
     * other host.
     */
    URI bulkUri(@Nullable String downloadUri) {
        if (downloadUri == null || downloadUri.isBlank()) {
            throw new ProviderRequestException(
                    "Scryfall's bulk list gives no download address for " + properties.bulkType(),
                    200);
        }
        String base = properties.bulkBaseUrl();
        if (!downloadUri.startsWith(base)
                || !BULK_PATH.matcher(downloadUri.substring(base.length())).matches()) {
            throw new ProviderRequestException(
                    "Scryfall named a bulk file outside the configured bulk host (refused: "
                            + refusedAddress(downloadUri)
                            + ")",
                    200);
        }
        return URI.create(downloadUri);
    }

    /**
     * A refused bulk address for messages and logs: scheme, host, port and path only, never user
     * information, a query string or a fragment (only their presence is said), at most {@value
     * #MAX_REFUSED_ADDRESS} characters. The address is read in its ASCII form ({@link
     * URI#toASCIIString()}), whose path stays percent-encoded and percent-encodes every character
     * outside ASCII, so a message holds printable ASCII only: no control character, no line break
     * and no invisible Unicode format character (such as a right-to-left override).
     */
    static String refusedAddress(String address) {
        URI uri;
        try {
            uri = new URI(new URI(address).toASCIIString());
        } catch (URISyntaxException e) {
            return "an address that is not a valid URI";
        }
        if (uri.getScheme() == null || uri.getHost() == null) {
            return "an address without a host";
        }
        String text =
                uri.getScheme()
                        + "://"
                        + uri.getHost()
                        + (uri.getPort() < 0 ? "" : ":" + uri.getPort())
                        + (uri.getRawPath() == null ? "" : uri.getRawPath());
        if (text.length() > MAX_REFUSED_ADDRESS) {
            text = text.substring(0, MAX_REFUSED_ADDRESS) + "...";
        }
        if (uri.getRawUserInfo() != null) {
            text += " with user information";
        }
        if (uri.getRawQuery() != null) {
            text += " with a query string";
        }
        if (uri.getRawFragment() != null) {
            text += " with a fragment";
        }
        return text;
    }

    /** Restarts the refresh interval of a file Scryfall confirmed as current. */
    private void touch(ProviderSnapshotStore.Snapshot snapshot) {
        try {
            Files.setLastModifiedTime(snapshot.data(), FileTime.from(clock.instant()));
        } catch (IOException e) {
            log.debug("Could not touch the Scryfall bulk file {}", snapshot.version(), e);
        }
    }

    /**
     * Reads a stored bulk file, whichever shape Scryfall served: gzip-compressed JSON Lines (one
     * card object per line, the file since 2026-10-28) or one JSON array (the file before, kept by
     * earlier imports), compressed or not. Jackson's {@code readValues} reads both: it unwraps a
     * root array and otherwise reads root-level values separated by whitespace, which is what JSON
     * Lines is ({@code ScryfallCardProviderTest} proves both give the same result). The decoded
     * content is bounded by {@code maxBulkBytes} like the download (decompression bomb guard).
     */
    SyncResult parse(ProviderSnapshotStore.Snapshot snapshot) {
        try (InputStream raw = Files.newInputStream(snapshot.data());
                InputStream body =
                        new DecodedLimit(
                                maybeGunzip(new BufferedInputStream(raw, 64 * 1024)),
                                properties.maxBulkBytes());
                MappingIterator<ScryfallDtos.Card> cards =
                        jsonMapper.readerFor(ScryfallDtos.Card.class).readValues(body)) {
            return ScryfallMapper.map(
                    properties.gameSlug(),
                    properties.imageBaseUrl(),
                    properties.imageVersion(),
                    cards,
                    snapshot.version());
        } catch (IOException e) {
            throw unreadable(snapshot, e);
        } catch (JacksonIOException e) {
            throw unreadable(snapshot, e.getCause());
        } catch (JacksonException e) {
            throw new ProviderRequestException(
                    "The Scryfall bulk file "
                            + snapshot.version()
                            + " is not valid JSON"
                            + deleteToDownloadAgain(snapshot),
                    200);
        }
    }

    /**
     * What to do about a stored file that is complete on disk but cannot be read: it is reused for
     * 24 hours and then for as long as Scryfall lists the same {@code updated_at}, so every run
     * would fail the same way until Scryfall publishes a newer file. Deleting its folder makes the
     * next import download it again. The folder is named relative to {@code PROVIDER_DATA_DIR} (the
     * default snapshot directory), never as an absolute path.
     */
    static String deleteToDownloadAgain(ProviderSnapshotStore.Snapshot snapshot) {
        return " (to download it again, delete the folder PROVIDER_DATA_DIR/scryfall/"
                + snapshot.version()
                + ")";
    }

    private ProviderRequestException unreadable(
            ProviderSnapshotStore.Snapshot snapshot, @Nullable Throwable cause) {
        if (cause instanceof DecodedLimit.TooLarge) {
            return new ProviderRequestException(
                    "The Scryfall bulk file "
                            + snapshot.version()
                            + " is larger than "
                            + properties.maxBulkBytes()
                            + " bytes once decompressed"
                            + " (orenji.card-providers.scryfall.max-bulk-bytes)",
                    200);
        }
        return new ProviderRequestException(
                "The Scryfall bulk file "
                        + snapshot.version()
                        + " cannot be read"
                        + deleteToDownloadAgain(snapshot),
                200);
    }

    /**
     * A bulk file is stored as the HTTP client hands it over and decompressed here when it is gzip.
     * The client (Spring's JDK request factory, compression on by default) decodes a {@code
     * Content-Encoding: gzip} response, so the JSON array of the list before 2026-10-28 was stored
     * decoded; the {@code .jsonl.gz} file is a gzip file, kept compressed unless the server also
     * marks it as an encoding. The gzip magic bytes decide, not the file name.
     */
    static InputStream maybeGunzip(BufferedInputStream in) throws IOException {
        in.mark(2);
        int first = in.read();
        int second = in.read();
        in.reset();
        return first == 0x1f && second == 0x8b ? new GZIPInputStream(in, 64 * 1024) : in;
    }

    /** Fails a read once more than {@code limit} decoded bytes have been read. */
    static final class DecodedLimit extends FilterInputStream {

        /** The decoded content passed the limit. */
        static final class TooLarge extends IOException {
            TooLarge(long limit) {
                super("Decoded bulk file larger than " + limit + " bytes");
            }
        }

        private final long limit;
        private long count;

        DecodedLimit(InputStream in, long limit) {
            super(in);
            this.limit = limit;
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            if (b != -1) {
                counted(1);
            }
            return b;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int n = super.read(buffer, offset, length);
            if (n > 0) {
                counted(n);
            }
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long skipped = super.skip(n);
            if (skipped > 0) {
                counted(skipped);
            }
            return skipped;
        }

        @Override
        public boolean markSupported() {
            return false;
        }

        private void counted(long n) throws IOException {
            count += n;
            if (count > limit) {
                throw new TooLarge(limit);
            }
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
