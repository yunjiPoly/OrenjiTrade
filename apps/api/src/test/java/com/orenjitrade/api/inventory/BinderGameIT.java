package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.games.domain.GameService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * A binder holds the cards of one game (stage G of the phone redesign): {@code POST /binders} takes
 * an ACTIVE game with cards (One Piece has none, an unknown or hidden game is refused) and makes a
 * Yu-Gi-Oh! binder without one (the paused web); {@code PATCH /binders/{id}} changes the game only
 * while the binder holds no card (a deleted card its undo can bring back counts), otherwise 409
 * BINDER_GAME_LOCKED; a card of another game is refused (409 BINDER_GAME_MISMATCH) when it is
 * added, moved, or changed to another game's printing, the bulk MOVE_TO_BINDER skips it per card,
 * and the camera scan's batch add refuses the whole batch.
 */
class BinderGameIT extends AbstractIntegrationTest {

    private static final String BINDERS = "/api/v1/binders";
    private static final String ITEMS = "/api/v1/inventory/items";

    @Autowired private CatalogImportService importService;
    @Autowired private GameService gameService;

    private String uid;
    private UUID ygo;
    private UUID pkm;
    private UUID mtg;

    @BeforeEach
    void catalogAndCollector() {
        InventoryTestSupport.ensureCatalog(importService);
        gameService.invalidate();
        uid = uniqueUid("binder-game");
        provisionCompliant(uid);
        ygo = InventoryTestSupport.printing(testUsers, "ygo-p001a");
        pkm = InventoryTestSupport.printing(testUsers, "pkm-p002a");
        mtg = InventoryTestSupport.printing(testUsers, "mtg-p001a");
    }

    private String gameId(String slug) {
        return testUsers
                .query("SELECT id FROM game WHERE slug = ?", slug)
                .get(0)
                .get("id")
                .toString();
    }

    private Map<String, Object> binderOf(String game) {
        Map<String, Object> body = binder("Binder " + InventoryTestSupport.token(), "PRIVATE");
        body.put("gameId", gameId(game));
        return body;
    }

    private String create(String game) {
        return callJson(HttpMethod.POST, BINDERS, uid, binderOf(game), 201).path("id").asString();
    }

    private String add(UUID printing, String binderId) {
        Map<String, Object> body = item(printing);
        body.put("binderId", binderId);
        return callJson(HttpMethod.POST, ITEMS, uid, body, 201).path("id").asString();
    }

    private static Map<String, Object> patchGame(String gameId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("gameId", gameId);
        return body;
    }

    @Test
    void aBinderIsMadeForAnActiveGameWithCards() {
        JsonNode pokemon = callJson(HttpMethod.POST, BINDERS, uid, binderOf("pokemon"), 201);
        assertThat(pokemon.path("game").asString()).isEqualTo("pokemon");
        assertThat(pokemon.path("gameId").asString()).isEqualTo(gameId("pokemon"));
        assertThat(callJson(HttpMethod.GET, BINDERS, uid, null, 200).findValuesAsString("game"))
                .contains("pokemon");

        // One Piece is ACTIVE but its catalogue holds no card yet.
        JsonNode onePiece = callJson(HttpMethod.POST, BINDERS, uid, binderOf("onepiece"), 400);
        assertThat(onePiece.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(onePiece.toString()).contains("gameId");
        Map<String, Object> unknown = binder("Unknown game", "PRIVATE");
        unknown.put("gameId", UUID.randomUUID().toString());
        callJson(HttpMethod.POST, BINDERS, uid, unknown, 400);

        // A hidden game holds no new binder.
        testUsers.update("UPDATE game SET status = 'HIDDEN' WHERE slug = 'mtg'");
        gameService.invalidate();
        try {
            callJson(HttpMethod.POST, BINDERS, uid, binderOf("mtg"), 400);
        } finally {
            testUsers.update("UPDATE game SET status = 'ACTIVE' WHERE slug = 'mtg'");
            gameService.invalidate();
        }

        // Without a game (the paused web has no game picker): Yu-Gi-Oh! until a first card.
        JsonNode web =
                callJson(HttpMethod.POST, BINDERS, uid, binder("Web binder", "PRIVATE"), 201);
        assertThat(web.path("game").asString()).isEqualTo("yugioh");
    }

    @Test
    void aBinderMadeWithoutAGameTakesTheGameOfItsFirstCard() {
        // The paused web makes binders without a game: the first card filed sets it.
        String web =
                callJson(HttpMethod.POST, BINDERS, uid, binder("Web binder", "PRIVATE"), 201)
                        .path("id")
                        .asString();
        String first = add(pkm, web);
        assertThat(
                        callJson(HttpMethod.GET, BINDERS + "/" + web, uid, null, 200)
                                .path("game")
                                .asString())
                .isEqualTo("pokemon");
        // From then on it holds Pokémon cards only.
        Map<String, Object> other = item(ygo);
        other.put("binderId", web);
        assertThat(callJson(HttpMethod.POST, ITEMS, uid, other, 409).path("errorCode").asString())
                .isEqualTo("BINDER_GAME_MISMATCH");
        // Empty again (its card left and its undo closed), the next card sets the game again.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("binderId", null);
        callJson(HttpMethod.PATCH, ITEMS + "/" + first, uid, out, 200);
        add(ygo, web);
        assertThat(
                        callJson(HttpMethod.GET, BINDERS + "/" + web, uid, null, 200)
                                .path("game")
                                .asString())
                .isEqualTo("yugioh");

        // The bulk move: the first card sets the game, a card of another game is skipped.
        String bulkBinder =
                callJson(HttpMethod.POST, BINDERS, uid, binder("Web bulk", "PRIVATE"), 201)
                        .path("id")
                        .asString();
        String magic = callJson(HttpMethod.POST, ITEMS, uid, item(mtg), 201).path("id").asString();
        String pokemon =
                callJson(HttpMethod.POST, ITEMS, uid, item(pkm), 201).path("id").asString();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "MOVE_TO_BINDER");
        body.put("itemIds", List.of(magic, pokemon));
        body.put("binderId", bulkBinder);
        JsonNode result = callJson(HttpMethod.POST, ITEMS + "/bulk", uid, body, 200);
        assertThat(result.path("updated").asInt()).isEqualTo(1);
        assertThat(result.path("skipped").get(0).path("reason").asString())
                .isEqualTo("BINDER_GAME_MISMATCH");
        assertThat(
                        callJson(HttpMethod.GET, BINDERS + "/" + bulkBinder, uid, null, 200)
                                .path("game")
                                .asString())
                .isEqualTo("mtg");

        // A binder made with a game never follows its cards.
        String chosen = create("pokemon");
        Map<String, Object> wrong = item(ygo);
        wrong.put("binderId", chosen);
        callJson(HttpMethod.POST, ITEMS, uid, wrong, 409);
    }

    @Test
    void theGameChangesOnlyWhileTheBinderHoldsNoCard() {
        String binderId = create("pokemon");
        JsonNode changed =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + binderId,
                        uid,
                        patchGame(gameId("mtg")),
                        200);
        assertThat(changed.path("game").asString()).isEqualTo("mtg");

        String card = add(mtg, binderId);
        JsonNode locked =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + binderId,
                        uid,
                        patchGame(gameId("pokemon")),
                        409);
        assertThat(locked.path("errorCode").asString()).isEqualTo("BINDER_GAME_LOCKED");
        // The same game again is no change.
        callJson(HttpMethod.PATCH, BINDERS + "/" + binderId, uid, patchGame(gameId("mtg")), 200);

        // A deleted card that its undo can still bring back keeps the game.
        callJson(HttpMethod.DELETE, ITEMS + "/" + card, uid, null, 204);
        assertThat(
                        callJson(
                                        HttpMethod.PATCH,
                                        BINDERS + "/" + binderId,
                                        uid,
                                        patchGame(gameId("pokemon")),
                                        409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("BINDER_GAME_LOCKED");
        testUsers.update(
                "UPDATE inventory_item SET restorable_until = NULL WHERE id = ?::uuid", card);
        JsonNode free =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + binderId,
                        uid,
                        patchGame(gameId("pokemon")),
                        200);
        assertThat(free.path("game").asString()).isEqualTo("pokemon");

        // Not to a game without cards, and never null.
        callJson(
                HttpMethod.PATCH,
                BINDERS + "/" + binderId,
                uid,
                patchGame(gameId("onepiece")),
                400);
        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("gameId", null);
        callJson(HttpMethod.PATCH, BINDERS + "/" + binderId, uid, clear, 400);
    }

    @Test
    void aCardOfAnotherGameIsRefusedWhenItIsAddedMovedOrChanged() {
        String yugiohBinder = create("yugioh");
        String pokemonBinder = create("pokemon");

        Map<String, Object> wrong = item(pkm);
        wrong.put("binderId", yugiohBinder);
        JsonNode refused = callJson(HttpMethod.POST, ITEMS, uid, wrong, 409);
        assertThat(refused.path("errorCode").asString()).isEqualTo("BINDER_GAME_MISMATCH");

        String unfiled =
                callJson(HttpMethod.POST, ITEMS, uid, item(pkm), 201).path("id").asString();
        Map<String, Object> move = new LinkedHashMap<>();
        move.put("binderId", yugiohBinder);
        assertThat(
                        callJson(HttpMethod.PATCH, ITEMS + "/" + unfiled, uid, move, 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("BINDER_GAME_MISMATCH");
        move.put("binderId", pokemonBinder);
        assertThat(
                        callJson(HttpMethod.PATCH, ITEMS + "/" + unfiled, uid, move, 200)
                                .path("binder")
                                .path("id")
                                .asString())
                .isEqualTo(pokemonBinder);

        // A filed card changed to another game's printing.
        String filed = add(ygo, yugiohBinder);
        Map<String, Object> printing = new LinkedHashMap<>();
        printing.put("printingId", mtg.toString());
        callJson(HttpMethod.PATCH, ITEMS + "/" + filed, uid, printing, 409);
        // ... unless it leaves the binder in the same change.
        printing.put("binderId", null);
        assertThat(
                        callJson(HttpMethod.PATCH, ITEMS + "/" + filed, uid, printing, 200)
                                .path("binder")
                                .isNull())
                .isTrue();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE binder_id = '"
                                        + yugiohBinder
                                        + "' AND deleted_at IS NULL"))
                .isZero();
    }

    @Test
    void theBulkMoveSkipsTheCardsOfAnotherGameOneByOne() {
        String yugiohBinder = create("yugioh");
        String yugiohCard =
                callJson(HttpMethod.POST, ITEMS, uid, item(ygo), 201).path("id").asString();
        String pokemonCard =
                callJson(HttpMethod.POST, ITEMS, uid, item(pkm), 201).path("id").asString();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", "MOVE_TO_BINDER");
        body.put("itemIds", List.of(yugiohCard, pokemonCard));
        body.put("binderId", yugiohBinder);
        JsonNode result = callJson(HttpMethod.POST, ITEMS + "/bulk", uid, body, 200);
        assertThat(result.path("updated").asInt()).isEqualTo(1);
        assertThat(result.path("skipped")).hasSize(1);
        assertThat(result.path("skipped").get(0).path("itemId").asString()).isEqualTo(pokemonCard);
        assertThat(result.path("skipped").get(0).path("reason").asString())
                .isEqualTo("BINDER_GAME_MISMATCH");
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + yugiohCard, uid, null, 200)
                                .path("binder")
                                .path("id")
                                .asString())
                .isEqualTo(yugiohBinder);
        assertThat(
                        callJson(HttpMethod.GET, ITEMS + "/" + pokemonCard, uid, null, 200)
                                .path("binder")
                                .isNull())
                .isTrue();
        assertThat(
                        callJson(HttpMethod.GET, BINDERS + "/" + yugiohBinder, uid, null, 200)
                                .path("itemCount")
                                .asLong())
                .isEqualTo(1);
    }

    @Test
    void theScanBatchIntoABinderOfAnotherGameAddsNothing() {
        String pokemonBinder = create("pokemon");
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("printingId", ygo.toString());
        line.put("quantity", 2);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("binderId", pokemonBinder);
        body.put("lines", List.of(line));
        JsonNode refused = callJson(HttpMethod.POST, ITEMS + "/batch", uid, body, 409);
        assertThat(refused.path("errorCode").asString()).isEqualTo("BINDER_GAME_MISMATCH");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item i JOIN user_account u ON u.id"
                                        + " = i.owner_id WHERE u.provider_uid = '"
                                        + uid
                                        + "'"))
                .isZero();
    }
}
