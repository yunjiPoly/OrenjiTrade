package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.billing.domain.PlanService;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Public binder views: shape, no private notes, no coordinates (ADR 0004), owner block, collector
 * lists, and the {@code binder.views.per_day} limit for signed-in visitors.
 */
class PublicBinderIT extends AbstractIntegrationTest {

    static final String SECRET = "secret-note-7f3a";

    @Autowired private CatalogImportService importService;
    @Autowired private PlanService planService;

    private UUID printingId;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        printingId = printing(testUsers, "pkm-p019a");
    }

    @AfterEach
    void restoreViewLimit() {
        testUsers.update(
                "UPDATE usage_limit l SET max_value = 30 FROM plan p WHERE p.id = l.plan_id AND"
                        + " p.code = 'FREE' AND l.limit_key = 'binder.views.per_day'");
        planService.invalidate();
    }

    /** A discoverable collector with a location and a public binder; returns ids. */
    private Fixture publicCollector(String uid) {
        provisionCompliant(uid);
        setLocation(uid, "CA", "CA-MB", "Brandon");
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        String handle = me(uid).path("handle").asString();
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                binder("Holo singles", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> shown = item(printingId);
        shown.put("binderId", binderId);
        shown.put("notes", SECRET);
        shown.put("publicNotes", "Near mint, sleeved.");
        shown.put("askingPrice", 18.5);
        shown.put("availability", "SALE");
        shown.put("acceptsOffers", true);
        String shownId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, shown, 201)
                        .path("id")
                        .asString();
        Map<String, Object> hidden = item(printingId);
        hidden.put("binderId", binderId);
        hidden.put("visibility", "PRIVATE");
        hidden.put("notes", SECRET);
        String hiddenId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, hidden, 201)
                        .path("id")
                        .asString();
        return new Fixture(handle, binderId, shownId, hiddenId);
    }

    record Fixture(String handle, String binderId, String shownId, String hiddenId) {}

    @Test
    void publicBinderViewsCarryNoPrivateDataAndNoCoordinates() {
        String owner = uniqueUid("pub-owner");
        Fixture fixture = publicCollector(owner);

        JsonNode binder =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/public/binders/" + fixture.binderId(),
                        null,
                        null,
                        200);
        assertThat(binder.path("name").asString()).isEqualTo("Holo singles");
        assertThat(binder.path("itemCount").asLong()).isEqualTo(1);
        assertThat(binder.path("games").toString()).isEqualTo("[\"pokemon\"]");
        assertThat(binder.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(binder.path("owner").path("handle").asString()).isEqualTo(fixture.handle());
        assertThat(binder.path("owner").path("place").path("label").asString())
                .isEqualTo("Manitoba, Canada");
        assertThat(binder.path("owner").has("location")).isFalse();
        assertThat(binder.toString()).as("never the city").doesNotContain("Brandon");
        assertNoPrivateData(binder);

        JsonNode items =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/public/binders/" + fixture.binderId() + "/items",
                        null,
                        null,
                        200);
        assertThat(ids(items)).containsExactly(fixture.shownId());
        JsonNode first = items.path("items").get(0);
        assertThat(first.has("notes")).isFalse();
        assertThat(first.path("publicNotes").asString()).isEqualTo("Near mint, sleeved.");
        assertThat(first.path("askingPrice").decimalValue()).isEqualByComparingTo("18.50");
        assertThat(first.path("acceptsOffers").asBoolean()).isTrue();
        assertThat(first.path("binder").path("id").asString()).isEqualTo(fixture.binderId());
        assertThat(first.path("card").path("game").asString()).isEqualTo("pokemon");
        assertNoPrivateData(items);

        JsonNode inventory =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + fixture.handle() + "/inventory",
                        null,
                        null,
                        200);
        assertThat(ids(inventory)).containsExactly(fixture.shownId());
        assertNoPrivateData(inventory);
        JsonNode binders =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + fixture.handle() + "/binders",
                        null,
                        null,
                        200);
        assertThat(ids(binders)).containsExactly(fixture.binderId());
        assertThat(binders.get(0).path("itemCount").asLong()).isEqualTo(1);
        assertNoPrivateData(binders);

        // A signed-in viewer sees the same place, never a distance.
        String viewer = uniqueUid("pub-viewer");
        provisionCompliant(viewer);
        JsonNode seen =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/public/binders/" + fixture.binderId(),
                        viewer,
                        null,
                        200);
        assertThat(seen.path("owner").path("place").path("label").asString())
                .isEqualTo("Manitoba, Canada");
        assertThat(seen.path("owner").has("distanceBucket")).isFalse();
        assertNoPrivateData(seen);

        JsonNode profile =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + fixture.handle(),
                        viewer,
                        null,
                        200);
        assertThat(profile.path("publicBinderCount").asInt()).isEqualTo(1);
    }

    @Test
    void emptyAndPrivateBindersStayOutOfTheCollectorsList() {
        String owner = uniqueUid("pub-empty");
        Fixture fixture = publicCollector(owner);
        String empty =
                callJson(HttpMethod.POST, "/api/v1/binders", owner, binder("Empty", "PUBLIC"), 201)
                        .path("id")
                        .asString();
        String privateBinder =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner,
                                binder("Private", "PRIVATE"),
                                201)
                        .path("id")
                        .asString();
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + fixture.handle() + "/binders",
                                        null,
                                        null,
                                        200)))
                .containsExactly(fixture.binderId());
        JsonNode emptyView =
                callJson(HttpMethod.GET, "/api/v1/public/binders/" + empty, null, null, 200);
        assertThat(emptyView.path("itemCount").asLong()).isZero();
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + privateBinder, null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + privateBinder, owner, null, 404);
    }

    @Test
    void signedInViewsCountOncePerBinderAndDay() {
        String owner = uniqueUid("pub-views");
        Fixture fixture = publicCollector(owner);
        String second =
                callJson(HttpMethod.POST, "/api/v1/binders", owner, binder("Second", "PUBLIC"), 201)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE usage_limit l SET max_value = 1 FROM plan p WHERE p.id = l.plan_id AND"
                        + " p.code = 'FREE' AND l.limit_key = 'binder.views.per_day'");
        planService.invalidate();

        String viewer = uniqueUid("pub-views-viewer");
        provisionCompliant(viewer);
        String first = "/api/v1/public/binders/" + fixture.binderId();
        callJson(HttpMethod.GET, first, viewer, null, 200);
        callJson(HttpMethod.GET, first, viewer, null, 200);
        JsonNode problem =
                callJson(HttpMethod.GET, "/api/v1/public/binders/" + second, viewer, null, 429);
        assertThat(problem.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(problem.path("limitKey").asString()).isEqualTo("binder.views.per_day");
        assertThat(problem.path("resetsAt").asString()).isNotBlank();
        // Refused views are not remembered; anonymous and owner views are never counted.
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + second, viewer, null, 429);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + second, null, null, 200);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + second, owner, null, 200);
        List<Integer> counts = new ArrayList<>();
        testUsers
                .query(
                        "SELECT count FROM usage_counter c JOIN user_account u ON u.id = c.user_id"
                                + " WHERE u.provider_uid = ? AND c.limit_key ="
                                + " 'binder.views.per_day'",
                        viewer)
                .forEach(row -> counts.add(((Number) row.get("count")).intValue()));
        assertThat(counts).containsExactly(1);
    }

    /** No private notes, no private items, no coordinate anywhere in a public document. */
    private static void assertNoPrivateData(JsonNode document) {
        String text = document.toString();
        assertThat(text).doesNotContain(SECRET);
        assertThat(text).doesNotContain("\"notes\"");
        assertThat(text).doesNotContain("\"lat\"").doesNotContain("\"lng\"");
        assertThat(text)
                .doesNotContain("publicPoint")
                .doesNotContain("tradingArea")
                .doesNotContain("distanceBucket")
                .doesNotContain("Brandon");
    }
}
