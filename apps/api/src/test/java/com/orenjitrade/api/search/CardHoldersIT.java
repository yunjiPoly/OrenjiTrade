package com.orenjitrade.api.search;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport.IsolatedCard;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /search/card-holders}: holders of a printing or card among the discoverable collectors
 * of a platform region (ADR 0017), with every filter of the contract, the two sorts, pagination,
 * exclusions (another region, not discoverable, no location, stale items, the caller's own items)
 * and validation. Holders show their state/province and country, never a distance or a city.
 */
class CardHoldersIT extends AbstractSearchIT {

    private IsolatedCard card;
    private UUID printingId;
    private UUID frenchPrintingId;
    private UUID cardId;
    private Collector near;
    private Collector french;
    private Collector middle;
    private Collector aging;
    private String nearItem;
    private String middleItem;
    private String agingItem;
    private String frenchItem;

    @BeforeEach
    void holders() {
        card = isolatedPrinting("pkm-p001a"); // a private clone of SVX-001 English
        printingId = card.printingId();
        frenchPrintingId = siblingPrinting(card, "pkm-p001b", "fr");
        cardId = card.cardId();

        near = collector("hold-near", "CA", "CA-QC");
        nearItem =
                publicItem(
                        near,
                        printingId,
                        Map.of(
                                "availability",
                                "SALE",
                                "askingPrice",
                                10,
                                "acceptsOffers",
                                true,
                                "condition",
                                "NEAR_MINT",
                                "notes",
                                "private-holder-note"));
        aging = collector("hold-aging", "US", "US-NY");
        agingItem =
                publicItem(
                        aging,
                        printingId,
                        Map.of(
                                "availability",
                                "TRADE",
                                "askingPrice",
                                25,
                                "condition",
                                "LIGHTLY_PLAYED"));
        freshness(agingItem, "AGING", 20);
        french = collector("hold-fr", "MX", "MX-JAL");
        frenchItem = publicItem(french, frenchPrintingId, Map.of("availability", "TRADE"));
        middle = collector("hold-mid", "CA", "CA-ON");
        middleItem =
                publicItem(
                        middle,
                        printingId,
                        Map.of("availability", "TRADE_OR_SALE", "condition", "NEAR_MINT"));

        Collector otherRegion = collector("hold-eu", "FR", "FR-IDF");
        publicItem(otherRegion, printingId, Map.of("availability", "SALE"));
        Collector hidden = collector("hold-hidden", "CA", "CA-QC", false, "PUBLIC");
        publicItem(hidden, printingId, Map.of("availability", "SALE"));
        Collector stale = collector("hold-stale", "CA", "CA-QC");
        freshness(publicItem(stale, printingId, Map.of("availability", "SALE")), "STALE", 35);
    }

    private JsonNode holders(String uid, String query) {
        return callJson(
                HttpMethod.GET,
                "/api/v1/search/card-holders?region=americas-north&" + query,
                uid,
                null,
                200);
    }

    private static List<String> itemIds(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(row -> ids.add(row.path("item").path("id").asString()));
        return ids;
    }

    @Test
    void holdersOfAPrintingInTheRegionSortedByFreshnessAndPrice() {
        JsonNode byFreshness = holders(null, "printingId=" + printingId);
        assertThat(itemIds(byFreshness))
                .as("default sort: freshest listing first (ACTIVE newest first, AGING last)")
                .containsExactly(middleItem, nearItem, agingItem);
        assertThat(byFreshness.path("totalItems").asLong()).isEqualTo(3);
        JsonNode nearRow = byFreshness.path("items").get(1);
        JsonNode holder = nearRow.path("collector");
        assertThat(holder.path("handle").asString()).isEqualTo(near.handle());
        assertThat(holder.path("place").path("subdivisionCode").asString()).isEqualTo("CA-QC");
        assertThat(holder.path("place").path("label").asString()).isEqualTo("Quebec, Canada");
        assertThat(holder.path("place").path("regionCode").asString()).isEqualTo("americas-north");
        assertThat(holder.has("publicPoint")).isFalse();
        assertThat(holder.has("distanceBucket")).isFalse();
        assertThat(holder.path("place").has("city")).isFalse();
        assertThat(holder.path("matchingItems").isEmpty()).isTrue();
        assertThat(nearRow.path("item").path("printing").path("id").asString())
                .isEqualTo(printingId.toString());
        assertThat(nearRow.path("item").path("askingPrice").decimalValue())
                .isEqualByComparingTo("10");
        assertThat(nearRow.path("item").has("notes")).isFalse();
        assertThat(byFreshness.toString()).doesNotContain("private-holder-note");

        assertThat(itemIds(holders(null, "printingId=" + printingId + "&sort=price")))
                .as("cheapest first, items without a price last")
                .containsExactly(nearItem, agingItem, middleItem);
        assertThat(itemIds(holders(null, "printingId=" + printingId + "&sort=FRESHNESS")))
                .containsExactly(middleItem, nearItem, agingItem);

        JsonNode page = holders(null, "printingId=" + printingId + "&size=1&page=1");
        assertThat(itemIds(page)).containsExactly(nearItem);
        assertThat(page.path("totalItems").asLong()).isEqualTo(3);
        assertThat(page.path("totalPages").asInt()).isEqualTo(3);

        // Another region: only the European holder.
        JsonNode europe =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/card-holders?region=europe&printingId=" + printingId,
                        null,
                        null,
                        200);
        assertThat(europe.path("totalItems").asLong()).isEqualTo(1);
        assertThat(
                        europe.path("items")
                                .get(0)
                                .path("collector")
                                .path("place")
                                .path("label")
                                .asString())
                .isEqualTo("Île-de-France, France");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/search/card-holders?region=americas-south"
                                                + "&printingId="
                                                + printingId,
                                        null,
                                        null,
                                        200)
                                .path("totalItems")
                                .asLong())
                .isZero();
    }

    @Test
    void withoutARegionTheCallersHomeRegionOrTheDefaultApplies() {
        // Signed out: the default region (americas-north).
        JsonNode anonymous =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/card-holders?printingId=" + printingId,
                        null,
                        null,
                        200);
        assertThat(anonymous.path("totalItems").asLong()).isEqualTo(3);
        // Signed in from Europe: their home region.
        String european = uniqueUid("hold-eu-viewer");
        provisionCompliantWithoutLocation(european);
        setLocation(european, "DE", "DE-BE", "Berlin");
        JsonNode home =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/card-holders?printingId=" + printingId,
                        european,
                        null,
                        200);
        assertThat(home.path("totalItems").asLong()).isEqualTo(1);
        // Signed in without a location: the default region.
        String noLocation = uniqueUid("hold-noloc");
        provisionCompliantWithoutLocation(noLocation);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/search/card-holders?printingId=" + printingId,
                                        noLocation,
                                        null,
                                        200)
                                .path("totalItems")
                                .asLong())
                .isEqualTo(3);
    }

    @Test
    void everyFilterNarrowsTheHolders() {
        String base = "printingId=" + printingId;
        assertThat(itemIds(holders(null, base + "&availability=SALE")))
                .containsExactly(middleItem, nearItem);
        assertThat(itemIds(holders(null, base + "&availability=TRADE")))
                .containsExactly(middleItem, agingItem);
        assertThat(itemIds(holders(null, base + "&availability=ACCEPTS_OFFERS")))
                .containsExactly(nearItem);
        assertThat(itemIds(holders(null, base + "&acceptsOffers=true"))).containsExactly(nearItem);
        assertThat(itemIds(holders(null, base + "&acceptsOffers=false")))
                .containsExactly(middleItem, agingItem);
        assertThat(itemIds(holders(null, base + "&condition=near_mint")))
                .containsExactly(middleItem, nearItem);
        assertThat(itemIds(holders(null, base + "&minPrice=5&maxPrice=20")))
                .containsExactly(nearItem);
        assertThat(itemIds(holders(null, base + "&minPrice=20"))).containsExactly(agingItem);
        assertThat(itemIds(holders(null, base + "&freshness=AGING"))).containsExactly(agingItem);
        assertThat(itemIds(holders(null, base + "&language=en")))
                .containsExactly(middleItem, nearItem, agingItem);
        assertThat(itemIds(holders(null, base + "&edition=UNLIMITED")))
                .containsExactly(middleItem, nearItem, agingItem);
        assertThat(itemIds(holders(null, base + "&edition=FIRST_EDITION"))).isEmpty();

        // By card: every printing of it.
        assertThat(itemIds(holders(null, "cardId=" + cardId)))
                .containsExactlyInAnyOrder(nearItem, frenchItem, middleItem, agingItem);
        assertThat(itemIds(holders(null, "cardId=" + cardId + "&language=fr")))
                .containsExactly(frenchItem);
        assertThat(handles(holders(null, "cardId=" + cardId + "&language=fr")))
                .containsExactly(french.handle());
    }

    @Test
    void theCallersOwnItemsAreExcluded() {
        String own = near.uid();
        assertThat(itemIds(holders(own, "printingId=" + printingId)))
                .containsExactly(middleItem, agingItem);
        assertThat(itemIds(holders(null, "printingId=" + printingId))).contains(nearItem);
        assertThat(handles(holders(middle.uid(), "cardId=" + cardId)))
                .doesNotContain(middle.handle())
                .contains(aging.handle());
    }

    /**
     * A block, in either direction, takes the collector's listings out of the page AND out of the
     * count. The collector blocked first holds the first row of the default sort: while the count
     * was taken before the blocked rows were dropped, the first page of one came back empty under
     * "3 listings".
     */
    @Test
    void collectorsInABlockRelationWithTheViewerAreNeitherListedNorCounted() {
        String viewer = uniqueUid("hold-viewer");
        UUID viewerId = provisionCompliant(viewer);
        String byPrinting = "printingId=" + printingId;

        JsonNode before = holders(viewer, byPrinting);
        assertThat(itemIds(before)).containsExactly(middleItem, nearItem, agingItem);
        assertThat(before.path("totalItems").asLong()).isEqualTo(3);

        // The viewer blocks a holder: one row and one of the count leave together.
        callJson(HttpMethod.POST, "/api/v1/users/" + middle.id() + "/block", viewer, null, 200);
        JsonNode blocking = holders(viewer, byPrinting);
        assertThat(itemIds(blocking)).containsExactly(nearItem, agingItem);
        assertThat(blocking.path("totalItems").asLong()).isEqualTo(2);
        assertThat(handles(blocking)).doesNotContain(middle.handle());

        // Pages of one: each page is full, the count and the page count say two, then nothing.
        JsonNode first = holders(viewer, byPrinting + "&size=1&page=0");
        assertThat(itemIds(first)).containsExactly(nearItem);
        assertThat(first.path("totalItems").asLong()).isEqualTo(2);
        assertThat(first.path("totalPages").asInt()).isEqualTo(2);
        JsonNode second = holders(viewer, byPrinting + "&size=1&page=1");
        assertThat(itemIds(second)).containsExactly(agingItem);
        assertThat(second.path("totalItems").asLong()).isEqualTo(2);
        JsonNode third = holders(viewer, byPrinting + "&size=1&page=2");
        assertThat(itemIds(third)).isEmpty();
        assertThat(third.path("totalItems").asLong()).isEqualTo(2);
        // The other sort pages the same two rows.
        assertThat(itemIds(holders(viewer, byPrinting + "&sort=price&size=1&page=1")))
                .containsExactly(agingItem);
        // A filter that only the blocked collector and one other pass counts the other alone.
        JsonNode trades = holders(viewer, byPrinting + "&availability=TRADE");
        assertThat(itemIds(trades)).containsExactly(agingItem);
        assertThat(trades.path("totalItems").asLong()).isEqualTo(1);

        // The other direction: a holder who blocked the viewer.
        callJson(HttpMethod.POST, "/api/v1/users/" + viewerId + "/block", aging.uid(), null, 200);
        JsonNode blocked = holders(viewer, byPrinting);
        assertThat(itemIds(blocked)).containsExactly(nearItem);
        assertThat(blocked.path("totalItems").asLong()).isEqualTo(1);
        assertThat(blocked.path("totalPages").asInt()).isEqualTo(1);
        JsonNode onlyPage = holders(viewer, byPrinting + "&size=1&page=0");
        assertThat(itemIds(onlyPage)).containsExactly(nearItem);
        assertThat(onlyPage.path("totalPages").asInt()).isEqualTo(1);
        // By card: the holder of the other printing, who is in no block, stays.
        JsonNode byCard = holders(viewer, "cardId=" + cardId);
        assertThat(itemIds(byCard)).containsExactlyInAnyOrder(nearItem, frenchItem);
        assertThat(byCard.path("totalItems").asLong()).isEqualTo(2);
        // The collector who blocked the viewer loses nobody else from their own list.
        assertThat(itemIds(holders(aging.uid(), byPrinting))).containsExactly(middleItem, nearItem);

        // A block is between two collectors: everyone else reads the three listings.
        assertThat(holders(null, byPrinting).path("totalItems").asLong()).isEqualTo(3);
        String other = uniqueUid("hold-other");
        provisionCompliant(other);
        JsonNode others = holders(other, byPrinting);
        assertThat(itemIds(others)).containsExactly(middleItem, nearItem, agingItem);
        assertThat(others.path("totalItems").asLong()).isEqualTo(3);

        // Unblocking brings the row and the count back.
        callJson(HttpMethod.DELETE, "/api/v1/users/" + middle.id() + "/block", viewer, null, 204);
        JsonNode unblocked = holders(viewer, byPrinting);
        assertThat(itemIds(unblocked)).containsExactly(middleItem, nearItem);
        assertThat(unblocked.path("totalItems").asLong()).isEqualTo(2);
    }

    @Test
    void aCollectorWhoRemovesTheirLocationLeavesTheLists() {
        callJson(HttpMethod.DELETE, "/api/v1/me/location", middle.uid(), null, 204);
        assertThat(itemIds(holders(null, "printingId=" + printingId)))
                .containsExactly(nearItem, agingItem);
        JsonNode privacy =
                callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", middle.uid(), null, 200);
        assertThat(privacy.path("discoverable").asBoolean())
                .as("no location, no discoverability")
                .isFalse();
    }

    @Test
    void validation() {
        String path = "/api/v1/search/card-holders?region=americas-north";
        callJson(HttpMethod.GET, path, null, null, 400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&cardId=" + cardId,
                null,
                null,
                400);
        callJson(HttpMethod.GET, path + "&printingId=not-a-uuid", null, null, 400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&minPrice=20&maxPrice=10",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&minPrice=-1",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&sort=distance",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&condition=near-mint!",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&language=eng",
                null,
                null,
                400);
        callJson(
                HttpMethod.GET,
                path + "&printingId=" + printingId + "&freshness=STALE",
                null,
                null,
                400);
        callJson(HttpMethod.GET, path + "&printingId=" + printingId + "&size=101", null, null, 400);
        JsonNode unknownRegion =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/search/card-holders?region=asia&printingId=" + printingId,
                        null,
                        null,
                        400);
        assertThat(unknownRegion.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(unknownRegion.toString()).contains("region");
        // Coordinates and radii are not parameters any more: ignored, never an error or a filter.
        assertThat(
                        holders(null, "printingId=" + printingId + "&lat=45.5&lng=-73.6&radiusKm=1")
                                .path("totalItems")
                                .asLong())
                .isEqualTo(3);
        // Unknown printing: an empty page.
        assertThat(holders(null, "printingId=" + UUID.randomUUID()).path("totalItems").asLong())
                .isZero();
    }
}
