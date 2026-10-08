package com.orenjitrade.api.search;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The map's data (ADR 0017): public binders per state/province of a region and the binders of one
 * state/province. Only effectively public binders holding a public item of discoverable, active
 * collectors with a location count; blocked collectors are left out for the viewer; no collector,
 * city or coordinate is ever returned. Counts are compared as deltas (the regions are shared by the
 * whole suite); the lists use subdivisions no other test uses.
 */
class RegionMapIT extends AbstractSearchIT {

    private long count(@Nullable String uid, String region, String subdivision) {
        JsonNode counts =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/regions/" + region + "/binder-counts",
                        uid,
                        null,
                        200);
        assertThat(counts.path("region").asString()).isEqualTo(region);
        for (JsonNode entry : counts.path("subdivisions")) {
            if (subdivision.equals(entry.path("code").asString())) {
                return entry.path("binderCount").asLong();
            }
        }
        return 0;
    }

    /** A public binder holding one public item; returns its id. */
    private String binderWithItem(Collector owner, String name) {
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                binder(name, "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> body = item(printing("pkm-p002a"));
        body.put("binderId", binderId);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), body, 201);
        return binderId;
    }

    private static List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(node -> ids.add(node.path("id").asString()));
        return ids;
    }

    @Test
    void countsOnlyPublicBindersOfDiscoverableActiveCollectorsPerSubdivision() {
        String yukon = "CA-YT";
        long before = count(null, "americas-north", yukon);

        Collector owner = collector("map-owner", "CA", yukon);
        binderWithItem(owner, token() + " counted");
        callJson(
                HttpMethod.POST,
                "/api/v1/binders",
                owner.uid(),
                binder(token() + " empty", "PUBLIC"),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/binders",
                owner.uid(),
                binder(token() + " private", "PRIVATE"),
                201);
        Collector hidden = collector("map-hidden", "CA", yukon, false, "PUBLIC");
        binderWithItem(hidden, token() + " not discoverable");
        Collector suspended = collector("map-suspended", "CA", yukon);
        binderWithItem(suspended, token() + " suspended");
        testUsers.setStatus(
                suspended.id(), AccountStatus.SUSPENDED, Instant.now().plus(3, ChronoUnit.DAYS));
        Collector european = collector("map-eu", "FR", "FR-BRE");

        long europeBefore = count(null, "europe", "FR-BRE");
        binderWithItem(european, token() + " brittany");

        assertThat(count(null, "americas-north", yukon))
                .as("one public binder with an item of one discoverable active collector")
                .isEqualTo(before + 1);
        assertThat(count(null, "europe", "FR-BRE")).isEqualTo(europeBefore + 1);

        // Blocks: the viewer who blocked the owner no longer counts their binder.
        String viewer = uniqueUid("map-viewer");
        provisionCompliant(viewer);
        assertThat(count(viewer, "americas-north", yukon)).isEqualTo(before + 1);
        callJson(HttpMethod.POST, "/api/v1/users/" + owner.id() + "/block", viewer, null, 200);
        assertThat(count(viewer, "americas-north", yukon)).isEqualTo(before);
        assertThat(count(null, "americas-north", yukon)).isEqualTo(before + 1);

        // Leaving discovery removes the binders from the map.
        callJson(HttpMethod.DELETE, "/api/v1/me/location", owner.uid(), null, 204);
        assertThat(count(null, "americas-north", yukon)).isEqualTo(before);

        callJson(HttpMethod.GET, "/api/v1/regions/asia/binder-counts", null, null, 404);
        JsonNode counts =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/regions/americas-north/binder-counts",
                        null,
                        null,
                        200);
        assertThat(counts.path("total").asLong()).isPositive();
        assertThat(counts.toString()).doesNotContain("\"lat").doesNotContain("handle");
    }

    @Test
    void aSubdivisionListsItsBindersNewestFirstWithCursorPagination() {
        String nunavut = "CA-NU";
        Collector first = collector("map-first", "CA", nunavut);
        setLocation(first.uid(), "CA", nunavut, "Iqaluit"); // a city: never shown in the list
        String oldest = binderWithItem(first, token() + " oldest");
        Collector second = collector("map-second", "CA", nunavut);
        String middle = binderWithItem(second, token() + " middle");
        String newest = binderWithItem(first, token() + " newest");
        Collector hidden = collector("map-hidden2", "CA", nunavut, false, "PUBLIC");
        String notListed = binderWithItem(hidden, token() + " hidden");

        String path = "/api/v1/regions/americas-north/subdivisions/ca-nu/binders";
        JsonNode page = callJson(HttpMethod.GET, path + "?limit=2", null, null, 200);
        assertThat(ids(page)).containsExactly(newest, middle);
        assertThat(page.path("hasMore").asBoolean()).isTrue();
        JsonNode row = page.path("items").get(0);
        assertThat(row.path("itemCount").asLong()).isEqualTo(1);
        assertThat(row.path("freshness").path("updatedAt").asString()).isNotBlank();
        JsonNode owner = row.path("owner");
        assertThat(owner.path("handle").asString()).isEqualTo(first.handle());
        assertThat(owner.path("place").path("label").asString()).isEqualTo("Nunavut, Canada");
        assertThat(owner.path("place").has("city")).isFalse();
        assertThat(page.toString()).doesNotContain("Iqaluit").doesNotContain(notListed);

        JsonNode next =
                callJson(
                        HttpMethod.GET,
                        path + "?limit=2&cursor=" + page.path("nextCursor").asString(),
                        null,
                        null,
                        200);
        assertThat(ids(next)).containsExactly(oldest);
        assertThat(next.path("hasMore").asBoolean()).isFalse();

        // A viewer blocked by the second collector does not see their binder.
        String viewer = uniqueUid("map-blocked");
        provisionCompliant(viewer);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + provisionedId(viewer) + "/block",
                second.uid(),
                null,
                200);
        assertThat(ids(callJson(HttpMethod.GET, path, viewer, null, 200)))
                .containsExactly(newest, oldest);

        // 404 for an unknown region, a subdivision of another region and an unknown subdivision.
        callJson(
                HttpMethod.GET, "/api/v1/regions/asia/subdivisions/CA-NU/binders", null, null, 404);
        callJson(
                HttpMethod.GET,
                "/api/v1/regions/europe/subdivisions/CA-NU/binders",
                null,
                null,
                404);
        callJson(
                HttpMethod.GET,
                "/api/v1/regions/americas-north/subdivisions/CA-ZZ/binders",
                null,
                null,
                404);
        callJson(HttpMethod.GET, path + "?cursor=not-a-cursor", null, null, 400);
        callJson(HttpMethod.GET, path + "?limit=51", null, null, 400);
    }

    private String provisionedId(String uid) {
        return me(uid).path("id").asString();
    }
}
