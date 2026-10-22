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
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Scryfall adapter against the offline stub: the bulk file instead of per-card calls, a {@code
 * User-Agent} and an {@code Accept} header on every call, one download per bulk file kept raw and
 * reused, at most one refresh a day, nothing fetched in snapshot-only mode, the re-host-only image
 * policy and the bulk and image allow-lists.
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
                10L * 1024 * 1024);
    }

    private ScryfallCardProvider provider(boolean snapshotOnly) {
        return new ScryfallCardProvider(
                properties(
                        STUB.scryfallApi(),
                        STUB.scryfallData(),
                        STUB.scryfallImages(),
                        snapshots.toString(),
                        snapshotOnly),
                mapper,
                duration -> {},
                clock);
    }

    @Test
    void downloadsTheBulkFileOnceWithItsHeadersAndReusesItForADay() throws Exception {
        ScryfallCardProvider provider = provider(false);
        SyncResult first = provider.syncCards("mtg", SyncOptions.full());
        assertThat(first.cards()).hasSize(6);
        assertThat(first.providerVersion()).isEqualTo(CardSourceStub.SCRYFALL_VERSION);
        assertThat(STUB.requests())
                .extracting(CardSourceStub.Request::path)
                .containsExactly(
                        "/scryfall-api/bulk-data",
                        "/scryfall-data/unique-artwork/unique-artwork-"
                                + CardSourceStub.SCRYFALL_VERSION
                                + ".json");
        assertThat(STUB.requests())
                .allSatisfy(
                        request -> {
                            assertThat(request.userAgent()).isEqualTo(AGENT);
                            assertThat(request.accept()).contains("application/json");
                        });
        Path stored = snapshots.resolve(CardSourceStub.SCRYFALL_VERSION).resolve("bulk.json");
        assertThat(stored).exists();
        // Kept as the HTTP client hands it over (gzip or decoded): both are read back.
        assertThat(Files.size(stored)).isPositive();
        Files.write(stored, CardSourceStub.gzip(Files.readAllBytes(stored)));
        assertThat(provider.syncCards("mtg", SyncOptions.full()).cards()).hasSize(6);

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
    void aBulkFileOutsideTheBulkHostIsRefused() {
        STUB.downloadUri("https://elsewhere.example.test/unique-artwork/x.json");
        assertThatThrownBy(() -> provider(false).syncCards("mtg", SyncOptions.full()))
                .isInstanceOf(ProviderRequestException.class)
                .hasMessageContaining("outside the configured bulk host");
        assertThat(STUB.requests())
                .extracting(CardSourceStub.Request::path)
                .containsExactly("/scryfall-api/bulk-data");
        assertThat(ScryfallCardProvider.version("2026-10-20T09:03:12.345+00:00"))
                .isEqualTo("20261020090312");
        assertThatThrownBy(() -> ScryfallCardProvider.version("yesterday"))
                .isInstanceOf(ProviderRequestException.class);
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
