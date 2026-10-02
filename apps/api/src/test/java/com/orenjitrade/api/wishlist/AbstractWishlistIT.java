package com.orenjitrade.api.wishlist;

import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the Phase 6 wishlist and notification integration tests. Every test places its
 * collectors around its own random centre far from Montréal (seed data) and from the other suites,
 * so matches never involve another test's collectors. Matching runs asynchronously after commit
 * (Spring Modulith registry), so tests wait for the event publications of their own items.
 */
public abstract class AbstractWishlistIT extends AbstractIntegrationTest {

    /** Service token accepted on /internal/** under the test profile. */
    public static final String SERVICE_TOKEN = InventoryTestSupport.SERVICE_TOKEN;

    /** Mock printing "Azure-Eyes Sky Dragon" AZR-EN001 (Ultra Rare, FIRST_EDITION, en). */
    public static final String AZURE = "ygo-p001a";

    /** The French UNLIMITED printing of the same card. */
    public static final String AZURE_FR = "ygo-p001b";

    public static final Duration WAIT = Duration.ofSeconds(20);

    /**
     * A card picture as clients receive it (ADR 0015): OrenjiTrade's own card image route or the
     * card's placeholder, absolute against the API origin, never a provider URL.
     */
    public static final String CARD_PICTURE =
            "^http://localhost:[0-9]+/api/v1/public/(card-images/[0-9a-f-]{36}"
                    + "|placeholder-images/[a-z0-9-]+/[a-z0-9-]+\\.svg)$";

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    // ---------------------------------------------------------------------------------------
    // Collectors and places
    // ---------------------------------------------------------------------------------------

    /**
     * A centre with 2 decimals.
     *
     * @param lat latitude
     * @param lng longitude
     */
    public record Centre(double lat, double lng) {

        /** The point {@code northKm} north and {@code eastKm} east of this centre. */
        public Centre offset(double northKm, double eastKm) {
            double dLat = northKm / 111.2;
            double dLng = eastKm / (111.32 * Math.cos(Math.toRadians(lat)));
            return new Centre(round3(lat + dLat), round3(lng + dLng));
        }
    }

    /**
     * A test collector.
     *
     * @param uid token uid
     * @param id account id
     * @param handle handle
     */
    public record Collector(String uid, UUID id, String handle) {}

    /** A random centre with 2 decimals, far from the Montréal test data (and from the poles). */
    public static Centre randomCentre() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        return new Centre(round2(random.nextDouble(-45, 35)), round2(random.nextDouble(-50, 160)));
    }

    /** A discoverable collector with a complete profile and a trading area at {@code at}. */
    public Collector collector(String prefix, Centre at) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", handle);
        profile.put("displayName", "Collector " + handle);
        profile.put("bio", "");
        profile.put("games", List.of("yugioh"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                uid,
                Map.of("lat", at.lat(), "lng", at.lng(), "radiusKm", 5),
                200);
        return new Collector(uid, id, handle);
    }

    /** Privacy settings with the wishlist shown or hidden. */
    public void wishlistVisible(Collector collector, boolean visible) {
        Map<String, Object> body = privacy(true, "MEMBERS");
        body.put("wishlistVisible", visible);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", collector.uid(), body, 200);
    }

    // ---------------------------------------------------------------------------------------
    // Catalog and inventory
    // ---------------------------------------------------------------------------------------

    public UUID printing(String ref) {
        return InventoryTestSupport.printing(testUsers, ref);
    }

    public UUID cardOf(UUID printingId) {
        return (UUID)
                testUsers
                        .query("SELECT card_id FROM card_printing WHERE id = ?", printingId)
                        .get(0)
                        .get("card_id");
    }

    /** A public unfiled item (NEAR_MINT unless overridden); returns its id. */
    public String publicItem(Collector seller, UUID printingId, Map<String, Object> fields) {
        Map<String, Object> body = InventoryTestSupport.item(printingId);
        body.put("visibility", "PUBLIC");
        body.putAll(fields);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", seller.uid(), body, 201)
                .path("id")
                .asString();
    }

    /** {@code condition}, {@code askingPrice} and {@code availability} fields of an item. */
    public static Map<String, Object> offered(
            String condition, @Nullable String price, String availability) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("condition", condition);
        if (price != null) {
            fields.put("askingPrice", new BigDecimal(price));
        }
        fields.put("availability", availability);
        return fields;
    }

    // ---------------------------------------------------------------------------------------
    // Wishlist
    // ---------------------------------------------------------------------------------------

    /** A wishlist body for a printing (or a card when {@code printing} is false). */
    public static Map<String, Object> wish(UUID id, boolean printing) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put(printing ? "printingId" : "cardId", id.toString());
        return body;
    }

    public JsonNode createWish(Collector owner, Map<String, Object> body) {
        return callJson(HttpMethod.POST, "/api/v1/wishlist", owner.uid(), body, 201);
    }

    public JsonNode matches(Collector owner, String wishlistItemId) {
        return callJson(
                HttpMethod.GET,
                "/api/v1/wishlist/" + wishlistItemId + "/matches",
                owner.uid(),
                null,
                200);
    }

    /** Ids of the inventory items of the (undismissed) matches of a wishlist item. */
    public List<String> matchedItems(Collector owner, String wishlistItemId) {
        List<String> ids = new ArrayList<>();
        matches(owner, wishlistItemId)
                .path("items")
                .forEach(match -> ids.add(match.path("item").path("id").asString()));
        return ids;
    }

    /** Stored matches of a wishlist item (all, dismissed or not). */
    public int storedMatches(String wishlistItemId) {
        return testUsers.count(
                "SELECT count(*) FROM wishlist_match WHERE wishlist_item_id = ?::uuid",
                wishlistItemId);
    }

    // ---------------------------------------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------------------------------------

    public JsonNode notifications(Collector collector) {
        return callJson(
                HttpMethod.GET, "/api/v1/notifications?limit=50", collector.uid(), null, 200);
    }

    /** The collector's listed notifications of a type. */
    public List<JsonNode> notificationsOfType(Collector collector, String type) {
        List<JsonNode> result = new ArrayList<>();
        for (JsonNode item : notifications(collector).path("items")) {
            if (type.equals(item.path("type").asString())) {
                result.add(item);
            }
        }
        return result;
    }

    /** Stored notifications of a user and type (listed or not). */
    public int storedNotifications(UUID userId, String type) {
        return testUsers.count(
                "SELECT count(*) FROM notification WHERE user_id = ? AND type = ?", userId, type);
    }

    public long unreadCount(Collector collector) {
        return callJson(
                        HttpMethod.GET,
                        "/api/v1/notifications/unread-count",
                        collector.uid(),
                        null,
                        200)
                .path("count")
                .asLong();
    }

    // ---------------------------------------------------------------------------------------
    // Asynchronous work
    // ---------------------------------------------------------------------------------------

    /**
     * Waits until every event publication mentioning {@code id} (for example an inventory item id
     * inside {@code InventoryItemPublished}) exists and was completed by all its listeners.
     */
    public void awaitEventsProcessed(String id) {
        await().atMost(WAIT)
                .alias("event publications of " + id + " completed")
                .until(
                        () ->
                                testUsers.count(
                                                        "SELECT count(*) FROM event_publication"
                                                                + " WHERE serialized_event LIKE ?",
                                                        "%" + id + "%")
                                                > 0
                                        && testUsers.count(
                                                        "SELECT count(*) FROM event_publication"
                                                                + " WHERE serialized_event LIKE ?"
                                                                + " AND completion_date IS NULL",
                                                        "%" + id + "%")
                                                == 0);
    }

    /** Waits until no notification of a user has a channel left PENDING (dispatcher done). */
    public void awaitDispatched(UUID userId) {
        await().atMost(WAIT)
                .alias("notifications of " + userId + " dispatched")
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM notification WHERE user_id ="
                                                        + " ? AND channel_state::text LIKE"
                                                        + " '%PENDING%'",
                                                userId)
                                        == 0);
    }

    /** The stored channel state of a notification (JSON text). */
    public String channelState(String notificationId) {
        return (String)
                testUsers
                        .query(
                                "SELECT channel_state::text AS state FROM notification WHERE id ="
                                        + " ?::uuid",
                                notificationId)
                        .get(0)
                        .get("state");
    }

    /** Runs {@code POST /internal/jobs/wishlist-rematch} with the service token. */
    public JsonNode runRematchJob() {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/jobs/wishlist-rematch")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result);
    }

    /** The notification shows its card: name, game and picture ({@link #CARD_PICTURE}). */
    public static void assertCardPicture(JsonNode notification, String cardName) {
        JsonNode data = notification.path("data");
        String type = notification.path("type").asString();
        assertThat(data.path("cardName").asString()).as(type).isEqualTo(cardName);
        assertThat(data.path("game").asString()).as(type).isEqualTo("yugioh");
        assertThat(data.path("cardImageUrl").asString()).as(type).matches(CARD_PICTURE);
    }

    /** Every number of the document has at most 3 decimals (ADR 0004). */
    public static void assertAtMostThreeDecimals(JsonNode node, String context) {
        if (node.isNumber()) {
            assertThat(Math.max(0, node.decimalValue().stripTrailingZeros().scale()))
                    .as("numeric value %s in %s", node, context)
                    .isLessThanOrEqualTo(3);
            return;
        }
        for (JsonNode child : node) {
            assertAtMostThreeDecimals(child, context);
        }
    }

    /** Stored public point of a user (tests only). */
    public double[] publicPoint(UUID id) {
        Map<String, Object> stored = testUsers.locationOf(id);
        return new double[] {
            ((Number) stored.get("public_lat")).doubleValue(),
            ((Number) stored.get("public_lng")).doubleValue()
        };
    }

    /** Every object carrying numeric {@code lat} and {@code lng} members. */
    public static List<double[]> coordinatePairs(JsonNode node) {
        List<double[]> pairs = new ArrayList<>();
        collectPairs(node, pairs);
        return pairs;
    }

    private static void collectPairs(JsonNode node, List<double[]> pairs) {
        if (node.isObject() && node.path("lat").isNumber() && node.path("lng").isNumber()) {
            pairs.add(new double[] {node.path("lat").asDouble(), node.path("lng").asDouble()});
        }
        for (JsonNode child : node) {
            collectPairs(child, pairs);
        }
    }

    static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    static double round3(double value) {
        return BigDecimal.valueOf(value).setScale(3, RoundingMode.HALF_UP).doubleValue();
    }
}
