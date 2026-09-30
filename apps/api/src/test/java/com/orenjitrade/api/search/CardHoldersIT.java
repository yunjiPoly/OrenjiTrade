package com.orenjitrade.api.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /search/card-holders}: holders of a printing or card near a centre, with every filter
 * of the contract, the three sorts, pagination, exclusions (outside the radius, not discoverable,
 * stale items, the caller's own items) and validation.
 */
class CardHoldersIT extends AbstractSearchIT {

    private Centre centre;
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
        centre = randomCentre();
        printingId = printing("pkm-p001a"); // SVX-001 English
        frenchPrintingId = printing("pkm-p001b"); // SVX-001 French, same card
        cardId = cardOf(printingId);

        near = collector("hold-near", centre.offset(3, 0));
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
        aging = collector("hold-aging", centre.offset(13.5, 0));
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
        french = collector("hold-fr", centre.offset(0, 6.5));
        frenchItem = publicItem(french, frenchPrintingId, Map.of("availability", "TRADE"));
        middle = collector("hold-mid", centre.offset(-10, 0));
        middleItem =
                publicItem(
                        middle,
                        printingId,
                        Map.of("availability", "TRADE_OR_SALE", "condition", "NEAR_MINT"));

        Collector far = collector("hold-far", centre.offset(35, 0));
        publicItem(far, printingId, Map.of("availability", "SALE"));
        Collector hidden = collector("hold-hidden", centre.offset(1, 0), false, "PUBLIC");
        publicItem(hidden, printingId, Map.of("availability", "SALE"));
        Collector stale = collector("hold-stale", centre.offset(1, 1));
        freshness(publicItem(stale, printingId, Map.of("availability", "SALE")), "STALE", 35);
    }

    private JsonNode holders(String uid, String query) {
        return callJson(
                HttpMethod.GET,
                "/api/v1/search/card-holders?" + centre.query() + "&radiusKm=20&" + query,
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
    void holdersOfAPrintingSortedByDistancePriceAndFreshness() {
        JsonNode byDistance = holders(null, "printingId=" + printingId);
        assertThat(itemIds(byDistance)).containsExactly(nearItem, middleItem, agingItem);
        assertThat(byDistance.path("totalItems").asLong()).isEqualTo(3);
        JsonNode first = byDistance.path("items").get(0);
        assertThat(first.path("collector").path("handle").asString()).isEqualTo(near.handle());
        double[] point = publicPoint(near.id());
        assertThat(first.path("collector").path("publicPoint").path("lat").asDouble())
                .isEqualTo(point[0]);
        assertThat(first.path("collector").path("publicPoint").path("lng").asDouble())
                .isEqualTo(point[1]);
        assertThat(first.path("collector").path("distanceBucket").isNull())
                .as("signed-out callers get no distance buckets")
                .isTrue();
        assertThat(first.path("collector").path("matchingItems").isEmpty()).isTrue();
        assertThat(first.path("item").path("printing").path("id").asString())
                .isEqualTo(printingId.toString());
        assertThat(first.path("item").path("askingPrice").decimalValue())
                .isEqualByComparingTo("10");
        assertThat(first.path("item").has("notes")).isFalse();
        assertThat(byDistance.toString()).doesNotContain("private-holder-note");

        assertThat(itemIds(holders(null, "printingId=" + printingId + "&sort=price")))
                .as("cheapest first, items without a price last")
                .containsExactly(nearItem, agingItem, middleItem);
        assertThat(itemIds(holders(null, "printingId=" + printingId + "&sort=FRESHNESS")))
                .as("most recently confirmed ACTIVE first, AGING last")
                .containsExactly(middleItem, nearItem, agingItem);

        JsonNode page = holders(null, "printingId=" + printingId + "&size=1&page=1");
        assertThat(itemIds(page)).containsExactly(middleItem);
        assertThat(page.path("totalItems").asLong()).isEqualTo(3);
        assertThat(page.path("totalPages").asInt()).isEqualTo(3);

        // Signed in: distance buckets.
        String viewer = uniqueUid("hold-viewer");
        provisionCompliant(viewer);
        JsonNode signedIn = holders(viewer, "printingId=" + printingId);
        assertThat(
                        signedIn.path("items")
                                .get(0)
                                .path("collector")
                                .path("distanceBucket")
                                .asString())
                .isEqualTo("KM_1_5");
    }

    @Test
    void everyFilterNarrowsTheHolders() {
        String base = "printingId=" + printingId;
        assertThat(itemIds(holders(null, base + "&availability=SALE")))
                .containsExactly(nearItem, middleItem);
        assertThat(itemIds(holders(null, base + "&availability=TRADE")))
                .containsExactly(middleItem, agingItem);
        assertThat(itemIds(holders(null, base + "&availability=ACCEPTS_OFFERS")))
                .containsExactly(nearItem);
        assertThat(itemIds(holders(null, base + "&acceptsOffers=true"))).containsExactly(nearItem);
        assertThat(itemIds(holders(null, base + "&acceptsOffers=false")))
                .containsExactly(middleItem, agingItem);
        assertThat(itemIds(holders(null, base + "&condition=near_mint")))
                .containsExactly(nearItem, middleItem);
        assertThat(itemIds(holders(null, base + "&minPrice=5&maxPrice=20")))
                .containsExactly(nearItem);
        assertThat(itemIds(holders(null, base + "&minPrice=20"))).containsExactly(agingItem);
        assertThat(itemIds(holders(null, base + "&freshness=AGING"))).containsExactly(agingItem);
        assertThat(itemIds(holders(null, base + "&language=en")))
                .containsExactly(nearItem, middleItem, agingItem);
        assertThat(itemIds(holders(null, base + "&edition=UNLIMITED")))
                .containsExactly(nearItem, middleItem, agingItem);
        assertThat(itemIds(holders(null, base + "&edition=FIRST_EDITION"))).isEmpty();

        // By card: every printing of it.
        assertThat(itemIds(holders(null, "cardId=" + cardId)))
                .containsExactly(nearItem, frenchItem, middleItem, agingItem);
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

    @Test
    void validationAndLimits() {
        String path = "/api/v1/search/card-holders?" + centre.query();
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
                path + "&printingId=" + printingId + "&sort=rating",
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
        // Signed-out callers must give a centre.
        callJson(
                HttpMethod.GET,
                "/api/v1/search/card-holders?printingId=" + printingId,
                null,
                null,
                400);
        JsonNode limit =
                callJson(
                        HttpMethod.GET,
                        path + "&printingId=" + printingId + "&radiusKm=26",
                        null,
                        null,
                        429);
        assertThat(limit.path("limitKey").asString()).isEqualTo("map.radius.max_km");
        // Unknown printing: an empty page.
        assertThat(holders(null, "printingId=" + UUID.randomUUID()).path("totalItems").asLong())
                .isZero();
    }
}
