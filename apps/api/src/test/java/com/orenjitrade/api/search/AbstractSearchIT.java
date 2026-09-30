package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the Phase 4 discovery and search integration tests. Every test works around its own
 * random centre far from Montréal (where the seed and the other suites place their collectors), so
 * the shared database never leaks other tests' collectors into a radius.
 */
abstract class AbstractSearchIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    /** A random centre with 2 decimals, far from the Montréal test data (and from the poles). */
    static Centre randomCentre() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        double lat = round2(random.nextDouble(-50, 40));
        double lng = round2(random.nextDouble(-60, 170));
        return new Centre(lat, lng);
    }

    /**
     * A centre with 2 decimals.
     *
     * @param lat latitude
     * @param lng longitude
     */
    record Centre(double lat, double lng) {

        /** The point {@code northKm} north and {@code eastKm} east of this centre. */
        Centre offset(double northKm, double eastKm) {
            double dLat = northKm / 111.2;
            double dLng = eastKm / (111.32 * Math.cos(Math.toRadians(lat)));
            return new Centre(lat + dLat, lng + dLng);
        }

        /** {@code lat=..&lng=..} */
        String query() {
            return "lat=" + lat + "&lng=" + lng;
        }
    }

    /**
     * A test collector.
     *
     * @param uid token uid
     * @param id account id
     * @param handle handle
     */
    record Collector(String uid, UUID id, String handle) {}

    /** A discoverable collector (MEMBERS profile) with a trading area at {@code at}. */
    Collector collector(String prefix, Centre at) {
        return collector(prefix, at, true, "MEMBERS");
    }

    Collector collector(String prefix, Centre at, boolean discoverable, String visibility) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                uid,
                privacy(discoverable, visibility),
                200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                uid,
                Map.of("lat", at.lat(), "lng", at.lng(), "radiusKm", 5),
                200);
        return new Collector(uid, id, me(uid).path("handle").asString());
    }

    /** Saves the profile (display name, games) keeping the handle. */
    void profile(Collector collector, String displayName, List<String> games) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", collector.handle());
        body.put("displayName", displayName);
        body.put("bio", "");
        body.put("games", games);
        body.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", collector.uid(), body, 200);
    }

    /** Replaces the collector's tags with curated tags by slug. */
    void tags(Collector collector, String... slugs) {
        List<String> ids = new ArrayList<>();
        for (String slug : slugs) {
            ids.add(
                    testUsers
                            .query("SELECT id FROM tag WHERE slug = ?", slug)
                            .get(0)
                            .get("id")
                            .toString());
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("tagIds", ids);
        body.put("customLabels", List.of());
        callJson(HttpMethod.PUT, "/api/v1/me/profile/tags", collector.uid(), body, 200);
    }

    /** A public unfiled item; returns its id. */
    String publicItem(Collector collector, UUID printingId, Map<String, Object> fields) {
        Map<String, Object> body = InventoryTestSupport.item(printingId);
        body.put("visibility", "PUBLIC");
        body.putAll(fields);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", collector.uid(), body, 201)
                .path("id")
                .asString();
    }

    /** Ages an item (direct SQL: set up before the first discovery query, no event fires). */
    void freshness(String itemId, String state, int confirmedDaysAgo) {
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = ?, confirmed_at = now() -"
                        + " make_interval(days => ?) WHERE id = ?::uuid",
                state,
                confirmedDaysAgo,
                itemId);
    }

    /** Id of a mock printing by its provider id. */
    UUID printing(String ref) {
        return InventoryTestSupport.printing(testUsers, ref);
    }

    /** Card of a printing. */
    UUID cardOf(UUID printingId) {
        return (UUID)
                testUsers
                        .query("SELECT card_id FROM card_printing WHERE id = ?", printingId)
                        .get(0)
                        .get("card_id");
    }

    JsonNode nearby(@Nullable String uid, String query) {
        return callJson(HttpMethod.GET, "/api/v1/collectors/nearby?" + query, uid, null, 200);
    }

    /**
     * GET with URI template variables (values are encoded, e.g. spaces in a query); asserts the
     * status and parses the body.
     */
    JsonNode get(@Nullable String uid, int expectedStatus, String template, Object... variables) {
        RestTestClient.RequestHeadersSpec<?> spec = http.get().uri(template, variables);
        if (uid != null) {
            spec = spec.header(HttpHeaders.AUTHORIZATION, bearer(uid));
        }
        EntityExchangeResult<byte[]> result = spec.exchange().expectBody().returnResult();
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        assertThat(result.getStatus().value())
                .as("GET %s -> %s", template, text)
                .isEqualTo(expectedStatus);
        return jsonMapper.readTree(text);
    }

    /** Handles of the collectors of a nearby / search response or a card-holder page. */
    static List<String> handles(JsonNode response) {
        List<String> handles = new ArrayList<>();
        JsonNode collectors = response.has("collectors") ? response.path("collectors") : null;
        if (collectors != null) {
            collectors.forEach(marker -> handles.add(marker.path("handle").asString()));
        } else {
            response.path("items")
                    .forEach(row -> handles.add(row.path("collector").path("handle").asString()));
        }
        return handles;
    }

    /** The marker of {@code handle} in a nearby / search response. */
    static JsonNode marker(JsonNode response, String handle) {
        for (JsonNode marker : response.path("collectors")) {
            if (handle.equals(marker.path("handle").asString())) {
                return marker;
            }
        }
        throw new AssertionError(handle + " not in " + response);
    }

    /** Stored public point of a user (tests only). */
    double[] publicPoint(UUID id) {
        Map<String, Object> stored = testUsers.locationOf(id);
        return new double[] {
            ((Number) stored.get("public_lat")).doubleValue(),
            ((Number) stored.get("public_lng")).doubleValue()
        };
    }

    static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
