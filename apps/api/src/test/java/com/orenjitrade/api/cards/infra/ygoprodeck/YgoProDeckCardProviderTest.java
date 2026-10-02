package com.orenjitrade.api.cards.infra.ygoprodeck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.cards.domain.provider.ImageDownload;
import com.orenjitrade.api.cards.domain.provider.ImageHostingPolicy;
import com.orenjitrade.api.cards.domain.provider.ImageMissingAtSourceException;
import com.orenjitrade.api.cards.domain.provider.ProviderRequestException;
import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import com.orenjitrade.api.cards.domain.provider.SyncOptions;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.images.YgoProDeckStub;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * The YGOPRODeck adapter against the offline stub: checkDBVer first, one full download per database
 * version stored as a raw snapshot and reused afterwards, a descriptive User-Agent, the
 * re-host-only image policy and the image URL allow-list.
 */
class YgoProDeckCardProviderTest {

    static final YgoProDeckStub STUB = YgoProDeckStub.get();
    static final String AGENT = "OrenjiTrade-catalog-importer/test (+https://www.orenjitrade.com)";

    @TempDir Path snapshots;

    private final JsonMapper mapper =
            JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    @AfterEach
    void reset() {
        STUB.reset();
    }

    private YgoProDeckCardProvider provider(boolean snapshotOnly) {
        YgoProDeckProperties properties =
                new YgoProDeckProperties(
                        true,
                        "yugioh",
                        STUB.apiBaseUrl(),
                        STUB.imageBaseUrl(),
                        AGENT,
                        15,
                        Duration.ofSeconds(2),
                        Duration.ofSeconds(10),
                        Duration.ofSeconds(5),
                        2,
                        Duration.ofMillis(5),
                        Duration.ofMillis(10),
                        Duration.ofSeconds(5),
                        snapshots.toString(),
                        snapshotOnly);
        return new YgoProDeckCardProvider(properties, mapper);
    }

    @Test
    void theCatalogIsDownloadedOncePerDatabaseVersionAndReused() {
        YgoProDeckCardProvider provider = provider(false);
        assertThat(provider.imageHostingPolicy()).isEqualTo(ImageHostingPolicy.REHOST_REQUIRED);
        assertThat(provider.supportsImageDownloads()).isTrue();
        int cardInfo = STUB.hits("/api/v7/cardinfo.php");
        int checks = STUB.hits("/api/v7/checkDBVer.php");

        SyncResult first = provider.syncCards("yugioh", SyncOptions.full());
        assertThat(first.cards()).hasSize(YgoProDeckStub.TOTAL_CARDS);
        assertThat(first.providerVersion()).isEqualTo(STUB.version());
        Path dir = snapshots.resolve(STUB.version());
        assertThat(dir.resolve("cardinfo.json")).exists();
        assertThat(dir.resolve("cardsets.json")).exists();
        assertThat(dir.resolve("checkDBVer.json")).exists();
        assertThat(STUB.hits("/api/v7/cardinfo.php")).isEqualTo(cardInfo + 1);
        assertThat(STUB.userAgents().get("api")).isEqualTo(AGENT);

        SyncResult second = provider.syncCards("yugioh", SyncOptions.full());
        assertThat(second.cards()).hasSize(YgoProDeckStub.TOTAL_CARDS);
        assertThat(STUB.hits("/api/v7/checkDBVer.php")).isEqualTo(checks + 2);
        assertThat(STUB.hits("/api/v7/cardinfo.php")).as("snapshot reused").isEqualTo(cardInfo + 1);

        // Offline: the stored snapshot without any request.
        STUB.apiDown(true);
        assertThat(provider(true).syncCards("yugioh", SyncOptions.full()).cards())
                .hasSize(YgoProDeckStub.TOTAL_CARDS);
        assertThatThrownBy(() -> provider(false).syncCards("yugioh", SyncOptions.full()))
                .isInstanceOf(ProviderUnavailableException.class)
                .hasMessageContaining("checkDBVer.php");
    }

    @Test
    void imagesComeOnlyFromTheConfiguredImageBase() throws Exception {
        YgoProDeckCardProvider provider = provider(false);
        try (ImageDownload download = provider.openImage(STUB.imageBaseUrl() + "900000002.jpg")) {
            assertThat(download.contentType()).isEqualTo("image/jpeg");
            assertThat(download.body().readAllBytes()).isEqualTo(STUB.imageBytes("900000002"));
        }
        assertThat(STUB.userAgents().get("images")).isEqualTo(AGENT);
        assertThatThrownBy(() -> provider.openImage("https://evil.example/images/cards/1.jpg"))
                .isInstanceOf(ProviderRequestException.class);
        assertThatThrownBy(() -> provider.openImage(STUB.imageBaseUrl() + "../secret.jpg"))
                .isInstanceOf(ProviderRequestException.class);
        assertThatThrownBy(() -> provider.openImage(STUB.imageBaseUrl() + "1.jpg?x=1"))
                .isInstanceOf(ProviderRequestException.class);
        STUB.behave("900000004", YgoProDeckStub.Behaviour.NOT_FOUND);
        assertThatThrownBy(() -> provider.openImage(STUB.imageBaseUrl() + "900000004.jpg"))
                .isInstanceOf(ImageMissingAtSourceException.class);
        assertThat(Files.exists(snapshots)).isTrue();
    }
}
