package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.messaging.MessagingTestSupport;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Contract test (ADR 0015): every DTO that carries card imagery (catalog search, details,
 * printings, sets, suggestions, unified search, inventory, public binders and their covers,
 * collector pages, wishlists, message card and offer links, notification payloads, admin listings)
 * gets its URL from the single resolver — cached and not cached provider artworks point at
 * OrenjiTrade's own {@code /api/v1/public/card-images/{id}}, cards without artwork at the
 * placeholder — and no response (nor a stored notification) ever contains a YGOPRODeck (or stub
 * provider) image URL.
 */
class CardImageUrlContractIT extends AbstractCardImageIT {

    private static final String CARD_IMAGES = "/api/v1/public/card-images/";
    private static final String PLACEHOLDERS = "/api/v1/public/placeholder-images/";
    private static final Duration WAIT = Duration.ofSeconds(20);

    @BeforeEach
    void activeTestGame() {
        ensureTestGame(true);
        importCatalog(ImageMode.NONE, null);
    }

    @AfterEach
    void hideTestGame() {
        ensureTestGame(false);
    }

    private UUID cardId(String externalId) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT id FROM card WHERE external_ref ->> 'provider' ="
                                        + " 'ygoprodeck' AND external_ref ->> 'id' = ?",
                                externalId)
                        .get(0)
                        .get("id");
    }

    private JsonNode get(String uri, String uid) {
        JsonNode body = callJson(HttpMethod.GET, uri, uid, null, 200);
        assertNoProviderUrl(body.toString());
        return body;
    }

    /** Every image URL field anywhere in a document. */
    private static List<String> imageUrls(JsonNode node) {
        List<String> urls = new ArrayList<>();
        collect(node, null, urls);
        return urls;
    }

    private static void collect(JsonNode node, String field, List<String> urls) {
        if (node.isObject()) {
            node.properties().forEach(entry -> collect(entry.getValue(), entry.getKey(), urls));
        } else if (node.isArray()) {
            node.forEach(child -> collect(child, field, urls));
        } else if (node.isString()
                && field != null
                && (field.equals("imageUrl")
                        || field.equals("cardImageUrl")
                        || field.equals("primaryImageUrl")
                        || field.equals("coverImageUrl")
                        || field.equals("url"))) {
            urls.add(node.asString());
        }
    }

    private static void assertCardImageUrls(JsonNode body, String context) {
        List<String> urls = imageUrls(body);
        assertThat(urls).as(context + " carries card images").isNotEmpty();
        for (String url : urls) {
            assertThat(url)
                    .as(context)
                    .matches(
                            "^http://localhost:[0-9]+("
                                    + CARD_IMAGES
                                    + "[0-9a-f-]{36}|"
                                    + PLACEHOLDERS
                                    + "[a-z0-9-]+/[a-z0-9-]+\\.svg)$");
        }
    }

    @Test
    void everyCardImageUrlComesFromOrenjiTradeAndNeverFromTheProvider() {
        UUID dragonImage = imageId("900000001");
        assertThat(cache.ensureCached(dragonImage).cached()).isTrue();
        UUID dragon = cardId("900000001");
        UUID trap = cardId("900000007");

        // A discoverable collector with a public binder holding test printings.
        String owner = uniqueUid("img-contract");
        provisionCompliant(owner);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                owner,
                InventoryTestSupport.privacy(true, "PUBLIC"),
                200);
        String handle = me(owner).path("handle").asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                owner,
                MessagingTestSupport.profile(handle),
                200);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner,
                                InventoryTestSupport.binder("Real art", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        for (String code : List.of("ZTST-EN001", "ZTPR-EN001", "ZTS2-EN007")) {
            Map<String, Object> item = InventoryTestSupport.item(printingId(code));
            item.put("binderId", binderId);
            item.put("availability", "TRADE");
            callJson(HttpMethod.POST, "/api/v1/inventory/items", owner, item, 201);
        }
        Map<String, Object> wish = new LinkedHashMap<>();
        wish.put("cardId", cardId("900000006").toString());
        callJson(HttpMethod.POST, "/api/v1/wishlist", owner, wish, 201);

        // A private message with a card link.
        String friend = uniqueUid("img-friend");
        provisionCompliant(friend);
        String friendHandle = me(friend).path("handle").asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                friend,
                MessagingTestSupport.profile(friendHandle),
                200);
        UUID friendId = testUsers.idOf(friend);
        String conversation =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                owner,
                                Map.of("recipientId", friendId.toString()),
                                201)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversation + "/messages",
                owner,
                MessagingTestSupport.message(
                        "CARD_LINK", "Real art", "cardPrintingId", printingId("ZTST-EN001")),
                201);

        // Catalog.
        JsonNode cards = get("/api/v1/cards?game=" + GAME + "&size=100", null);
        assertCardImageUrls(cards, "card search");
        JsonNode detail = get("/api/v1/cards/" + dragon, null);
        assertThat(detail.path("primaryImageUrl").asString()).endsWith(CARD_IMAGES + dragonImage);
        detail.path("printings")
                .forEach(
                        printing ->
                                assertThat(printing.path("images").get(0).path("url").asString())
                                        .as("printings resolve through the card's artwork")
                                        .endsWith(CARD_IMAGES + dragonImage));
        assertCardImageUrls(detail, "card detail");
        assertThat(get("/api/v1/cards/" + trap, null).path("primaryImageUrl").asString())
                .as("no artwork: placeholder")
                .contains(PLACEHOLDERS + GAME + "/");
        assertCardImageUrls(get("/api/v1/cards/" + dragon + "/printings", null), "printings");
        assertCardImageUrls(get("/api/v1/printings/" + printingId("ZTPR-EN001"), null), "printing");
        UUID setId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT s.id FROM card_set s JOIN game g ON g.id ="
                                                + " s.game_id WHERE g.slug = ? AND s.code = 'ZTST'",
                                        GAME)
                                .get(0)
                                .get("id");
        assertCardImageUrls(get("/api/v1/sets/" + setId, null), "set");
        assertCardImageUrls(get("/api/v1/cards/suggest?q=Zephyrine&game=" + GAME, null), "suggest");
        assertCardImageUrls(get("/api/v1/cards/suggest?q=ZTST-EN0&game=" + GAME, null), "codes");
        assertCardImageUrls(get("/api/v1/search?q=Zephyrine&game=" + GAME, owner), "search");
        assertCardImageUrls(get("/api/v1/search/suggest?q=Zephyrine", owner), "search suggest");

        // Members' data.
        assertCardImageUrls(get("/api/v1/inventory/items", owner), "inventory");
        assertCardImageUrls(get("/api/v1/binders", owner), "own binders");
        assertCardImageUrls(get("/api/v1/public/binders/" + binderId, null), "public binder");
        assertCardImageUrls(
                get("/api/v1/public/binders/" + binderId + "/items", null), "binder items");
        assertCardImageUrls(
                get("/api/v1/collectors/" + handle + "/binders", owner), "collector binders");
        assertCardImageUrls(
                get("/api/v1/collectors/" + handle + "/inventory", owner), "collector inventory");
        assertCardImageUrls(get("/api/v1/wishlist", owner), "wishlist");
        assertCardImageUrls(
                get("/api/v1/conversations/" + conversation + "/messages", friend),
                "message card link");
        get("/api/v1/conversations", friend);
    }

    @Test
    void notificationsOfferLinksAndAdminListingsCarryOrenjiTradePictures() {
        UUID dragonImage = imageId("900000001");
        assertThat(cache.ensureCached(dragonImage).cached()).isTrue();
        UUID dragon = cardId("900000001");
        String dragonPicture = "^http://localhost:[0-9]+" + CARD_IMAGES + dragonImage + "$";

        // A seller and a collector of the same region who wishes for the dragon (any printing).
        String seller = uniqueUid("img-seller");
        UUID sellerId = collector(seller);
        String wisher = uniqueUid("img-wisher");
        collector(wisher);
        callJson(
                HttpMethod.POST,
                "/api/v1/wishlist",
                wisher,
                Map.of("cardId", dragon.toString()),
                201);

        // The seller lists another printing of the dragon: WISHLIST_ALERT for the wisher.
        Map<String, Object> listing = InventoryTestSupport.item(printingId("ZTS2-EN010"));
        listing.put("visibility", "PUBLIC");
        listing.put("availability", "TRADE_OR_SALE");
        listing.put("askingPrice", new BigDecimal("45.00"));
        listing.put("acceptsOffers", true);
        String itemId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", seller, listing, 201)
                        .path("id")
                        .asString();
        assertCardNotification(awaitNotification(wisher, "WISHLIST_ALERT"), dragonPicture);

        // The wisher makes an offer: OFFER_RECEIVED for the seller, SYSTEM message with the link.
        Map<String, Object> offer = new LinkedHashMap<>();
        offer.put("itemId", itemId);
        offer.put("kind", "CASH");
        offer.put("cashAmount", new BigDecimal("40.00"));
        callJson(HttpMethod.POST, "/api/v1/offers", wisher, offer, 201);
        assertCardNotification(awaitNotification(seller, "OFFER_RECEIVED"), dragonPicture);
        String conversation =
                get("/api/v1/conversations", wisher).path("items").get(0).path("id").asString();
        JsonNode messages = get("/api/v1/conversations/" + conversation + "/messages", wisher);
        JsonNode link = messages.path("items").get(0).path("payload").path("offer");
        assertThat(link.path("summary").asString()).contains("Zephyrine Test Dragon");
        assertThat(link.path("imageUrl").asString()).as("offer link").matches(dragonPicture);
        assertCardImageUrls(messages, "message offer link");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM message WHERE conversation_id = ?::uuid AND"
                                        + " payload::text LIKE '%card-images%'",
                                conversation))
                .as("pictures are resolved when read, never stored with a message")
                .isZero();

        // The admin console's listings.
        String admin = uniqueUid("img-admin");
        provisionWithRoles(admin, Role.ADMIN);
        JsonNode listings = get("/api/v1/admin/listings?size=100&ownerId=" + sellerId, admin);
        assertCardImageUrls(listings, "admin listings");
        JsonNode row = null;
        for (JsonNode candidate : listings.path("items")) {
            if (itemId.equals(candidate.path("item").path("id").asString())) {
                row = candidate;
            }
        }
        assertThat(row).as("the seller's listing").isNotNull();
        assertThat(row.path("item").path("imageUrl").asString()).matches(dragonPicture);
        JsonNode hidden =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/listings/" + itemId + "/hide",
                        admin,
                        Map.of("reason", "Picture contract"),
                        200);
        assertNoProviderUrl(hidden.toString());
        assertThat(hidden.path("item").path("imageUrl").asString()).matches(dragonPicture);
    }

    /** A discoverable collector with a profile and a trading area; returns the account id. */
    private UUID collector(String uid) {
        UUID id = provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile",
                uid,
                MessagingTestSupport.profile(handle),
                200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                uid,
                InventoryTestSupport.privacy(true, "PUBLIC"),
                200);
        return id;
    }

    /** Waits for the user's first listed notification of {@code type}. */
    private JsonNode awaitNotification(String uid, String type) {
        await().atMost(WAIT)
                .alias(type + " for " + uid)
                .until(() -> notificationOfType(uid, type) != null);
        JsonNode found = notificationOfType(uid, type);
        assertThat(found).isNotNull();
        return found;
    }

    private @Nullable JsonNode notificationOfType(String uid, String type) {
        for (JsonNode item : get("/api/v1/notifications?limit=50", uid).path("items")) {
            if (type.equals(item.path("type").asString())) {
                return item;
            }
        }
        return null;
    }

    /**
     * The notification names the dragon and shows OrenjiTrade's own picture (absolute in the
     * notification centre, the API-relative path in the stored row; never the provider's).
     */
    private void assertCardNotification(JsonNode notification, String picture) {
        JsonNode data = notification.path("data");
        assertThat(data.path("cardName").asString()).isEqualTo("Zephyrine Test Dragon");
        assertThat(data.path("game").asString()).isEqualTo(GAME);
        assertThat(data.path("cardImageUrl").asString())
                .as(notification.path("type").asString())
                .matches(picture);
        String stored =
                (String)
                        testUsers
                                .query(
                                        "SELECT data ->> 'cardImageUrl' AS url FROM notification"
                                                + " WHERE id = ?::uuid",
                                        notification.path("id").asString())
                                .get(0)
                                .get("url");
        assertThat(stored).as("stored picture").startsWith(CARD_IMAGES);
        assertNoProviderUrl(stored);
    }
}
