package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportReport;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.infra.CardSourceStub;
import com.orenjitrade.api.cards.infra.scryfall.ScryfallCardProvider;
import com.orenjitrade.api.cards.infra.tcgdex.TcgdexCardProvider;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Magic (Scryfall) and Pokémon (TCGdex) imported from the hand-written fixtures of each provider's
 * format into hidden test games (stage R10, ADR 0021): {@code hasCards} turns true, every printing,
 * rarity and set is stored, one image per artwork (Magic) or per printing (Pokémon) with each
 * printing on its own picture, the pictures reach collectors only through {@code
 * /api/v1/public/card-images/{id}}, a second import changes nothing, and nothing is fetched from a
 * provider (the catalogs come from local snapshots; the pictures from the offline stub).
 */
class CardSourcesImportIT extends AbstractCardImageIT {

    static final String MTG = "mtg-srctest";
    static final String PKM = "pkm-srctest";
    static final CardSourceStub SOURCES = CardSourceStub.get();
    static final Path SNAPSHOTS = snapshots();

    private static Path snapshots() {
        try {
            Path root = Files.createTempDirectory("orenjitrade-card-sources");
            Path scryfall =
                    Files.createDirectories(
                            root.resolve("scryfall").resolve(CardSourceStub.SCRYFALL_VERSION));
            Files.write(
                    scryfall.resolve("bulk.json"),
                    CardSourceStub.gzip(CardSourceStub.scryfallFixture(SOURCES.scryfallImages())));
            Path tcgdex =
                    Files.createDirectories(
                            root.resolve("tcgdex").resolve(CardSourceStub.TCGDEX_SHA));
            Files.write(
                    tcgdex.resolve("cards-database.zip"),
                    CardSourceStub.tcgdexArchive(CardSourceStub.TCGDEX_SHA));
            return root;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void cardSources(DynamicPropertyRegistry registry) {
        String scryfall = "orenji.card-providers.scryfall.";
        registry.add(scryfall + "game-slug", () -> MTG);
        registry.add(scryfall + "api-base-url", SOURCES::scryfallApi);
        registry.add(scryfall + "bulk-base-url", SOURCES::scryfallData);
        registry.add(scryfall + "image-base-url", SOURCES::scryfallImages);
        registry.add(scryfall + "snapshot-dir", () -> SNAPSHOTS.resolve("scryfall").toString());
        registry.add(scryfall + "snapshot-only", () -> "true");
        registry.add(scryfall + "requests-per-second", () -> "10");
        String tcgdex = "orenji.card-providers.tcgdex.";
        registry.add(tcgdex + "game-slug", () -> PKM);
        registry.add(tcgdex + "repository-api-url", SOURCES::githubApi);
        registry.add(tcgdex + "archive-base-url", SOURCES::codeload);
        registry.add(tcgdex + "asset-base-url", SOURCES::tcgdexAssets);
        registry.add(tcgdex + "snapshot-dir", () -> SNAPSHOTS.resolve("tcgdex").toString());
        registry.add(tcgdex + "snapshot-only", () -> "true");
        registry.add(tcgdex + "requests-per-second", () -> "10");
    }

    @BeforeEach
    void sourceGames() {
        SOURCES.reset();
        sourceGame(MTG, "mtg");
        sourceGame(PKM, "pokemon");
    }

    /** A hidden copy of a real game, emptied: the state of a game before its first import. */
    private void sourceGame(String slug, String copyOf) {
        testUsers.update(
                """
                INSERT INTO game (slug, name, short_name, publisher, status, sort_order, schema)
                SELECT ?, name || ' (source test)', short_name, publisher, 'HIDDEN', 98, schema
                  FROM game WHERE slug = ?
                ON CONFLICT (slug) DO NOTHING
                """,
                slug,
                copyOf);
        testUsers.update("UPDATE game SET status = 'HIDDEN' WHERE slug = ?", slug);
        testUsers.update(
                "DELETE FROM card WHERE game_id = (SELECT id FROM game WHERE slug = ?)", slug);
        testUsers.update(
                "DELETE FROM card_set WHERE game_id = (SELECT id FROM game WHERE slug = ?)", slug);
        gameService.invalidate();
    }

    private boolean hasCards(String admin, String slug) {
        for (JsonNode game : callJson(HttpMethod.GET, "/api/v1/admin/games", admin, null, 200)) {
            if (game.path("slug").asString().equals(slug)) {
                return game.path("hasCards").asBoolean();
            }
        }
        throw new AssertionError("no game " + slug);
    }

    private int countOf(String table, String slug) {
        String join =
                switch (table) {
                    case "card" -> "SELECT count(*) FROM card x JOIN game g ON g.id = x.game_id";
                    case "card_set" ->
                            "SELECT count(*) FROM card_set x JOIN game g ON g.id = x.game_id";
                    case "card_printing" ->
                            "SELECT count(*) FROM card_printing x JOIN card c ON c.id = x.card_id"
                                    + " JOIN game g ON g.id = c.game_id";
                    default -> "SELECT count(*) FROM card_image x JOIN game g ON g.id = x.game_id";
                };
        return count(join + " WHERE g.slug = ?", slug);
    }

    private List<String> rarities(String slug) {
        return testUsers
                .query(
                        "SELECT DISTINCT p.rarity FROM card_printing p JOIN card c ON c.id ="
                                + " p.card_id JOIN game g ON g.id = c.game_id WHERE g.slug = ? AND"
                                + " p.rarity IS NOT NULL ORDER BY p.rarity",
                        slug)
                .stream()
                .map(row -> (String) row.get("rarity"))
                .toList();
    }

    private Map<String, Object> printing(String code) {
        return testUsers
                .query(
                        "SELECT p.id, p.card_id, p.image_id, p.finish, p.rarity,"
                                + " p.collector_number, p.market_price, c.image_id AS"
                                + " card_image_id FROM card_printing"
                                + " p JOIN card c ON c.id = p.card_id WHERE p.printing_code = ?",
                        code)
                .get(0);
    }

    private UUID artwork(String provider, String providerImageId) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT id FROM card_image WHERE provider = ? AND"
                                        + " provider_image_id = ?",
                                provider,
                                providerImageId)
                        .get(0)
                        .get("id");
    }

    /** The picture collectors get for an artwork: a 320 px JPEG from OrenjiTrade's own route. */
    private void assertServed(UUID imageId) {
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/api/v1/public/card-images/" + imageId)
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString()).isEqualTo("image/jpeg");
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(result.getResponseBody()));
            assertThat(image.getWidth()).isEqualTo(320);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The printing codes {@code GET /cards/suggest} lists for {@code q} (PRINTING entries). */
    private List<String> suggestedCodes(String game, String q) {
        JsonNode suggestions =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/cards/suggest?game=" + game + "&limit=20&q=" + q,
                        null,
                        null,
                        200);
        List<String> codes = new ArrayList<>();
        suggestions.forEach(
                entry -> {
                    if (entry.path("kind").asString().equals("PRINTING")) {
                        codes.add(entry.path("printingCode").asString());
                    }
                });
        return codes;
    }

    /** The printing codes of the unified search's printings for {@code q}. */
    private List<String> searchedCodes(String game, String q) {
        JsonNode printings =
                callJson(
                                HttpMethod.GET,
                                "/api/v1/search?types=PRINTINGS&region=americas-north&game="
                                        + game
                                        + "&q="
                                        + q,
                                null,
                                null,
                                200)
                        .path("printings");
        List<String> codes = new ArrayList<>();
        printings.forEach(printing -> codes.add(printing.path("printingCode").asString()));
        return codes;
    }

    @Test
    void aMagicFixtureImportGivesTheGameItsCardsWithOneImagePerArtwork() {
        String admin = uniqueUid("r10-admin");
        provisionWithRoles(admin, Role.ADMIN);
        assertThat(hasCards(admin, MTG)).as("before its first import").isFalse();

        SyncRunView run =
                importService.importNow(
                        ScryfallCardProvider.PROVIDER_ID, MTG, SyncMode.FULL, ImageMode.ALL, null);
        assertThat(run.status()).as(String.valueOf(run.error())).isEqualTo(SyncRunStatus.SUCCEEDED);
        assertThat(run.providerDbVersion()).isEqualTo(CardSourceStub.SCRYFALL_VERSION);
        assertThat(hasCards(admin, MTG)).as("hasCards after a fixture import").isTrue();

        assertThat(countOf("card", MTG)).isEqualTo(6);
        assertThat(countOf("card_printing", MTG)).isEqualTo(8);
        assertThat(countOf("card_set", MTG)).isEqualTo(3);
        assertThat(rarities(MTG))
                .containsExactly("Bonus", "Common", "Mythic Rare", "Rare", "Special", "Uncommon");

        // One image per artwork, owned by the card; each printing on its own artwork.
        assertThat(countOf("card_image", MTG)).isEqualTo(6);
        Map<String, Object> original = printing("ZTK-12");
        Map<String, Object> classic = printing("ZCL-45");
        UUID originalArt = artwork("scryfall", "1a000000-0000-4000-8000-000000000001");
        UUID classicArt = artwork("scryfall", "1a000000-0000-4000-8000-000000000002");
        assertThat(original.get("image_id")).isEqualTo(originalArt);
        assertThat(classic.get("image_id")).isEqualTo(classicArt);
        assertThat(original.get("card_image_id"))
                .as("the card's primary artwork: its earliest printing's")
                .isEqualTo(originalArt);
        assertThat(classic.get("finish")).isEqualTo("FOIL");
        assertThat(classic.get("market_price")).isNull();
        assertThat(printing("ZCL-101").get("image_id")).as("no scan at Scryfall").isNull();
        assertThat(
                        count(
                                "SELECT count(*) FROM card_image WHERE provider = 'scryfall' AND"
                                        + " printing_id IS NOT NULL"))
                .isZero();

        // Nothing fetched for the catalog; the pictures from the image host, once each.
        assertThat(SOURCES.requests("/scryfall-api/")).isEmpty();
        assertThat(SOURCES.requests("/scryfall-data/")).isEmpty();
        CatalogImportReport report = run.report();
        assertThat(report).isNotNull();
        assertThat(report.imagesDownloaded()).isEqualTo(6);
        assertThat(report.imagesFailed()).isZero();
        assertThat(SOURCES.requests("/scryfall-images/normal/front/")).hasSize(6);
        assertServed(originalArt);
        assertServed(classicArt);

        // The card's pictures reach collectors through OrenjiTrade's route only.
        UUID cardId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT card_id FROM card_printing WHERE printing_code ="
                                                + " 'ZTK-12'")
                                .get(0)
                                .get("card_id");
        testUsers.update("UPDATE game SET status = 'ACTIVE' WHERE slug = ?", MTG);
        gameService.invalidate();
        try {
            JsonNode printings =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/cards/" + cardId + "/printings",
                            null,
                            null,
                            200);
            assertThat(printings).hasSize(3);
            assertThat(printings.toString())
                    .contains("/api/v1/public/card-images/" + originalArt)
                    .contains("/api/v1/public/card-images/" + classicArt)
                    .doesNotContain(SOURCES.baseUrl())
                    .doesNotContain("scryfall.io");

            // A code typed as the Magic card prints it (the set code apart from a padded number)
            // finds the printing ZTK-12 (review fix 1, U2), in Search typing and suggestions.
            JsonNode typed =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/cards/suggest?game=" + MTG + "&q=ZTK 0012",
                            null,
                            null,
                            200);
            assertThat(typed.get(0).path("kind").asString()).isEqualTo("PRINTING");
            assertThat(typed.get(0).path("printingCode").asString()).isEqualTo("ZTK-12");
            // Review fix 2 (R1-1): the number without its zeros is the whole number, in
            // suggestions and in the unified search: ZCL 0010 never lists ZCL-101 or ZCL-102.
            assertThat(suggestedCodes(MTG, "ZTK 0012")).containsExactly("ZTK-12");
            assertThat(suggestedCodes(MTG, "ZCL 0101")).containsExactly("ZCL-101");
            assertThat(suggestedCodes(MTG, "ZCL 0010")).isEmpty();
            assertThat(suggestedCodes(MTG, "ZCL 1"))
                    .as("typed without zeros, still a prefix")
                    .containsExactly("ZCL-101", "ZCL-102");
            assertThat(searchedCodes(MTG, "ZTK 0012")).containsExactly("ZTK-12");
            assertThat(searchedCodes(MTG, "ZCL 0010")).isEmpty();
            for (String query : new String[] {"ztk 12", "ZTK-012", "ztk - 0012"}) {
                JsonNode found =
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/cards?game=" + MTG + "&query=" + query,
                                null,
                                null,
                                200);
                assertThat(found.path("totalItems").asLong()).as(query).isEqualTo(1);
                assertThat(found.path("items").get(0).path("id").asString())
                        .as(query)
                        .isEqualTo(cardId.toString());
            }
        } finally {
            testUsers.update("UPDATE game SET status = 'HIDDEN' WHERE slug = ?", MTG);
            gameService.invalidate();
        }

        // A second import of the same file changes nothing and downloads nothing.
        SOURCES.reset();
        SyncRunView again =
                importService.importNow(
                        ScryfallCardProvider.PROVIDER_ID, MTG, SyncMode.FULL, ImageMode.ALL, null);
        assertThat(again.status()).isEqualTo(SyncRunStatus.SUCCEEDED);
        CatalogImportReport second = again.report();
        assertThat(second).isNotNull();
        assertThat(second.cardsCreated()).isZero();
        assertThat(second.cardsUpdated()).isZero();
        assertThat(second.setsUpserted()).isZero();
        assertThat(second.printingsUpserted()).isZero();
        assertThat(second.imagesDownloaded()).isZero();
        assertThat(SOURCES.requests()).isEmpty();
    }

    @Test
    void aPokemonFixtureImportGivesTheGameItsEnglishCardsWithOneImagePerPrinting() {
        String admin = uniqueUid("r10-admin");
        provisionWithRoles(admin, Role.ADMIN);
        assertThat(hasCards(admin, PKM)).as("before its first import").isFalse();

        SyncRunView run =
                importService.importNow(
                        TcgdexCardProvider.PROVIDER_ID, PKM, SyncMode.FULL, ImageMode.ALL, null);
        assertThat(run.status()).as(String.valueOf(run.error())).isEqualTo(SyncRunStatus.SUCCEEDED);
        assertThat(run.providerDbVersion()).isEqualTo(CardSourceStub.TCGDEX_SHA);
        assertThat(hasCards(admin, PKM)).as("hasCards after a fixture import").isTrue();

        assertThat(countOf("card", PKM)).isEqualTo(4);
        assertThat(countOf("card_printing", PKM)).isEqualTo(7);
        assertThat(countOf("card_set", PKM)).isEqualTo(3);
        assertThat(rarities(PKM)).containsExactly("Common", "Double rare", "Promo", "Uncommon");
        assertThat(
                        count(
                                "SELECT count(*) FROM card_printing p JOIN card c ON c.id ="
                                        + " p.card_id JOIN game g ON g.id = c.game_id WHERE g.slug"
                                        + " = ? AND p.language <> 'en'",
                                PKM))
                .as("English only")
                .isZero();
        assertThat(
                        count(
                                "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id"
                                        + " WHERE g.slug = ? AND c.name IN ('Lost Card',"
                                        + " 'Generated Card')",
                                PKM))
                .isZero();

        // One image per printing, each printing on its own.
        assertThat(countOf("card_image", PKM)).isEqualTo(7);
        for (String code : List.of("ZSK-001", "EMR-014", "TST25-007")) {
            Map<String, Object> row = printing(code);
            assertThat(row.get("image_id")).as(code).isNotNull();
        }
        assertThat(printing("ZSK-001").get("card_image_id"))
                .isEqualTo(artwork("tcgdex", "tst1-001"));
        assertThat(printing("EMR-014").get("image_id")).isEqualTo(artwork("tcgdex", "tst2-014"));

        assertThat(SOURCES.requests("/github/")).isEmpty();
        assertThat(SOURCES.requests("/codeload/")).isEmpty();
        CatalogImportReport report = run.report();
        assertThat(report).isNotNull();
        assertThat(report.imagesDownloaded()).isEqualTo(7);
        assertThat(SOURCES.requests("/tcgdex-assets/en/")).hasSize(7);
        assertServed(artwork("tcgdex", "tst2-014"));

        // Review fix 2 (R1-1, R1-2): Pokémon codes keep TCGdex's padded number, so a code typed
        // as printed lists that printing only: ZSK 001 never ZSK-100 or ZSK-101 through the
        // number without its zeros, a padded code the catalogue lacks (EMR 001) never another
        // card's EMR-150, and each printing once.
        testUsers.update("UPDATE game SET status = 'ACTIVE' WHERE slug = ?", PKM);
        gameService.invalidate();
        try {
            assertThat(suggestedCodes(PKM, "ZSK 001")).containsExactly("ZSK-001");
            assertThat(suggestedCodes(PKM, "zsk-001")).containsExactly("ZSK-001");
            assertThat(suggestedCodes(PKM, "EMR 001")).isEmpty();
            assertThat(suggestedCodes(PKM, "ZSK-00")).containsExactly("ZSK-001");
            assertThat(suggestedCodes(PKM, "ZSK 1")).containsExactly("ZSK-100", "ZSK-101");
            assertThat(searchedCodes(PKM, "ZSK 001")).containsExactly("ZSK-001");
            assertThat(searchedCodes(PKM, "EMR 001")).isEmpty();
            JsonNode found =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/cards?game=" + PKM + "&query=ZSK 001",
                            null,
                            null,
                            200);
            assertThat(found.path("totalItems").asLong()).isEqualTo(1);
            assertThat(found.path("items").get(0).path("id").asString())
                    .isEqualTo(String.valueOf(printing("ZSK-001").get("card_id")));
        } finally {
            testUsers.update("UPDATE game SET status = 'HIDDEN' WHERE slug = ?", PKM);
            gameService.invalidate();
        }

        SOURCES.reset();
        SyncRunView again =
                importService.importNow(
                        TcgdexCardProvider.PROVIDER_ID, PKM, SyncMode.FULL, ImageMode.ALL, null);
        CatalogImportReport second = again.report();
        assertThat(second).isNotNull();
        assertThat(second.cardsCreated() + second.cardsUpdated() + second.printingsUpserted())
                .isZero();
        assertThat(SOURCES.requests()).isEmpty();
    }
}
