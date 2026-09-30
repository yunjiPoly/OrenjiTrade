package com.orenjitrade.api.cards;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.games.domain.GameService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Admin catalog edits (sets, cards, printings): authorization, GameSchema validation, audit. Works
 * in a throw-away game (hidden afterwards) so the seeded catalog stays untouched for other suites.
 */
class AdminCatalogIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;
    @Autowired private GameService gameService;

    private String admin;
    private String gameSlug;

    @BeforeEach
    void createTestGame() {
        CatalogTestSupport.ensureImported(importService);
        admin = uniqueUid("catalog-admin");
        provisionWithRoles(admin, Role.ADMIN);
        gameSlug = "admintest-" + Long.toHexString(System.nanoTime() & 0xffffffL);
        ObjectNode game =
                gameBody(callJson(HttpMethod.GET, "/api/v1/games/yugioh", null, null, 200));
        game.put("slug", gameSlug);
        game.put("name", "Admin Test Game");
        game.put("shortName", "Admin Test");
        callJson(HttpMethod.POST, "/api/v1/admin/games", admin, game, 201);
    }

    @AfterEach
    void hideTestGame() {
        testUsers.update("UPDATE game SET status = 'HIDDEN' WHERE slug = ?", gameSlug);
        gameService.invalidate();
    }

    private ObjectNode gameBody(JsonNode game) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", game.path("name").asString());
        body.put("shortName", game.path("shortName").asString());
        body.put("publisher", game.path("publisher").asString());
        body.put("status", "ACTIVE");
        body.put("sortOrder", 900);
        ObjectNode node = jsonMapper.valueToTree(body);
        node.set("schema", game.path("schema").deepCopy());
        return node;
    }

    private static Map<String, Object> printing(String setId, String number, String edition) {
        Map<String, Object> body = new HashMap<>();
        body.put("setId", setId);
        body.put("collectorNumber", number);
        body.put("printingCode", "ADT-" + number);
        body.put("rarity", "Ultra Rare");
        body.put("edition", edition);
        body.put("language", "en");
        body.put("finish", "NORMAL");
        body.put("marketPrice", 12.5);
        body.put("marketPriceCurrency", "CAD");
        body.put("metadata", Map.of("artist", "Test Artist"));
        return body;
    }

    @Test
    void adminsCreateAndEditSetsCardsAndPrintingsWithAudit() {
        Map<String, Object> set = new HashMap<>();
        set.put("gameSlug", gameSlug);
        set.put("code", "adt");
        set.put("name", "Admin Test Set");
        set.put("releaseDate", "2026-01-15");
        set.put("totalCards", 10);
        JsonNode createdSet = callJson(HttpMethod.POST, "/api/v1/admin/sets", admin, set, 201);
        assertThat(createdSet.path("code").asString()).isEqualTo("ADT");
        assertThat(createdSet.path("game").asString()).isEqualTo(gameSlug);
        callJson(HttpMethod.POST, "/api/v1/admin/sets", admin, set, 409);
        String setId = createdSet.path("id").asString();
        set.put("name", "Admin Test Set (revised)");
        assertThat(
                        callJson(HttpMethod.PUT, "/api/v1/admin/sets/" + setId, admin, set, 200)
                                .path("name")
                                .asString())
                .isEqualTo("Admin Test Set (revised)");
        set.put("code", "XYZ");
        callJson(HttpMethod.PUT, "/api/v1/admin/sets/" + setId, admin, set, 400);

        Map<String, Object> card = new HashMap<>();
        card.put("gameSlug", gameSlug);
        card.put("name", "Crimson Test Wyvern");
        card.put("cardType", "Monster");
        card.put("subtype", "Effect");
        card.put("text", "A wyvern that only exists in integration tests.");
        card.put("metadata", Map.of("attribute", "FIRE", "level", 6, "atk", 2300, "def", 1500));
        JsonNode createdCard = callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 201);
        assertThat(createdCard.path("slug").asString()).isEqualTo("crimson-test-wyvern");
        assertThat(createdCard.path("printings").size()).isZero();
        assertThat(createdCard.path("primaryImageUrl").asString())
                .endsWith(
                        "/api/v1/public/placeholder-images/"
                                + gameSlug
                                + "/crimson-test-wyvern.svg");
        // Same name again: the slug gets a suffix.
        JsonNode twin = callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 201);
        assertThat(twin.path("slug").asString()).isEqualTo("crimson-test-wyvern-2");
        String cardId = createdCard.path("id").asString();

        card.put("name", "Crimson Test Wyvern (errata)");
        JsonNode updatedCard =
                callJson(HttpMethod.PUT, "/api/v1/admin/cards/" + cardId, admin, card, 200);
        assertThat(updatedCard.path("name").asString()).isEqualTo("Crimson Test Wyvern (errata)");
        assertThat(updatedCard.path("slug").asString()).isEqualTo("crimson-test-wyvern");

        JsonNode createdPrinting =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/cards/" + cardId + "/printings",
                        admin,
                        printing(setId, "EN001", "FIRST_EDITION"),
                        201);
        assertThat(createdPrinting.path("printing").path("printingCode").asString())
                .isEqualTo("ADT-EN001");
        assertThat(
                        createdPrinting
                                .path("printing")
                                .path("marketPrice")
                                .path("amount")
                                .decimalValue())
                .isEqualByComparingTo("12.50");
        assertThat(createdPrinting.path("printing").path("images").get(0).path("url").asString())
                .endsWith("/crimson-test-wyvern.svg");
        assertThat(createdPrinting.path("metadata").path("artist").asString())
                .isEqualTo("Test Artist");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/cards/" + cardId + "/printings",
                admin,
                printing(setId, "EN001", "FIRST_EDITION"),
                409);
        String printingId = createdPrinting.path("printing").path("id").asString();
        JsonNode updatedPrinting =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/admin/printings/" + printingId,
                        admin,
                        printing(setId, "EN001", "UNLIMITED"),
                        200);
        assertThat(updatedPrinting.path("printing").path("edition").asString())
                .isEqualTo("UNLIMITED");

        // Visible through the public catalog of the (active) test game, printing code included.
        assertThat(
                        CatalogTestSupport.names(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/cards?query=ADT-EN001",
                                        null,
                                        null,
                                        200)))
                .containsExactly("Crimson Test Wyvern (errata)");
        assertThat(
                        call(
                                        HttpMethod.GET,
                                        "/api/v1/public/placeholder-images/"
                                                + gameSlug
                                                + "/crimson-test-wyvern.svg",
                                        null,
                                        null)
                                .getStatus()
                                .value())
                .isEqualTo(200);

        List<Object> actions =
                testUsers
                        .query(
                                "SELECT action FROM audit_log WHERE target_id IN (?, ?, ?)"
                                        + " ORDER BY occurred_at",
                                setId,
                                cardId,
                                printingId)
                        .stream()
                        .map(row -> row.get("action"))
                        .toList();
        assertThat(actions)
                .contains(
                        "card_set.create",
                        "card_set.update",
                        "card.create",
                        "card.update",
                        "card_printing.create",
                        "card_printing.update");
    }

    @Test
    void writesAreValidatedAgainstTheGameSchema() {
        Map<String, Object> set = new HashMap<>();
        set.put("gameSlug", gameSlug);
        set.put("code", "VAL");
        set.put("name", "Validation Set");
        String setId =
                callJson(HttpMethod.POST, "/api/v1/admin/sets", admin, set, 201)
                        .path("id")
                        .asString();

        Map<String, Object> card = new HashMap<>();
        card.put("gameSlug", gameSlug);
        card.put("name", "Validation Golem");
        card.put("metadata", Map.of("level", "four"));
        JsonNode wrongType = callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 400);
        assertThat(wrongType.path("errors").get(0).path("field").asString())
                .isEqualTo("metadata.level");
        card.put("metadata", Map.of("level", 4, "customNote", "extra keys are allowed"));
        String cardId =
                callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 201)
                        .path("id")
                        .asString();
        card.put("gameSlug", "chess");
        callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 400);
        card.remove("gameSlug");
        callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 400);
        card.put("gameSlug", gameSlug);
        card.put("name", "");
        callJson(HttpMethod.POST, "/api/v1/admin/cards", admin, card, 400);

        String printingsUri = "/api/v1/admin/cards/" + cardId + "/printings";
        Map<String, Object> badEdition = printing(setId, "EN010", "GOLDEN");
        callJson(HttpMethod.POST, printingsUri, admin, badEdition, 400);
        Map<String, Object> badFinish = printing(setId, "EN010", "UNLIMITED");
        badFinish.put("finish", "HOLO");
        callJson(HttpMethod.POST, printingsUri, admin, badFinish, 400);
        Map<String, Object> badRarity = printing(setId, "EN010", "UNLIMITED");
        badRarity.put("rarity", "Mythic Rare");
        callJson(HttpMethod.POST, printingsUri, admin, badRarity, 400);
        Map<String, Object> badCode = printing(setId, "EN010", "UNLIMITED");
        badCode.put("printingCode", "no code");
        callJson(HttpMethod.POST, printingsUri, admin, badCode, 400);
        Map<String, Object> priceWithoutCurrency = printing(setId, "EN010", "UNLIMITED");
        priceWithoutCurrency.remove("marketPriceCurrency");
        callJson(HttpMethod.POST, printingsUri, admin, priceWithoutCurrency, 400);

        // A set of another game.
        String yugiohSet =
                callJson(HttpMethod.GET, "/api/v1/sets?game=yugioh&query=AZR", null, null, 200)
                        .path("items")
                        .get(0)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                printingsUri,
                admin,
                printing(yugiohSet, "EN010", "UNLIMITED"),
                400);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/cards/" + UUID.randomUUID() + "/printings",
                admin,
                printing(setId, "EN010", "UNLIMITED"),
                404);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/printings/" + UUID.randomUUID(),
                admin,
                printing(setId, "EN010", "UNLIMITED"),
                404);
        card.put("name", "Validation Golem");
        callJson(HttpMethod.PUT, "/api/v1/admin/cards/" + UUID.randomUUID(), admin, card, 404);
    }

    @Test
    void onlyAdminsMayWriteTheCatalog() {
        String collector = uniqueUid("catalog-collector");
        provisionCompliant(collector);
        String moderator = uniqueUid("catalog-moderator");
        provisionWithRoles(moderator, Role.MODERATOR);
        String superAdmin = uniqueUid("catalog-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        Map<String, Object> card = new HashMap<>();
        card.put("gameSlug", gameSlug);
        card.put("name", "Authorization Imp");

        for (String uri : List.of("/api/v1/admin/cards", "/api/v1/admin/sets")) {
            callJson(HttpMethod.POST, uri, null, card, 401);
            callJson(HttpMethod.POST, uri, collector, card, 403);
            callJson(HttpMethod.POST, uri, moderator, card, 403);
        }
        callJson(HttpMethod.GET, "/api/v1/admin/games", collector, null, 403);
        callJson(HttpMethod.GET, "/api/v1/admin/catalog/sync-runs", moderator, null, 403);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/printings/" + UUID.randomUUID(),
                collector,
                card,
                403);
        callJson(HttpMethod.POST, "/api/v1/admin/cards", superAdmin, card, 201);
    }
}
