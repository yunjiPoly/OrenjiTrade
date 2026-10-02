package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCacheProperties;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.infra.ygoprodeck.YgoProDeckCardProvider;
import com.orenjitrade.api.games.domain.GameService;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Base of the card image integration tests (ADR 0015): the YGOPRODeck adapter points at the offline
 * {@link YgoProDeckStub} and imports into the hidden test game {@value #GAME} (so the Yu-Gi-Oh!
 * mock catalog and the public game list of other tests stay untouched). Each test starts from an
 * empty cache.
 */
public abstract class AbstractCardImageIT extends AbstractIntegrationTest {

    public static final String GAME = "ygo-imgtest";
    public static final String PROVIDER = YgoProDeckCardProvider.PROVIDER_ID;

    protected static final YgoProDeckStub STUB = YgoProDeckStub.get();

    @Autowired protected CatalogImportService importService;
    @Autowired protected CardImageCache cache;
    @Autowired protected CardImageCacheProperties cacheProperties;
    @Autowired protected GameService gameService;

    @DynamicPropertySource
    static void ygoProDeckStub(DynamicPropertyRegistry registry) {
        registry.add("orenji.card-providers.ygoprodeck.api-base-url", STUB::apiBaseUrl);
        registry.add("orenji.card-providers.ygoprodeck.image-base-url", STUB::imageBaseUrl);
        registry.add("orenji.card-providers.ygoprodeck.game-slug", () -> GAME);
        registry.add(
                "orenji.card-providers.ygoprodeck.snapshot-dir",
                () -> STUB.snapshotDir().toString());
        registry.add("orenji.card-providers.ygoprodeck.requests-per-second", () -> "15");
        registry.add("orenji.card-providers.ygoprodeck.max-attempts", () -> "2");
        registry.add("orenji.card-images.on-demand.max-per-second", () -> "10");
        registry.add("orenji.card-images.cache.download-timeout", () -> "10s");
    }

    @BeforeEach
    void cleanCardImageState() {
        STUB.reset();
        ensureTestGame(false);
        cache.awaitIdle(Duration.ofSeconds(30));
        cache.clear(null);
        testUsers.update("DELETE FROM card_image_cache_reservation");
        cache.reconcile();
        testUsers.update(
                "UPDATE card_image SET cache_status = 'NOT_CACHED', attempt_count = 0, last_error ="
                        + " NULL, last_attempt_at = NULL WHERE provider = ?",
                PROVIDER);
    }

    /** Creates the test game (a copy of the yugioh GameSchema) and sets its status. */
    protected void ensureTestGame(boolean active) {
        testUsers.update(
                """
                INSERT INTO game (slug, name, short_name, publisher, status, sort_order, schema)
                SELECT ?, 'YGOPRODeck image test', 'YGO test', 'Konami', 'HIDDEN', 99, schema
                  FROM game WHERE slug = 'yugioh'
                ON CONFLICT (slug) DO NOTHING
                """,
                GAME);
        testUsers.update(
                "UPDATE game SET status = ? WHERE slug = ?", active ? "ACTIVE" : "HIDDEN", GAME);
        gameService.invalidate();
    }

    protected SyncRunView importCatalog(ImageMode mode, @Nullable Integer limit) {
        return importService.importNow(PROVIDER, GAME, SyncMode.FULL, mode, limit);
    }

    protected UUID gameId() {
        return (UUID) testUsers.query("SELECT id FROM game WHERE slug = ?", GAME).get(0).get("id");
    }

    protected UUID imageId(String providerImageId) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT id FROM card_image WHERE provider = ? AND provider_image_id"
                                        + " = ?",
                                PROVIDER,
                                providerImageId)
                        .get(0)
                        .get("id");
    }

    protected Map<String, Object> imageRow(String providerImageId) {
        return testUsers
                .query(
                        "SELECT * FROM card_image WHERE provider = ? AND provider_image_id = ?",
                        PROVIDER,
                        providerImageId)
                .get(0);
    }

    protected UUID printingId(String printingCode) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT p.id FROM card_printing p JOIN card c ON c.id = p.card_id"
                                        + " JOIN game g ON g.id = c.game_id WHERE g.slug = ? AND"
                                        + " p.printing_code = ? ORDER BY p.rarity LIMIT 1",
                                GAME,
                                printingCode)
                        .get(0)
                        .get("id");
    }

    protected int count(String sql, Object... args) {
        return testUsers.count(sql, args);
    }

    protected long usedBytes() {
        return ((Number)
                        testUsers
                                .query("SELECT used_bytes FROM card_image_cache_usage WHERE id = 1")
                                .get(0)
                                .get("used_bytes"))
                .longValue();
    }

    protected long reservedBytes() {
        return ((Number)
                        testUsers
                                .query(
                                        "SELECT coalesce(sum(bytes), 0) AS bytes FROM"
                                                + " card_image_cache_reservation WHERE expires_at >"
                                                + " now()")
                                .get(0)
                                .get("bytes"))
                .longValue();
    }

    /** Regular files below the cache directory (final and temporary). */
    protected List<Path> cacheFiles() {
        Path root = cache.directory();
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        try (Stream<Path> files = Files.walk(root)) {
            return files.filter(Files::isRegularFile).toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    protected List<Path> tempFiles() {
        return cacheFiles().stream()
                .filter(path -> path.getParent().getFileName().toString().equals(".tmp"))
                .toList();
    }

    protected long bytesOnDisk() {
        return cacheFiles().stream()
                .mapToLong(
                        path -> {
                            try {
                                return Files.size(path);
                            } catch (IOException e) {
                                return 0;
                            }
                        })
                .sum();
    }

    protected static void assertNoProviderUrl(String body) {
        assertThat(body)
                .as("no provider image URL may reach clients")
                .doesNotContain("ygoprodeck")
                .doesNotContain(STUB.imageHost())
                .doesNotContain(STUB.apiBaseUrl())
                .doesNotContain("/images/cards/");
    }
}
