package com.orenjitrade.api.wishlist;

import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the wishlist and notification integration tests. Wishlist alerts compare platform
 * regions (ADR 0017), which every test shares, so each test lists and wishes its own isolated
 * catalog cards ({@link #printing}): alerts never involve another test's collectors. Alerts run
 * asynchronously after commit (Spring Modulith registry), so tests wait for the event publications
 * of their own items.
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
     * A collector's self-declared place (ADR 0017): wishlist alerts compare platform regions only.
     *
     * @param countryCode ISO 3166-1 alpha-2
     * @param subdivisionCode ISO 3166-2
     */
    public record Place(String countryCode, String subdivisionCode) {}

    /**
     * A test collector.
     *
     * @param uid token uid
     * @param id account id
     * @param handle handle
     */
    public record Collector(String uid, UUID id, String handle) {}

    /** A place in Americas (North), the region of most tests. */
    public static Place americasNorth() {
        return new Place("CA", "CA-QC");
    }

    /** A place in Europe: never alerted about Americas (North) listings. */
    public static Place europe() {
        return new Place("FR", "FR-IDF");
    }

    /** A discoverable collector with a complete profile located at {@code at}. */
    public Collector collector(String prefix, Place at) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliantWithoutLocation(uid);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", handle);
        profile.put("displayName", "Collector " + handle);
        profile.put("bio", "");
        profile.put("games", List.of("yugioh"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);
        setLocation(uid, at.countryCode(), at.subdivisionCode(), null);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
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

    /** Isolated cards of this test, by the id of the mock card they clone. */
    private final Map<UUID, IsolatedCard> isolatedCards = new HashMap<>();

    /** Isolated printings of this test, by mock printing ref. */
    private final Map<String, UUID> isolatedPrintings = new HashMap<>();

    /**
     * This test's own clone of mock printing {@code ref} (regions are shared by the whole suite, so
     * a test is never alerted about another test's listings): the first printing of a mock card
     * becomes a new isolated card, later printings of the same mock card become its siblings.
     */
    public UUID printing(String ref) {
        UUID existing = isolatedPrintings.get(ref);
        if (existing != null) {
            return existing;
        }
        UUID source = InventoryTestSupport.printing(testUsers, ref);
        UUID sourceCard = cardOf(source);
        IsolatedCard card = isolatedCards.get(sourceCard);
        UUID printingId;
        if (card == null) {
            card = InventoryTestSupport.isolatedCard(testUsers, ref);
            isolatedCards.put(sourceCard, card);
            printingId = card.printingId();
        } else {
            printingId = InventoryTestSupport.siblingPrinting(testUsers, card, ref, null);
        }
        isolatedPrintings.put(ref, printingId);
        return printingId;
    }

    /**
     * Another printing of the card of {@code ref} (this test's isolated card) with its own rarity,
     * for the "any printing of one rarity" wishes.
     */
    public UUID rarityPrinting(String ref, String rarity) {
        printing(ref);
        UUID source = InventoryTestSupport.printing(testUsers, ref);
        IsolatedCard card = isolatedCards.get(cardOf(source));
        UUID printingId = InventoryTestSupport.siblingPrinting(testUsers, card, ref, null);
        testUsers.update("UPDATE card_printing SET rarity = ? WHERE id = ?", rarity, printingId);
        return printingId;
    }

    /** Rarity of a printing. */
    public String rarityOf(UUID printingId) {
        return testUsers
                .query("SELECT rarity FROM card_printing WHERE id = ?", printingId)
                .get(0)
                .get("rarity")
                .toString();
    }

    /** Name of the card of a printing. */
    public String cardNameOf(UUID printingId) {
        return testUsers
                .query(
                        "SELECT c.name FROM card_printing p JOIN card c ON c.id = p.card_id WHERE"
                                + " p.id = ?",
                        printingId)
                .get(0)
                .get("name")
                .toString();
    }

    /** Printing code of a printing. */
    public String codeOf(UUID printingId) {
        return testUsers
                .query("SELECT printing_code FROM card_printing WHERE id = ?", printingId)
                .get(0)
                .get("printing_code")
                .toString();
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

    /** Sent-alert keys of a collector ({@code wishlist_alert_sent}). */
    public int sentAlerts(UUID userId) {
        return testUsers.count(
                "SELECT count(*) FROM wishlist_alert_sent WHERE user_id = ?", userId);
    }

    /** Turns the wishlist alerts switch of the notification settings on or off. */
    public void wishlistAlerts(Collector collector, boolean on) {
        JsonNode current =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/me/settings/notifications",
                        collector.uid(),
                        null,
                        200);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pushEnabled", current.path("pushEnabled").asBoolean());
        body.put("emailEnabled", current.path("emailEnabled").asBoolean());
        body.put("inAppEnabled", current.path("inAppEnabled").asBoolean());
        body.put("wishlistAlerts", on);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", collector.uid(), body, 200);
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

    /** The notification shows its card: name, game and picture ({@link #CARD_PICTURE}). */
    public static void assertCardPicture(JsonNode notification, String cardName) {
        JsonNode data = notification.path("data");
        String type = notification.path("type").asString();
        assertThat(data.path("cardName").asString()).as(type).isEqualTo(cardName);
        assertThat(data.path("game").asString()).as(type).isEqualTo("yugioh");
        assertThat(data.path("cardImageUrl").asString()).as(type).matches(CARD_PICTURE);
    }

    /** Every number of the document has at most 3 decimals. */
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
}
