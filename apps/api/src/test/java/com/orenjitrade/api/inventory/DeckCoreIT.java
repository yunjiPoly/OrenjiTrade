package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.png;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Deck cores (owner spec 2026-10-14, sections 7 and 12, stage R3): a binder sold as one bundle,
 * with its photos, one price as typed and its description as the note; it needs no cards and its
 * cards are its key cards. Only the owner edits a binder, its photos and its deck core fields; a
 * private, sold or blocked deck core is not public; public views show the photos and the price of a
 * deck core only, its key cards from its public cards, and never a city or a private note.
 */
class DeckCoreIT extends AbstractIntegrationTest {

    static final String SECRET = "secret-core-note-91c2";
    static final String BINDERS = "/api/v1/binders";

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    /** A discoverable collector in Manitoba (city Brandon, shown on their own profile only). */
    private String collector(String prefix) {
        String uid = uniqueUid(prefix);
        provisionCompliant(uid);
        setLocation(uid, "CA", "CA-MB", "Brandon");
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        return uid;
    }

    private Map<String, Object> core(String name, String visibility, String price) {
        Map<String, Object> body = binder(name, visibility);
        body.put("sellsAsCore", true);
        body.put("askingPriceText", price);
        body.put("description", "All NM, English. Sleeves included.");
        return body;
    }

    private String create(String uid, Map<String, Object> body) {
        return callJson(HttpMethod.POST, BINDERS, uid, body, 201).path("id").asString();
    }

    private String fileItem(String uid, String binderId, String ref, int quantity, String vis) {
        Map<String, Object> body = item(printing(testUsers, ref));
        body.put("binderId", binderId);
        body.put("quantity", quantity);
        body.put("visibility", vis);
        body.put("notes", SECRET);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    @Test
    void theOwnerMakesABinderADeckCoreWithAPriceAsTyped() {
        String uid = collector("core-owner");
        JsonNode created =
                callJson(HttpMethod.POST, BINDERS, uid, core("Moth core", "PUBLIC", " $180 "), 201);
        assertThat(created.path("sellsAsCore").asBoolean()).isTrue();
        assertThat(created.path("askingPriceText").asString()).isEqualTo("$180");
        assertThat(created.path("askingPrice").decimalValue()).isEqualByComparingTo("180.00");
        assertThat(created.path("currency").asString()).isEqualTo("CAD");
        assertThat(created.path("soldAt").isNull()).isTrue();
        assertThat(created.path("photos").isArray()).isTrue();
        assertThat(created.path("photos")).isEmpty();
        assertThat(created.path("previewImages")).isEmpty();
        assertThat(created.path("keyCards")).isEmpty();
        String id = created.path("id").asString();

        // A text price keeps no amount; the switch and the price are partial updates.
        JsonNode text =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + id,
                        uid,
                        Map.of("askingPriceText", "Trade only"),
                        200);
        assertThat(text.path("askingPriceText").asString()).isEqualTo("Trade only");
        assertThat(text.path("askingPrice").isNull()).isTrue();
        assertThat(text.path("sellsAsCore").asBoolean()).isTrue();

        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("askingPriceText", null);
        JsonNode cleared = callJson(HttpMethod.PATCH, BINDERS + "/" + id, uid, clear, 200);
        assertThat(cleared.path("askingPriceText").isNull()).isTrue();
        assertThat(cleared.path("askingPrice").isNull()).isTrue();

        JsonNode amount =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + id,
                        uid,
                        Map.of("askingPriceText", "95,50 $", "sellsAsCore", false),
                        200);
        assertThat(amount.path("sellsAsCore").asBoolean()).isFalse();
        assertThat(amount.path("askingPriceText").asString())
                .as("kept for the owner when the switch is off")
                .isEqualTo("95,50 $");
        assertThat(amount.path("askingPrice").decimalValue()).isEqualByComparingTo("95.50");

        // Validation: 40 characters at most, one line; the switch is never null.
        JsonNode tooLong =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + id,
                        uid,
                        Map.of("askingPriceText", "x".repeat(41)),
                        400);
        assertThat(tooLong.toString()).contains("askingPriceText");
        callJson(
                HttpMethod.PATCH,
                BINDERS + "/" + id,
                uid,
                Map.of("askingPriceText", "$1\n$2"),
                400);
        Map<String, Object> nullSwitch = new LinkedHashMap<>();
        nullSwitch.put("sellsAsCore", null);
        callJson(HttpMethod.PATCH, BINDERS + "/" + id, uid, nullSwitch, 400);
        Map<String, Object> badCreate = core("Bad", "PRIVATE", "y".repeat(41));
        callJson(HttpMethod.POST, BINDERS, uid, badCreate, 400);

        // Another collector edits nothing of it.
        String other = collector("core-other");
        callJson(
                HttpMethod.PATCH,
                BINDERS + "/" + id,
                other,
                Map.of("sellsAsCore", true, "askingPriceText", "$1"),
                404);
        assertThat(
                        callJson(HttpMethod.GET, BINDERS + "/" + id, uid, null, 200)
                                .path("askingPriceText")
                                .asString())
                .isEqualTo("95,50 $");
    }

    @Test
    void saveChangesConfirmsTheBinderAndItsCards() {
        String uid = collector("core-confirm");
        String id = create(uid, core("Stale core", "PUBLIC", "$50"));
        String card = fileItem(uid, id, "ygo-p012a", 3, "PUBLIC");
        testUsers.update(
                "UPDATE binder SET freshness_state = 'STALE', confirmed_at = now() - interval '40"
                        + " days' WHERE id = ?::uuid",
                id);
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE', confirmed_at = now() -"
                        + " interval '40 days' WHERE id = ?::uuid",
                card);
        JsonNode renamed =
                callJson(
                        HttpMethod.PATCH,
                        BINDERS + "/" + id,
                        uid,
                        Map.of("name", "Fresh core", "confirm", true),
                        200);
        assertThat(renamed.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(
                        testUsers
                                .query(
                                        "SELECT freshness_state FROM inventory_item WHERE id ="
                                                + " ?::uuid",
                                        card)
                                .get(0)
                                .get("freshness_state"))
                .isEqualTo("ACTIVE");
    }

    @Test
    void photosFollowTheItemPhotoRulesAndOnlyTheOwnerChangesThem() {
        String uid = collector("core-photos");
        String id = create(uid, core("Photo core", "PUBLIC", "$95"));
        String uri = BINDERS + "/" + id + "/images";

        JsonNode first = upload(uid, uri, png(800, 600), "core.png", MediaType.IMAGE_PNG, 201);
        assertThat(first.path("photos")).hasSize(1);
        JsonNode photo = first.path("photos").get(0);
        assertThat(photo.path("width").asInt()).isEqualTo(800);
        assertThat(photo.path("height").asInt()).isEqualTo(600);
        String firstUrl = photo.path("url").asString();
        assertThat(first.path("previewImages").get(0).asString())
                .as("a deck core's first photo is its preview")
                .isEqualTo(firstUrl);
        assertThat(photoStatus(firstUrl)).isEqualTo(200);
        upload(uid, uri, png(64, 64), "two.png", MediaType.IMAGE_PNG, 201);
        upload(uid, uri, png(64, 64), "three.png", MediaType.IMAGE_PNG, 201);
        JsonNode four = upload(uid, uri, png(64, 64), "four.png", MediaType.IMAGE_PNG, 201);
        assertThat(four.path("photos")).hasSize(4);
        JsonNode fifth = upload(uid, uri, png(64, 64), "five.png", MediaType.IMAGE_PNG, 409);
        assertThat(fifth.path("errorCode").asString()).isEqualTo("CONFLICT");

        // Not an image: 415, by content whatever the declared type.
        upload(
                uid,
                uri,
                "plain text".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                "fake.png",
                MediaType.IMAGE_PNG,
                415);

        // Another collector: 404 to add or remove, and nothing changes.
        String other = collector("core-photos-other");
        upload(other, uri, png(64, 64), "x.png", MediaType.IMAGE_PNG, 404);
        String photoId = photo.path("id").asString();
        callJson(HttpMethod.DELETE, uri + "/" + photoId, other, null, 404);

        // The owner removes one; its file goes with it.
        callJson(HttpMethod.DELETE, uri + "/" + photoId, uid, null, 204);
        callJson(HttpMethod.DELETE, uri + "/" + photoId, uid, null, 404);
        assertThat(photoStatus(firstUrl)).isEqualTo(404);
        JsonNode after = callJson(HttpMethod.GET, BINDERS + "/" + id, uid, null, 200);
        assertThat(after.path("photos")).hasSize(3);

        // Deleting the binder deletes its photos' files; its cards stay.
        String card = fileItem(uid, id, "ygo-p017a", 1, "PUBLIC");
        String remaining = after.path("photos").get(0).path("url").asString();
        assertThat(photoStatus(remaining)).isEqualTo(200);
        callJson(HttpMethod.DELETE, BINDERS + "/" + id, uid, null, 204);
        assertThat(photoStatus(remaining)).isEqualTo(404);
        assertThat(
                        testUsers.query(
                                "SELECT count(*) AS n FROM binder_image WHERE binder_id = ?::uuid",
                                id))
                .singleElement()
                .satisfies(row -> assertThat(row.get("n")).isEqualTo(0L));
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/inventory/items/" + card, uid, null, 200)
                                .path("binder")
                                .isNull())
                .as("the card stays in the inventory, unfiled")
                .isTrue();
    }

    @Test
    void aPublicDeckCoreNeedsNoCardsAndShowsItsPhotosPriceAndKeyCards() {
        String uid = collector("core-public");
        String handle = me(uid).path("handle").asString();
        String empty = create(uid, core("Empty core", "PUBLIC", "$40"));
        String id = create(uid, core("Moth Queen core", "PUBLIC", "$95"));
        fileItem(uid, id, "ygo-p012a", 2, "PUBLIC");
        fileItem(uid, id, "ygo-p012a", 1, "PUBLIC");
        fileItem(uid, id, "ygo-p017a", 2, "PUBLIC");
        fileItem(uid, id, "ygo-p019a", 4, "PRIVATE");
        String plain = create(uid, binder("Plain binder", "PUBLIC"));
        fileItem(uid, plain, "ygo-p012a", 1, "PUBLIC");
        upload(
                uid,
                BINDERS + "/" + plain + "/images",
                png(64, 64),
                "p.png",
                MediaType.IMAGE_PNG,
                201);
        JsonNode withPhoto =
                upload(
                        uid,
                        BINDERS + "/" + id + "/images",
                        png(64, 64),
                        "c.png",
                        MediaType.IMAGE_PNG,
                        201);
        String photoUrl = withPhoto.path("photos").get(0).path("url").asString();

        // The collector's list: the empty deck core shows, the plain empty binder would not.
        create(uid, binder("Plain empty", "PUBLIC"));
        JsonNode list =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + handle + "/binders",
                        null,
                        null,
                        200);
        assertThat(ids(list)).containsExactly(empty, id, plain);
        assertNoPrivateData(list);

        String viewer = uniqueUid("core-viewer");
        provisionCompliant(viewer);
        JsonNode page = callJson(HttpMethod.GET, "/api/v1/public/binders/" + id, viewer, null, 200);
        assertThat(page.path("sellsAsCore").asBoolean()).isTrue();
        assertThat(page.path("askingPriceText").asString()).isEqualTo("$95");
        assertThat(page.path("description").asString())
                .isEqualTo("All NM, English. Sleeves included.");
        assertThat(page.path("photos")).hasSize(1);
        assertThat(page.path("photos").get(0).path("url").asString()).isEqualTo(photoUrl);
        assertThat(page.path("previewImages").get(0).asString()).isEqualTo(photoUrl);
        assertThat(page.path("ownerPublicBinderCount").asInt()).isEqualTo(3);
        assertThat(page.path("owner").path("place").path("label").asString())
                .isEqualTo("Manitoba, Canada");
        List<String> keyCards = new ArrayList<>();
        page.path("keyCards")
                .forEach(
                        card ->
                                keyCards.add(
                                        card.path("name").asString()
                                                + " x"
                                                + card.path("quantity").asInt()));
        assertThat(keyCards)
                .as(
                        "every card of the core, the private one too (they sell only together),"
                                + " copies of a card together, most copies first")
                .containsExactly(
                        "Cursed Hourglass Relic x4",
                        "Verdant Moth Queen x3",
                        "Mirror Maze Trap x2");
        assertThat(page.path("itemCount").asLong())
                .as("the cards listed on their own: the private one is not")
                .isEqualTo(3);
        assertNoPrivateData(page);

        // The owner sees every card of it.
        JsonNode own = callJson(HttpMethod.GET, BINDERS + "/" + id, uid, null, 200);
        assertThat(own.path("keyCards")).hasSize(3);
        assertThat(own.path("keyCards").get(0).path("name").asString())
                .isEqualTo("Cursed Hourglass Relic");

        // A plain binder shows no photo and no price in public, a fan of card pictures.
        JsonNode plainPage =
                callJson(HttpMethod.GET, "/api/v1/public/binders/" + plain, viewer, null, 200);
        assertThat(plainPage.path("sellsAsCore").asBoolean()).isFalse();
        assertThat(plainPage.path("photos")).isEmpty();
        assertThat(plainPage.path("keyCards")).isEmpty();
        assertThat(plainPage.path("askingPriceText").isNull()).isTrue();
        assertThat(plainPage.path("previewImages")).hasSize(1);
        assertThat(plainPage.path("previewImages").get(0).asString()).doesNotContain("/binders/");

        // The profile counts the deck cores as public binders.
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 200)
                                .path("publicBinderCount")
                                .asInt())
                .isEqualTo(3);
    }

    @Test
    void theCardsOfADeckCoreKeepTheVisibilityTheCollectorGaveThem() {
        String uid = collector("core-cards");
        String viewer = uniqueUid("core-cards-viewer");
        provisionCompliant(viewer);
        // A private binder of private cards (cards added on the phone start private, stage R2).
        String id = create(uid, binder("Personal collection", "PRIVATE"));
        IsolatedCard mothCard = InventoryTestSupport.isolatedCard(testUsers, "ygo-p012a");
        IsolatedCard mazeCard = InventoryTestSupport.isolatedCard(testUsers, "ygo-p017a");
        String moth = fileCopies(uid, id, mothCard, 2, "PRIVATE");
        String maze = fileCopies(uid, id, mazeCard, 1, "PRIVATE");

        // "Sell as a deck core" turned on, public: buyers see its cards as key cards and its game.
        callJson(
                HttpMethod.PATCH,
                BINDERS + "/" + id,
                uid,
                Map.of("sellsAsCore", true, "visibility", "PUBLIC", "askingPriceText", "$60"),
                200);
        JsonNode page = callJson(HttpMethod.GET, "/api/v1/public/binders/" + id, viewer, null, 200);
        assertThat(keyCardNames(page)).containsExactly(mothCard.name(), mazeCard.name());
        assertThat(page.path("games").get(0).asString()).isEqualTo("yugioh");
        assertThat(deckCoresWith(mothCard, viewer)).contains(id);
        assertNoPrivateData(page);
        // Never listed alone: the cards stay private, absent from the card holders.
        assertThat(visibility(uid, moth)).isEqualTo("PRIVATE");
        assertThat(holders(mothCard, viewer)).doesNotContain(moth);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/public/binders/" + id + "/items",
                                        viewer,
                                        null,
                                        200)
                                .path("items"))
                .as("the core's public item list holds the cards listed on their own only")
                .isEmpty();

        // Taken out of the core: still private, and no longer one of its key cards.
        callJson(
                HttpMethod.POST,
                "/api/v1/inventory/items/bulk",
                uid,
                Map.of("action", "MOVE_TO_BINDER", "itemIds", List.of(maze)),
                200);
        assertThat(visibility(uid, maze)).isEqualTo("PRIVATE");
        assertThat(
                        keyCardNames(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/public/binders/" + id,
                                        viewer,
                                        null,
                                        200)))
                .containsExactly(mothCard.name());

        // The switch off: a plain public binder shows its public cards only, so none.
        callJson(HttpMethod.PATCH, BINDERS + "/" + id, uid, Map.of("sellsAsCore", false), 200);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/public/binders/" + id, viewer, null, 200)
                                .path("keyCards"))
                .isEmpty();
        assertThat(deckCoresWith(mothCard, viewer)).doesNotContain(id);

        // Deleting the core keeps the cards in the inventory, unfiled and still private.
        callJson(HttpMethod.PATCH, BINDERS + "/" + id, uid, Map.of("sellsAsCore", true), 200);
        callJson(HttpMethod.DELETE, BINDERS + "/" + id + "?deleteItems=false", uid, null, 204);
        JsonNode left = callJson(HttpMethod.GET, "/api/v1/inventory/items/" + moth, uid, null, 200);
        assertThat(left.path("binder").isNull()).isTrue();
        assertThat(left.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(left.path("effectivePublic").asBoolean()).isFalse();
        assertThat(holders(mothCard, viewer)).doesNotContain(moth);
        assertThat(holders(mazeCard, viewer)).doesNotContain(maze);
    }

    @Test
    void theOwnersKeyCardsLeaveOutADeletedCardUntilItIsRestored() {
        String uid = collector("core-deleted");
        String id = create(uid, core("Druid core", "PRIVATE", "$70"));
        fileItem(uid, id, "ygo-p012a", 2, "PRIVATE");
        String relic = fileItem(uid, id, "ygo-p019a", 7, "PRIVATE");
        assertThat(keyCardNames(callJson(HttpMethod.GET, BINDERS + "/" + id, uid, null, 200)))
                .containsExactly("Cursed Hourglass Relic", "Verdant Moth Queen");
        callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + relic, uid, null, 204);
        assertThat(keyCardNames(callJson(HttpMethod.GET, BINDERS + "/" + id, uid, null, 200)))
                .containsExactly("Verdant Moth Queen");
        callJson(HttpMethod.POST, "/api/v1/inventory/items/" + relic + "/restore", uid, null, 200);
        assertThat(keyCardNames(callJson(HttpMethod.GET, BINDERS + "/" + id, uid, null, 200)))
                .containsExactly("Cursed Hourglass Relic", "Verdant Moth Queen");
    }

    private static List<String> keyCardNames(JsonNode binder) {
        List<String> names = new ArrayList<>();
        binder.path("keyCards").forEach(card -> names.add(card.path("name").asString()));
        return names;
    }

    private String fileCopies(
            String uid, String binderId, IsolatedCard card, int quantity, String visibility) {
        Map<String, Object> body = item(card.printingId());
        body.put("binderId", binderId);
        body.put("quantity", quantity);
        body.put("visibility", visibility);
        body.put("notes", SECRET);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    private String visibility(String uid, String itemId) {
        return callJson(HttpMethod.GET, "/api/v1/inventory/items/" + itemId, uid, null, 200)
                .path("visibility")
                .asString();
    }

    /** The item ids of the card holders of {@code card} (all of them, deck cores included). */
    private List<String> holders(IsolatedCard card, String viewer) {
        List<String> ids = new ArrayList<>();
        callJson(
                        HttpMethod.GET,
                        "/api/v1/search/card-holders?region=americas-north&size=100&cardId="
                                + card.cardId(),
                        viewer,
                        null,
                        200)
                .path("items")
                .forEach(row -> ids.add(row.path("item").path("id").asString()));
        return ids;
    }

    private List<String> deckCoresWith(IsolatedCard card, String viewer) {
        return ids(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/deck-cores?region=americas-north&limit=10&cardId="
                                + card.cardId(),
                        viewer,
                        null,
                        200));
    }

    @Test
    void privateSoldAndBlockedDeckCoresAreNotPublic() {
        String uid = collector("core-hidden");
        String handle = me(uid).path("handle").asString();
        String hidden = create(uid, core("Private core", "PRIVATE", "$10"));
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + hidden, null, null, 404);

        String sold = create(uid, core("Sold core", "PUBLIC", "$20"));
        String card = fileItem(uid, sold, "ygo-p012a", 1, "PUBLIC");
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + sold, null, null, 200);
        testUsers.update("UPDATE binder SET sold_at = now() WHERE id = ?::uuid", sold);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + sold, null, null, 404);
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + handle + "/binders",
                                        null,
                                        null,
                                        200)))
                .doesNotContain(sold, hidden);
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + handle + "/inventory",
                                        null,
                                        null,
                                        200)))
                .as("the cards of a sold deck core are not public either")
                .doesNotContain(card);
        assertThat(
                        callJson(HttpMethod.GET, BINDERS + "/" + sold, uid, null, 200)
                                .path("soldAt")
                                .isNull())
                .isFalse();

        String open = create(uid, core("Open core", "PUBLIC", "$30"));
        String blocker = collector("core-blocker");
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + open, blocker, null, 200);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + me(uid).path("id").asString() + "/block",
                blocker,
                null,
                200);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + open, blocker, null, 404);
    }

    @Test
    void theExportCarriesTheDeckCoreFields() {
        String uid = collector("core-export");
        String id = create(uid, core("Export core", "PRIVATE", "$70"));
        upload(uid, BINDERS + "/" + id + "/images", png(64, 64), "e.png", MediaType.IMAGE_PNG, 201);
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", uid, null, 200);
        JsonNode row = null;
        for (JsonNode binder : export.path("sections").path("binders")) {
            if (id.equals(binder.path("id").asString())) {
                row = binder;
            }
        }
        assertThat(row).isNotNull();
        assertThat(row.path("sellsAsCore").asBoolean()).isTrue();
        assertThat(row.path("askingPriceText").asString()).isEqualTo("$70");
        assertThat(row.path("photos")).hasSize(1);
    }

    private int photoStatus(String url) {
        return http.get()
                .uri(URI.create(url).getPath())
                .exchange()
                .expectBody()
                .returnResult()
                .getStatus()
                .value();
    }

    private JsonNode upload(
            String uid,
            String uri,
            byte[] content,
            String filename,
            MediaType type,
            int expectedStatus) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(content) {
                            @Override
                            public String getFilename() {
                                return filename;
                            }
                        })
                .contentType(type);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(uri)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value())
                .as(
                        "POST %s -> %s",
                        uri,
                        new String(
                                result.getResponseBody() == null
                                        ? new byte[0]
                                        : result.getResponseBody(),
                                java.nio.charset.StandardCharsets.UTF_8))
                .isEqualTo(expectedStatus);
        return json(result);
    }

    /** No private notes and no geography beyond the state and country. */
    private static void assertNoPrivateData(JsonNode document) {
        String text = document.toString();
        assertThat(text).doesNotContain(SECRET);
        assertThat(text).doesNotContain("\"notes\"");
        assertThat(text).doesNotContain("\"lat\"").doesNotContain("\"lng\"");
        assertThat(text).doesNotContain("Brandon").doesNotContain("distance");
    }
}
