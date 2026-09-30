package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
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
 * {@code POST /inventory/items/bulk}: every action, per-id ownership (others' items are skipped as
 * NOT_FOUND, never touched), UNCHANGED items, validation and all-or-nothing behaviour.
 */
class BulkOperationsIT extends AbstractIntegrationTest {

    static final String BULK = "/api/v1/inventory/items/bulk";

    @Autowired private CatalogImportService importService;

    private UUID printingId;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        printingId = printing(testUsers, "mtg-p007a");
    }

    private String createItem(String uid, Map<String, Object> extra) {
        Map<String, Object> body = item(printingId);
        body.putAll(extra);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    private JsonNode get(String uid, String itemId) {
        return callJson(HttpMethod.GET, "/api/v1/inventory/items/" + itemId, uid, null, 200);
    }

    private static Map<String, Object> bulk(String action, List<String> itemIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("itemIds", itemIds);
        body.put("action", action);
        return body;
    }

    @Test
    void setVisibilityUpdatesOwnedItemsAndSkipsOthers() {
        String uid = uniqueUid("bulk-vis");
        String other = uniqueUid("bulk-vis-other");
        provisionCompliant(uid);
        provisionCompliant(other);
        String a = createItem(uid, Map.of());
        String b = createItem(uid, Map.of());
        String alreadyPublic = createItem(uid, Map.of("visibility", "PUBLIC"));
        String foreign = createItem(other, Map.of());
        String unknown = UUID.randomUUID().toString();

        Map<String, Object> body =
                bulk("SET_VISIBILITY", List.of(a, b, alreadyPublic, foreign, unknown, a));
        body.put("visibility", "PUBLIC");
        JsonNode result = callJson(HttpMethod.POST, BULK, uid, body, 200);
        assertThat(result.path("updated").asInt()).isEqualTo(2);
        Map<String, String> skipped = new LinkedHashMap<>();
        result.path("skipped")
                .forEach(
                        skip ->
                                skipped.put(
                                        skip.path("itemId").asString(),
                                        skip.path("reason").asString()));
        assertThat(skipped)
                .containsEntry(alreadyPublic, "UNCHANGED")
                .containsEntry(foreign, "NOT_FOUND")
                .containsEntry(unknown, "NOT_FOUND")
                .hasSize(3);
        assertThat(get(uid, a).path("visibility").asString()).isEqualTo("PUBLIC");
        assertThat(get(uid, b).path("visibility").asString()).isEqualTo("PUBLIC");
        assertThat(get(other, foreign).path("visibility").asString())
                .as("another collector's item is never touched")
                .isEqualTo("PRIVATE");

        Map<String, Object> temporary = bulk("SET_VISIBILITY", List.of(a));
        temporary.put("visibility", "TEMPORARILY_PUBLIC");
        callJson(HttpMethod.POST, BULK, uid, temporary, 400);
        temporary.put("publicUntil", Instant.now().plus(Duration.ofDays(40)).toString());
        callJson(HttpMethod.POST, BULK, uid, temporary, 400);
        temporary.put("publicUntil", Instant.now().plus(Duration.ofDays(3)).toString());
        assertThat(callJson(HttpMethod.POST, BULK, uid, temporary, 200).path("updated").asInt())
                .isEqualTo(1);
        assertThat(get(uid, a).path("visibility").asString()).isEqualTo("TEMPORARILY_PUBLIC");
    }

    @Test
    void moveToBinderAndBackToUnfiled() {
        String uid = uniqueUid("bulk-move");
        provisionCompliant(uid);
        String privateBinder =
                callJson(HttpMethod.POST, "/api/v1/binders", uid, binder("Private", "PRIVATE"), 201)
                        .path("id")
                        .asString();
        String publicBinder =
                callJson(HttpMethod.POST, "/api/v1/binders", uid, binder("Public", "PUBLIC"), 201)
                        .path("id")
                        .asString();
        String a = createItem(uid, Map.of("binderId", privateBinder));
        String b = createItem(uid, Map.of("binderId", privateBinder));
        String c = createItem(uid, Map.of("binderId", publicBinder));

        Map<String, Object> move = bulk("MOVE_TO_BINDER", List.of(a, b, c));
        move.put("binderId", publicBinder);
        JsonNode moved = callJson(HttpMethod.POST, BULK, uid, move, 200);
        assertThat(moved.path("updated").asInt()).isEqualTo(2);
        assertThat(moved.path("skipped").get(0).path("reason").asString()).isEqualTo("UNCHANGED");
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/binders/" + publicBinder + "/items",
                                        uid,
                                        null,
                                        200)))
                .containsExactlyInAnyOrder(a, b, c);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/binders/" + privateBinder, uid, null, 200)
                                .path("itemCount")
                                .asLong())
                .isZero();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/binders/" + publicBinder, uid, null, 200)
                                .path("itemCount")
                                .asLong())
                .isEqualTo(3);

        // Back to a private binder, then unfiled: unfiling never exposes an item.
        move.put("binderId", privateBinder);
        move.put("itemIds", List.of(a));
        callJson(HttpMethod.POST, BULK, uid, move, 200);
        Map<String, Object> unfile = bulk("MOVE_TO_BINDER", List.of(a, b));
        unfile.put("binderId", null);
        assertThat(callJson(HttpMethod.POST, BULK, uid, unfile, 200).path("updated").asInt())
                .isEqualTo(2);
        JsonNode fromPrivate = get(uid, a);
        assertThat(fromPrivate.path("binder").isNull()).isTrue();
        assertThat(fromPrivate.path("visibility").asString()).isEqualTo("PRIVATE");
        JsonNode fromPublic = get(uid, b);
        assertThat(fromPublic.path("binder").isNull()).isTrue();
        assertThat(fromPublic.path("visibility").asString()).isEqualTo("PUBLIC");

        String other = uniqueUid("bulk-move-other");
        provisionCompliant(other);
        String foreignBinder =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                other,
                                binder("Theirs", "PRIVATE"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> intoForeign = bulk("MOVE_TO_BINDER", List.of(c));
        intoForeign.put("binderId", foreignBinder);
        callJson(HttpMethod.POST, BULK, uid, intoForeign, 404);
        assertThat(get(uid, c).path("binder").path("id").asString()).isEqualTo(publicBinder);
    }

    @Test
    void availabilityConfirmAndDelete() {
        String uid = uniqueUid("bulk-misc");
        provisionCompliant(uid);
        List<String> items = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            items.add(createItem(uid, Map.of()));
        }
        Map<String, Object> availability = bulk("SET_AVAILABILITY", items);
        callJson(HttpMethod.POST, BULK, uid, availability, 400);
        availability.put("availability", "TRADE_OR_SALE");
        assertThat(callJson(HttpMethod.POST, BULK, uid, availability, 200).path("updated").asInt())
                .isEqualTo(3);
        assertThat(get(uid, items.get(2)).path("availability").asString())
                .isEqualTo("TRADE_OR_SALE");

        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN', confirmed_at = now() -"
                        + " interval '50 days' WHERE id = ?",
                UUID.fromString(items.get(0)));
        JsonNode confirmed = callJson(HttpMethod.POST, BULK, uid, bulk("CONFIRM", items), 200);
        assertThat(confirmed.path("updated").asInt()).isEqualTo(3);
        assertThat(get(uid, items.get(0)).path("freshness").path("state").asString())
                .isEqualTo("ACTIVE");

        JsonNode deleted =
                callJson(
                        HttpMethod.POST,
                        BULK,
                        uid,
                        bulk("DELETE", List.of(items.get(0), items.get(1))),
                        200);
        assertThat(deleted.path("updated").asInt()).isEqualTo(2);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/inventory/items", uid, null, 200)))
                .containsExactly(items.get(2));
        JsonNode again =
                callJson(HttpMethod.POST, BULK, uid, bulk("DELETE", List.of(items.get(0))), 200);
        assertThat(again.path("updated").asInt()).isZero();
        assertThat(again.path("skipped").get(0).path("reason").asString()).isEqualTo("NOT_FOUND");
    }

    @Test
    void invalidRequestsChangeNothing() {
        String uid = uniqueUid("bulk-invalid");
        provisionCompliant(uid);
        String a = createItem(uid, Map.of());
        callJson(HttpMethod.POST, BULK, uid, bulk("SET_VISIBILITY", List.of(a)), 400);
        callJson(HttpMethod.POST, BULK, uid, bulk("SHUFFLE", List.of(a)), 400);
        callJson(HttpMethod.POST, BULK, uid, bulk("DELETE", List.of()), 400);
        List<String> tooMany = new ArrayList<>();
        for (int i = 0; i < 501; i++) {
            tooMany.add(UUID.randomUUID().toString());
        }
        callJson(HttpMethod.POST, BULK, uid, bulk("DELETE", tooMany), 400);
        callJson(HttpMethod.POST, BULK, null, bulk("DELETE", List.of(a)), 401);
        assertThat(get(uid, a).path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/inventory/items", uid, null, 200)))
                .containsExactly(a);
    }
}
