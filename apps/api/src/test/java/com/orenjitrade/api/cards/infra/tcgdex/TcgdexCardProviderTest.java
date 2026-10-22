package com.orenjitrade.api.cards.infra.tcgdex;

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
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

/**
 * The TCGdex adapter against the offline stub: one call for the newest commit, the repository
 * archive downloaded once (not one call per card) and kept raw with its MIT licence, at most one
 * refresh a day, a {@code User-Agent} and an {@code Accept} header on every call, nothing fetched
 * in snapshot-only mode, the re-host-only image policy and the image allow-list.
 */
class TcgdexCardProviderTest {

    static final CardSourceStub STUB = CardSourceStub.get();
    static final String AGENT = "OrenjiTrade-catalog-importer/test (+https://www.orenjitrade.com)";

    @TempDir Path snapshots;

    private final MovableClock clock = new MovableClock();
    private final JsonMapper mapper = JsonMapper.builder().build();

    @AfterEach
    void reset() {
        STUB.reset();
    }

    static TcgdexProperties properties(
            String api, String archives, String assets, String snapshotDir, boolean snapshotOnly) {
        return new TcgdexProperties(
                true,
                "pokemon",
                api,
                "master",
                archives,
                assets,
                "high.jpg",
                List.of("tcgp"),
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

    private TcgdexCardProvider provider(boolean snapshotOnly) {
        return new TcgdexCardProvider(
                properties(
                        STUB.githubApi(),
                        STUB.codeload(),
                        STUB.tcgdexAssets(),
                        snapshots.toString(),
                        snapshotOnly),
                mapper,
                duration -> {},
                clock);
    }

    @Test
    void downloadsTheArchiveOnceWithItsLicenceAndReusesItForADay() throws Exception {
        TcgdexCardProvider provider = provider(false);
        SyncResult first = provider.syncCards("pokemon", SyncOptions.full());
        assertThat(first.cards()).hasSize(4);
        assertThat(first.providerVersion()).isEqualTo(CardSourceStub.TCGDEX_SHA);
        assertThat(STUB.requests())
                .extracting(CardSourceStub.Request::path, CardSourceStub.Request::accept)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                "/github/repos/tcgdex/cards-database/commits/master",
                                "application/vnd.github.sha"),
                        org.assertj.core.groups.Tuple.tuple(
                                "/codeload/" + CardSourceStub.TCGDEX_SHA, "application/zip"));
        assertThat(STUB.requests()).allMatch(request -> AGENT.equals(request.userAgent()));
        Path dir = snapshots.resolve(CardSourceStub.TCGDEX_SHA);
        assertThat(dir.resolve("cards-database.zip")).exists();
        assertThat(Files.readString(dir.resolve("LICENSE"))).startsWith("MIT License");

        STUB.reset();
        clock.advance(Duration.ofHours(23));
        assertThat(provider.syncCards("pokemon", SyncOptions.full()).cards()).hasSize(4);
        assertThat(STUB.requests()).as("an archive younger than a day: no call").isEmpty();

        clock.advance(Duration.ofHours(2));
        provider.syncCards("pokemon", SyncOptions.full());
        assertThat(STUB.requests())
                .as("the same commit: no download")
                .extracting(CardSourceStub.Request::path)
                .containsExactly("/github/repos/tcgdex/cards-database/commits/master");

        STUB.reset();
        String newer = "fedcba9876543210fedcba9876543210fedcba98";
        STUB.tcgdexSha(newer);
        clock.advance(Duration.ofHours(25));
        assertThat(provider.syncCards("pokemon", SyncOptions.full()).providerVersion())
                .isEqualTo(newer);
        assertThat(STUB.requests()).hasSize(2);
    }

    @Test
    void snapshotOnlyNeverCallsGitHub() throws Exception {
        assertThatThrownBy(() -> provider(true).syncCards("pokemon", SyncOptions.full()))
                .isInstanceOf(ProviderUnavailableException.class);
        Path dir = Files.createDirectories(snapshots.resolve(CardSourceStub.TCGDEX_SHA));
        Files.write(
                dir.resolve("cards-database.zip"),
                CardSourceStub.tcgdexArchive(CardSourceStub.TCGDEX_SHA));
        assertThat(provider(true).syncCards("pokemon", SyncOptions.full()).cards()).hasSize(4);
        assertThat(STUB.requests()).isEmpty();
    }

    @Test
    void anAnswerThatIsNotACommitIsRefused() {
        STUB.tcgdexSha("<html>rate limited</html>");
        assertThatThrownBy(() -> provider(false).syncCards("pokemon", SyncOptions.full()))
                .isInstanceOf(ProviderRequestException.class);
        assertThat(STUB.requests(("/codeload/"))).isEmpty();
    }

    @Test
    void imagesAreRehostedAndOnlyCardImagesOfTheAssetHostAreDownloaded() throws Exception {
        TcgdexCardProvider provider = provider(false);
        assertThat(provider.imageHostingPolicy()).isEqualTo(ImageHostingPolicy.REHOST_REQUIRED);
        assertThat(provider.supportsImageDownloads()).isTrue();
        try (ImageDownload download =
                provider.openImage(STUB.tcgdexAssets() + "en/tst/tst2.5/007/high.jpg")) {
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
                    "https://assets.tcgdex.net/en/tst/tst1/001/high.jpg",
                    STUB.tcgdexAssets() + "fr/tst/tst1/001/high.jpg",
                    STUB.tcgdexAssets() + "en/tst/../../001/high.jpg",
                    // Three path parts as the pattern wants, one of them "..": refused all the
                    // same.
                    STUB.tcgdexAssets() + "en/tst/../001/high.jpg",
                    STUB.tcgdexAssets() + "en/tst/tst1/001/high.svg",
                    STUB.githubApi() + "commits/master"
                }) {
            assertThatThrownBy(() -> provider.imageUri(refused))
                    .as(refused)
                    .isInstanceOf(ProviderRequestException.class);
        }
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
