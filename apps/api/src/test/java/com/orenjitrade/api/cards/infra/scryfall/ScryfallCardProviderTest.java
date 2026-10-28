package com.orenjitrade.api.cards.infra.scryfall;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.cards.domain.provider.ImageDownload;
import com.orenjitrade.api.cards.domain.provider.ImageHostingPolicy;
import com.orenjitrade.api.cards.domain.provider.ProviderRequestException;
import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import com.orenjitrade.api.cards.domain.provider.SyncOptions;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.infra.CardSourceStub;
import com.orenjitrade.api.cards.infra.http.ProviderSnapshotStore;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The Scryfall adapter against the offline stub: the bulk file instead of per-card calls, a {@code
 * User-Agent} and an {@code Accept} header on every call, one download per bulk file kept raw and
 * reused, at most one refresh a day, nothing fetched in snapshot-only mode, the re-host-only image
 * policy and the bulk and image allow-lists. Scryfall's bulk list of 2026-10-28 ({@code
 * jsonl_download_uri}, a gzip JSON Lines file) and the one before ({@code download_uri}, a JSON
 * array) are both read, and both files give the same catalogue.
 */
class ScryfallCardProviderTest {

    static final CardSourceStub STUB = CardSourceStub.get();
    static final String AGENT = "OrenjiTrade-catalog-importer/test (+https://www.orenjitrade.com)";

    @TempDir Path snapshots;

    private final MovableClock clock = new MovableClock();
    private final JsonMapper mapper = JsonMapper.builder().build();

    @AfterEach
    void reset() {
        STUB.reset();
    }

    static ScryfallProperties properties(
            String api, String data, String images, String snapshotDir, boolean snapshotOnly) {
        return properties(api, data, images, snapshotDir, snapshotOnly, 10L * 1024 * 1024);
    }

    static ScryfallProperties properties(
            String api,
            String data,
            String images,
            String snapshotDir,
            boolean snapshotOnly,
            long maxBulkBytes) {
        return new ScryfallProperties(
                true,
                "mtg",
                api,
                "unique_artwork",
                data,
                images,
                "normal",
                AGENT,
                10,
                Duration.ofSeconds(2),
                Duration.ofSeconds(10),
                Duration.ofSeconds(5),
                2,
                Duration.ofMillis(5),
                Duration.ofMillis(10),
                Duration.ofSeconds(5),
                snapshotDir,
                snapshotOnly,
                Duration.ofHours(24),
                maxBulkBytes);
    }

    private ScryfallCardProvider provider(boolean snapshotOnly) {
        return provider(snapshotOnly, snapshots, 10L * 1024 * 1024);
    }

    private ScryfallCardProvider provider(boolean snapshotOnly, Path dir, long maxBulkBytes) {
        return new ScryfallCardProvider(
                properties(
                        STUB.scryfallApi(),
                        STUB.scryfallData(),
                        STUB.scryfallImages(),
                        dir.toString(),
                        snapshotOnly,
                        maxBulkBytes),
                mapper,
                duration -> {},
                clock);
    }

    /** A stored bulk file of {@code version} holding {@code bytes}, in a folder of its own. */
    private ProviderSnapshotStore.Snapshot stored(String folder, String version, byte[] bytes)
            throws IOException {
        Path dir = Files.createDirectories(snapshots.resolve("parse").resolve(folder));
        Files.write(dir.resolve(ScryfallCardProvider.BULK_FILE), bytes);
        return new ProviderSnapshotStore.Snapshot(version, dir, ScryfallCardProvider.BULK_FILE);
    }

    private static byte[] utf8(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static String jsonLines() {
        return new String(
                CardSourceStub.scryfallJsonLines(STUB.scryfallImages()), StandardCharsets.UTF_8);
    }

    @Test
    void downloadsTheBulkFileOnceWithItsHeadersAndReusesItForADay() throws Exception {
        ScryfallCardProvider provider = provider(false);
        SyncResult first = provider.syncCards("mtg", SyncOptions.full());
        assertThat(first.cards()).hasSize(6);
        assertThat(first.providerVersion()).isEqualTo(CardSourceStub.SCRYFALL_VERSION);
        assertThat(STUB.requests())
                .as("the list of 2026-10-28: its jsonl_download_uri")
                .extracting(CardSourceStub.Request::path)
                .containsExactly(
                        "/scryfall-api/bulk-data",
                        "/scryfall-data/unique-artwork/unique-artwork-"
                                + CardSourceStub.SCRYFALL_VERSION
                                + ".jsonl.gz");
        assertThat(STUB.requests())
                .allSatisfy(
                        request -> {
                            assertThat(request.userAgent()).isEqualTo(AGENT);
                            assertThat(request.accept()).contains("application/json");
                        });
        Path stored = snapshots.resolve(CardSourceStub.SCRYFALL_VERSION).resolve("bulk.json");
        assertThat(stored).exists();
        // Kept as the HTTP client hands it over: the .jsonl.gz file stays gzip-compressed ...
        byte[] raw = Files.readAllBytes(stored);
        assertThat(Arrays.copyOf(raw, 2)).containsExactly(0x1f, 0x8b);
        // ... and a decoded copy (a server that sends Content-Encoding: gzip) is read back too.
        Files.write(stored, CardSourceStub.scryfallJsonLines(STUB.scryfallImages()));
        assertThat(provider.syncCards("mtg", SyncOptions.full())).isEqualTo(first);

        STUB.reset();
        clock.advance(Duration.ofHours(23));
        SyncResult again = provider.syncCards("mtg", SyncOptions.full());
        assertThat(again.cards()).hasSize(6);
        assertThat(STUB.requests()).as("a file younger than a day: no call").isEmpty();
    }

    @Test
    void afterADayAsksOnceAndDownloadsOnlyANewerFile() {
        ScryfallCardProvider provider = provider(false);
        provider.syncCards("mtg", SyncOptions.full());

        STUB.reset();
        clock.advance(Duration.ofHours(25));
        provider.syncCards("mtg", SyncOptions.full());
        assertThat(STUB.requests())
                .as("the same updated_at: the list only")
                .extracting(CardSourceStub.Request::path)
                .containsExactly("/scryfall-api/bulk-data");

        STUB.reset();
        clock.advance(Duration.ofHours(1));
        provider.syncCards("mtg", SyncOptions.full());
        assertThat(STUB.requests()).as("confirmed current an hour ago").isEmpty();

        STUB.reset();
        STUB.scryfallUpdatedAt("2026-10-21T09:00:00.000+00:00");
        clock.advance(Duration.ofHours(25));
        SyncResult newer = provider.syncCards("mtg", SyncOptions.full());
        assertThat(newer.providerVersion()).isEqualTo("20261021090000");
        assertThat(STUB.requests()).hasSize(2);
        assertThat(snapshots.resolve("20261021090000").resolve("bulk.json")).exists();
    }

    @Test
    void snapshotOnlyNeverCallsScryfall() throws Exception {
        assertThatThrownBy(() -> provider(true).syncCards("mtg", SyncOptions.full()))
                .isInstanceOf(ProviderUnavailableException.class);
        Path dir = Files.createDirectories(snapshots.resolve("20261019000000"));
        Files.write(
                dir.resolve("bulk.json"), CardSourceStub.scryfallFixture(STUB.scryfallImages()));
        SyncResult result = provider(true).syncCards("mtg", SyncOptions.full());
        assertThat(result.cards()).hasSize(6);
        assertThat(result.providerVersion()).isEqualTo("20261019000000");
        assertThat(STUB.requests()).isEmpty();
    }

    @Test
    void theBulkListBefore20261028StillWorksAndGivesTheSameCatalogue() {
        SyncResult jsonl =
                provider(false, snapshots.resolve("jsonl"), 10L * 1024 * 1024)
                        .syncCards("mtg", SyncOptions.full());

        STUB.reset();
        STUB.scryfallBulkList(CardSourceStub.BulkList.LEGACY);
        SyncResult legacy =
                provider(false, snapshots.resolve("legacy"), 10L * 1024 * 1024)
                        .syncCards("mtg", SyncOptions.full());
        assertThat(STUB.requests())
                .as("the old list: its download_uri, a gzip-encoded JSON array")
                .extracting(CardSourceStub.Request::path)
                .containsExactly(
                        "/scryfall-api/bulk-data",
                        "/scryfall-data/unique-artwork/unique-artwork-"
                                + CardSourceStub.SCRYFALL_VERSION
                                + ".json");
        assertThat(legacy.cards()).hasSize(6);
        assertThat(legacy).isEqualTo(jsonl);
    }

    @Test
    void aBulkListWithoutADownloadAddressSaysSo() {
        STUB.scryfallBulkList(CardSourceStub.BulkList.NO_ADDRESS);
        assertThatThrownBy(() -> provider(false).syncCards("mtg", SyncOptions.full()))
                .isInstanceOf(ProviderRequestException.class)
                .hasMessage("Scryfall's bulk list gives no download address for unique_artwork")
                .hasMessageNotContaining("outside");
        assertThat(STUB.requests())
                .extracting(CardSourceStub.Request::path)
                .containsExactly("/scryfall-api/bulk-data");
        assertThat(snapshots.resolve(CardSourceStub.SCRYFALL_VERSION)).doesNotExist();
    }

    @Test
    void aBulkFileOutsideTheBulkHostIsRefused() {
        for (CardSourceStub.BulkList shape :
                new CardSourceStub.BulkList[] {
                    CardSourceStub.BulkList.JSONL, CardSourceStub.BulkList.LEGACY
                }) {
            STUB.reset();
            STUB.scryfallBulkList(shape);
            STUB.downloadUri("https://elsewhere.example.test/unique-artwork/x.jsonl.gz");
            assertThatThrownBy(() -> provider(false).syncCards("mtg", SyncOptions.full()))
                    .as(shape.name())
                    .isInstanceOf(ProviderRequestException.class)
                    .hasMessage(
                            "Scryfall named a bulk file outside the configured bulk host"
                                    + " (refused: https://elsewhere.example.test"
                                    + "/unique-artwork/x.jsonl.gz)");
            assertThat(STUB.requests())
                    .extracting(CardSourceStub.Request::path)
                    .containsExactly("/scryfall-api/bulk-data");
        }
        assertThat(ScryfallCardProvider.version("2026-10-20T09:03:12.345+00:00"))
                .isEqualTo("20261020090312");
        assertThatThrownBy(() -> ScryfallCardProvider.version("yesterday"))
                .isInstanceOf(ProviderRequestException.class);
    }

    @Test
    void theBulkGuardStaysAsStrictAndNamesOnlyTheRefusedHostAndPath() {
        ScryfallCardProvider real =
                new ScryfallCardProvider(
                        properties(
                                "https://api.scryfall.com/",
                                "https://data.scryfall.io/",
                                "https://cards.scryfall.io/",
                                snapshots.toString(),
                                true),
                        mapper,
                        duration -> {},
                        clock);
        // The address of 2026-10-28 and the older one fit the guard (no request is made here).
        assertThat(
                        real.bulkUri(
                                "https://data.scryfall.io/unique-artwork/"
                                        + "unique-artwork-20261028090231.jsonl.gz"))
                .isEqualTo(
                        URI.create(
                                "https://data.scryfall.io/unique-artwork/"
                                        + "unique-artwork-20261028090231.jsonl.gz"));
        assertThat(real.bulkUri("https://data.scryfall.io/unique-artwork/unique-artwork-1.json"))
                .hasHost("data.scryfall.io");
        // Whichever bulk type is configured: "Default Cards" has the same address shape.
        assertThat(
                        real.bulkUri(
                                "https://data.scryfall.io/default-cards/"
                                        + "default-cards-20261028090231.jsonl.gz"))
                .hasHost("data.scryfall.io");

        for (String blank : new String[] {null, "", "   "}) {
            assertThatThrownBy(() -> real.bulkUri(blank))
                    .as(String.valueOf(blank))
                    .isInstanceOf(ProviderRequestException.class)
                    .hasMessage(
                            "Scryfall's bulk list gives no download address for unique_artwork");
        }
        String[][] refused = {
            {"http://data.scryfall.io/unique-artwork/x.jsonl.gz", "http://data.scryfall.io/"},
            {"https://data.scryfall.io.evil.test/unique-artwork/x.jsonl.gz", "evil.test"},
            {"https://data.scryfall.io:8443/unique-artwork/x.jsonl.gz", "data.scryfall.io:8443/"},
            {"https://data.scryfall.io/unique-artwork/x.jsonl.gz?token=s3cr3t", "query string"},
            {"https://data.scryfall.io/unique-artwork/x.jsonl.gz#s3cr3t", "with a fragment"},
            {"https://data.scryfall.io/unique-artwork/../../etc/passwd", "/../../etc/passwd"},
            {"https://data.scryfall.io/a/b/c.jsonl.gz", "/a/b/c.jsonl.gz"},
            {"https://data.scryfall.io/x.jsonl.gz", "/x.jsonl.gz"},
            {"https://data.scryfall.io/unique-artwork/%0Ax.jsonl.gz", "/unique-artwork/%0Ax"},
            {"https://data.scryfall.io/unique-artwork/..", "data.scryfall.io/unique-artwork/.."},
            {"https://data.scryfall.io/unique-artwork/.", "data.scryfall.io/unique-artwork/."},
            {"https://data.scryfall.io/unique-artwork/.x.jsonl.gz", "/unique-artwork/.x.jsonl.gz"},
            {"https://data.scryfall.io/unique-artwork/-x.jsonl.gz", "/unique-artwork/-x.jsonl.gz"},
            // A right-to-left override (U+202E) stays percent-encoded in the message.
            {"https://evil.test/\u202Efdp.exe", "https://evil.test/%E2%80%AEfdp.exe"},
            {"https://data.scryfall.io/unique-artwork/\u00e9t\u00e9.jsonl.gz", "/%C3%A9t%C3%A9"},
            {"https://user:s3cr3t@elsewhere.example.test/u/x.gz", "with user information"},
            {"file:///etc/passwd", "an address without a host"},
            {"unique-artwork/x.jsonl.gz", "an address without a host"},
            {"https://data.scryfall.io/unique artwork/x", "not a valid URI"},
            {"https://elsewhere.example.test/" + "a".repeat(400), "..."}
        };
        for (String[] row : refused) {
            assertThatThrownBy(() -> real.bulkUri(row[0]))
                    .as(row[0])
                    .isInstanceOf(ProviderRequestException.class)
                    .hasMessageStartingWith(
                            "Scryfall named a bulk file outside the configured bulk host (refused:"
                                    + " ")
                    .hasMessageContaining(row[1])
                    .hasMessageNotContaining("s3cr3t")
                    .hasMessageNotContaining("\n")
                    .satisfies(
                            e ->
                                    assertThat(e.getMessage().length())
                                            .isLessThan(
                                                    ScryfallCardProvider.MAX_REFUSED_ADDRESS + 120))
                    .satisfies(
                            e ->
                                    assertThat(e.getMessage().chars())
                                            .as("printable ASCII only")
                                            .allMatch(c -> c >= 0x20 && c <= 0x7e));
        }
    }

    @Test
    void gzipJsonLinesParseToTheSameCatalogueAsTheOldJsonArray() throws Exception {
        ScryfallCardProvider provider = provider(true);
        String version = "20261028090231";
        byte[] array = CardSourceStub.scryfallFixture(STUB.scryfallImages());
        SyncResult expected = provider.parse(stored("array", version, array));
        assertThat(expected.cards()).hasSize(6);
        assertThat(expected.providerVersion()).isEqualTo(version);

        String lines = jsonLines();
        assertThat(lines).endsWith("}\n").doesNotStartWith("[");
        assertThat(lines.split("\n"))
                .hasSize(13)
                .allSatisfy(line -> assertThat(line).startsWith("{"));
        String withoutTrailingNewline = lines.substring(0, lines.length() - 1);
        String blankLinesAndCrlf = "\n" + lines.replace("\n", "\r\n\r\n") + "   \n";
        byte[][] variants = {
            CardSourceStub.gzip(array),
            CardSourceStub.gzip(utf8(lines)),
            CardSourceStub.gzip(utf8(withoutTrailingNewline)),
            CardSourceStub.gzip(utf8(blankLinesAndCrlf)),
            utf8(lines),
            utf8(withoutTrailingNewline)
        };
        String[] names = {
            "gzip array (the old file)",
            "gzip JSON Lines (the file of 2026-10-28)",
            "gzip JSON Lines without a trailing newline",
            "gzip JSON Lines with blank lines and CRLF",
            "decoded JSON Lines",
            "decoded JSON Lines without a trailing newline"
        };
        for (int i = 0; i < variants.length; i++) {
            assertThat(provider.parse(stored("v" + i, version, variants[i])))
                    .as(names[i])
                    .isEqualTo(expected);
        }
    }

    @Test
    void aDamagedBulkFileIsReportedWithoutItsContent() throws Exception {
        ScryfallCardProvider provider = provider(true);
        String lines = jsonLines();
        byte[] half = utf8(lines.substring(0, lines.length() / 2));
        assertThatThrownBy(() -> provider.parse(stored("cut", "20261028090231", half)))
                .isInstanceOf(ProviderRequestException.class)
                .hasMessage("The Scryfall bulk file 20261028090231 is not valid JSON");
        byte[] gzip = CardSourceStub.gzip(utf8(lines));
        // Cut in the middle, or at the very end: every card is there but the 8-byte trailer
        // (checksum and length) is missing in full or in part.
        int[] cuts = {gzip.length / 2, gzip.length - 8, gzip.length - 4, gzip.length - 1};
        for (int cut : cuts) {
            byte[] truncated = Arrays.copyOf(gzip, cut);
            assertThatThrownBy(
                            () -> provider.parse(stored("cut-" + cut, "20261028090231", truncated)))
                    .as("cut at %d of %d bytes", cut, gzip.length)
                    .isInstanceOf(ProviderRequestException.class)
                    .hasMessage("The Scryfall bulk file 20261028090231 cannot be read");
        }
        // A damaged checksum (the trailer's CRC-32) or a damaged length (its last 4 bytes).
        for (int at : new int[] {gzip.length - 6, gzip.length - 2}) {
            byte[] damaged = gzip.clone();
            damaged[at] ^= 0x55;
            assertThatThrownBy(
                            () ->
                                    provider.parse(
                                            stored("damaged-" + at, "20261028090231", damaged)))
                    .as("byte %d of %d damaged", at, gzip.length)
                    .isInstanceOf(ProviderRequestException.class)
                    .hasMessage("The Scryfall bulk file 20261028090231 cannot be read");
        }
    }

    /**
     * A file closer to the real one in size (thousands of lines, about a megabyte or more decoded,
     * several gzip buffers): JSON Lines in every shape gives the same catalogue as the JSON array.
     */
    @Test
    void aLargeGeneratedBulkFileGivesTheSameCatalogueInEveryShape() throws Exception {
        int count = 3_000;
        List<String> lines = generatedCards(count);
        ScryfallCardProvider provider = provider(true, snapshots, 64L * 1024 * 1024);
        String array = "[\n" + String.join(",\n", lines) + "\n]\n";
        SyncResult expected = provider.parse(stored("large-array", "20261028090231", utf8(array)));
        assertThat(expected.cards()).hasSize(count);
        assertThat(array.length()).as("bigger than one gzip buffer").isGreaterThan(1024 * 1024);

        String lf = String.join("\n", lines) + "\n";
        String crlfWithoutTrailingNewline = String.join("\r\n", lines);
        byte[][] variants = {
            CardSourceStub.gzip(utf8(array)),
            CardSourceStub.gzip(utf8(lf)),
            CardSourceStub.gzip(utf8(crlfWithoutTrailingNewline)),
            utf8(lf)
        };
        String[] names = {
            "gzip array", "gzip JSON Lines", "gzip JSON Lines, CRLF, no trailing newline", "decoded"
        };
        for (int i = 0; i < variants.length; i++) {
            assertThat(provider.parse(stored("large-" + i, "20261028090231", variants[i])))
                    .as(names[i])
                    .isEqualTo(expected);
        }
    }

    /** {@code count} fictional cards, each the fixture's first card with ids of its own. */
    private List<String> generatedCards(int count) {
        JsonNode first =
                mapper.readTree(CardSourceStub.scryfallFixture(STUB.scryfallImages())).get(0);
        List<String> lines = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            ObjectNode card = (ObjectNode) first.deepCopy();
            String id = "5c000000-0000-4000-8000-%012d".formatted(i);
            card.put("id", id);
            card.put("oracle_id", "0a000000-0000-4000-8000-%012d".formatted(i));
            card.put("illustration_id", "1a000000-0000-4000-8000-%012d".formatted(i));
            card.put("name", "Generated Card " + i + " \u2014 \u201cquoted\u201d \u00e9");
            card.put("collector_number", String.valueOf(i + 1));
            card.put("set", i % 2 == 0 ? "zga" : "zgb");
            ObjectNode images = mapper.createObjectNode();
            images.put(
                    "normal", STUB.scryfallImages() + "normal/front/5/c/" + id + ".jpg?1700000001");
            card.set("image_uris", images);
            lines.add(mapper.writeValueAsString(card));
        }
        return lines;
    }

    @Test
    void theDecodedBulkFileIsBoundedByMaxBulkBytes() throws Exception {
        byte[] lines = CardSourceStub.scryfallJsonLines(STUB.scryfallImages());
        byte[] gzip = CardSourceStub.gzip(lines);
        long limit = lines.length - 1;
        assertThat((long) gzip.length).as("the compressed file fits the limit").isLessThan(limit);
        ScryfallCardProvider small = provider(true, snapshots, limit);
        assertThatThrownBy(() -> small.parse(stored("small", "20261028090231", gzip)))
                .isInstanceOf(ProviderRequestException.class)
                .hasMessage(
                        "The Scryfall bulk file 20261028090231 is larger than "
                                + limit
                                + " bytes once decompressed"
                                + " (orenji.card-providers.scryfall.max-bulk-bytes)");
        assertThat(
                        provider(true, snapshots, lines.length)
                                .parse(stored("exact", "1", gzip))
                                .cards())
                .as("exactly at the limit")
                .hasSize(6);

        // A decompression bomb: 12 MiB of whitespace in a gzip of a few KiB, limit 10 MiB.
        Path dir = Files.createDirectories(snapshots.resolve("parse").resolve("bomb"));
        try (OutputStream out =
                new GZIPOutputStream(
                        Files.newOutputStream(dir.resolve(ScryfallCardProvider.BULK_FILE)))) {
            byte[] spaces = new byte[1024 * 1024];
            Arrays.fill(spaces, (byte) ' ');
            for (int i = 0; i < 12; i++) {
                out.write(spaces);
            }
        }
        assertThat(Files.size(dir.resolve(ScryfallCardProvider.BULK_FILE))).isLessThan(100_000);
        assertThatThrownBy(
                        () ->
                                provider(true)
                                        .parse(
                                                new ProviderSnapshotStore.Snapshot(
                                                        "bomb",
                                                        dir,
                                                        ScryfallCardProvider.BULK_FILE)))
                .isInstanceOf(ProviderRequestException.class)
                .hasMessageContaining("once decompressed");
    }

    @Test
    void theDecodedLimitCountsEveryRead() throws Exception {
        try (InputStream in =
                new ScryfallCardProvider.DecodedLimit(new ByteArrayInputStream(new byte[10]), 10)) {
            assertThat(in.read()).isZero();
            assertThat(in.skip(4)).isEqualTo(4);
            assertThat(in.read(new byte[10], 0, 10)).isEqualTo(5);
            assertThat(in.read()).isEqualTo(-1);
            assertThat(in.markSupported()).isFalse();
        }
        try (InputStream in =
                new ScryfallCardProvider.DecodedLimit(new ByteArrayInputStream(new byte[11]), 10)) {
            assertThat(in.read(new byte[10])).isEqualTo(10);
            assertThatThrownBy(in::read)
                    .isInstanceOf(ScryfallCardProvider.DecodedLimit.TooLarge.class);
        }
    }

    @Test
    void imagesAreRehostedAndOnlyCardImagesOfTheImageHostAreDownloaded() throws Exception {
        ScryfallCardProvider provider = provider(false);
        assertThat(provider.imageHostingPolicy()).isEqualTo(ImageHostingPolicy.REHOST_REQUIRED);
        assertThat(provider.supportsImageDownloads()).isTrue();
        String url =
                STUB.scryfallImages()
                        + "normal/front/5/c/5c000000-0000-4000-8000-000000000001.jpg?1700000001";
        try (ImageDownload download = provider.openImage(url)) {
            assertThat(download.body().readAllBytes()).isNotEmpty();
        }
        assertThat(STUB.requests())
                .singleElement()
                .satisfies(
                        request -> {
                            assertThat(request.userAgent()).isEqualTo(AGENT);
                            assertThat(request.accept()).startsWith("image/jpeg");
                        });
        for (String refused :
                new String[] {
                    "https://cards.scryfall.io/normal/front/5/c/5c000000-0000-4000-8000-000000000001.jpg",
                    STUB.scryfallImages()
                            + "art_crop/front/5/c/5c000000-0000-4000-8000-000000000001.jpg",
                    STUB.scryfallImages() + "normal/front/5/c/../../../etc/passwd.jpg",
                    STUB.scryfallApi() + "cards/named?exact=x"
                }) {
            assertThatThrownBy(() -> provider.imageUri(refused))
                    .as(refused)
                    .isInstanceOf(ProviderRequestException.class);
        }
    }

    @Test
    void propertiesKeepScryfallsEtiquette() {
        String dir = snapshots.toString();
        assertThatThrownBy(
                        () ->
                                new ScryfallProperties(
                                        true,
                                        "mtg",
                                        "https://api.scryfall.com/",
                                        "unique_artwork",
                                        "https://data.scryfall.io/",
                                        "https://cards.scryfall.io/",
                                        "normal",
                                        AGENT,
                                        11,
                                        Duration.ofSeconds(1),
                                        Duration.ofSeconds(1),
                                        Duration.ofSeconds(1),
                                        1,
                                        Duration.ofMillis(1),
                                        Duration.ofMillis(1),
                                        Duration.ofSeconds(1),
                                        dir,
                                        false,
                                        Duration.ofHours(24),
                                        1))
                .hasMessageContaining("at most 10");
        assertThatThrownBy(
                        () ->
                                new ScryfallProperties(
                                        true,
                                        "mtg",
                                        "https://api.scryfall.com/",
                                        "unique_artwork",
                                        "https://data.scryfall.io/",
                                        "https://cards.scryfall.io/",
                                        "art_crop",
                                        AGENT,
                                        5,
                                        Duration.ofSeconds(1),
                                        Duration.ofSeconds(1),
                                        Duration.ofSeconds(1),
                                        1,
                                        Duration.ofMillis(1),
                                        Duration.ofMillis(1),
                                        Duration.ofSeconds(1),
                                        dir,
                                        false,
                                        Duration.ofHours(24),
                                        1))
                .hasMessageContaining("never a crop");
        assertThatThrownBy(
                        () ->
                                new ScryfallProperties(
                                        true,
                                        "mtg",
                                        "https://api.scryfall.com/",
                                        "unique_artwork",
                                        "https://data.scryfall.io/",
                                        "https://cards.scryfall.io/",
                                        "normal",
                                        AGENT,
                                        5,
                                        Duration.ofSeconds(1),
                                        Duration.ofSeconds(1),
                                        Duration.ofSeconds(1),
                                        1,
                                        Duration.ofMillis(1),
                                        Duration.ofMillis(1),
                                        Duration.ofSeconds(1),
                                        dir,
                                        false,
                                        Duration.ofHours(1),
                                        1))
                .hasMessageContaining("at least 24h");
    }

    /** A clock tests move forward. */
    static final class MovableClock extends Clock {
        private Instant now = Instant.now();

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
