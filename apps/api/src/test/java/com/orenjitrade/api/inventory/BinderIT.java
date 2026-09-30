package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Binders: CRUD, publish modes, unpublish, confirm, reorder, deletion keeping or deleting items,
 * ownership, validation and the {@code binders.max} plan limit.
 */
class BinderIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    private UUID azure;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        azure = printing(testUsers, "ygo-p001a");
    }

    private String createBinder(String uid, String name, String visibility) {
        return callJson(HttpMethod.POST, "/api/v1/binders", uid, binder(name, visibility), 201)
                .path("id")
                .asString();
    }

    private String createItem(String uid, String binderId) {
        Map<String, Object> body = item(azure);
        body.put("binderId", binderId);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    @Test
    void createListUpdateAndReorder() {
        String uid = uniqueUid("binder-crud");
        provisionCompliant(uid);
        EntityExchangeResult<byte[]> created =
                call(HttpMethod.POST, "/api/v1/binders", uid, binder("Alpha", "PRIVATE"));
        assertThat(created.getStatus().value()).isEqualTo(201);
        JsonNode alpha = json(created);
        String a = alpha.path("id").asString();
        assertThat(created.getResponseHeaders().getLocation()).hasPath("/api/v1/binders/" + a);
        assertThat(alpha.path("kind").asString()).isEqualTo("COLLECTION");
        assertThat(alpha.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(alpha.path("publicUntil").isNull()).isTrue();
        assertThat(alpha.path("itemCount").asLong()).isZero();
        assertThat(alpha.path("publicItemCount").asLong()).isZero();
        assertThat(alpha.path("effectivePublic").asBoolean()).isFalse();
        assertThat(alpha.path("coverImageUrl").isNull()).isTrue();
        assertThat(alpha.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(alpha.path("sortOrder").asInt()).isZero();
        String b = createBinder(uid, "Beta", "PRIVATE");
        String c = createBinder(uid, "Gamma", "PRIVATE");
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/binders", uid, null, 200)))
                .containsExactly(a, b, c);

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("name", "  Alpha trades ");
        patch.put("description", "Duplicates");
        patch.put("kind", "TRADE");
        patch.put("coverPrintingId", azure.toString());
        JsonNode updated = callJson(HttpMethod.PATCH, "/api/v1/binders/" + a, uid, patch, 200);
        assertThat(updated.path("name").asString()).isEqualTo("Alpha trades");
        assertThat(updated.path("description").asString()).isEqualTo("Duplicates");
        assertThat(updated.path("kind").asString()).isEqualTo("TRADE");
        assertThat(updated.path("coverPrintingId").asString()).isEqualTo(azure.toString());
        assertThat(updated.path("coverImageUrl").asString())
                .endsWith("/api/v1/public/placeholder-images/yugioh/azure-eyes-sky-dragon.svg");
        Map<String, Object> clearCover = new LinkedHashMap<>();
        clearCover.put("coverPrintingId", null);
        JsonNode cleared = callJson(HttpMethod.PATCH, "/api/v1/binders/" + a, uid, clearCover, 200);
        assertThat(cleared.path("coverPrintingId").isNull()).isTrue();
        assertThat(cleared.path("name").asString()).isEqualTo("Alpha trades");

        JsonNode reordered =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/binders/reorder",
                        uid,
                        Map.of("binderIds", List.of(c, a)),
                        200);
        assertThat(ids(reordered)).containsExactly(c, a, b);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/binders", uid, null, 200)))
                .containsExactly(c, a, b);
        callJson(
                HttpMethod.PUT,
                "/api/v1/binders/reorder",
                uid,
                Map.of("binderIds", List.of(c, c)),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/binders/reorder",
                uid,
                Map.of("binderIds", List.of(UUID.randomUUID().toString())),
                404);
    }

    @Test
    void publishModesSetVisibilityAndEnd() {
        String uid = uniqueUid("binder-publish");
        provisionCompliant(uid);
        String id = createBinder(uid, "Showcase", "PRIVATE");
        String uri = "/api/v1/binders/" + id;

        JsonNode published =
                callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "PUBLIC"), 200);
        assertThat(published.path("visibility").asString()).isEqualTo("PUBLIC");
        assertThat(published.path("publicUntil").isNull()).isTrue();

        JsonNode hour =
                callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "ONE_HOUR"), 200);
        assertThat(hour.path("visibility").asString()).isEqualTo("TEMPORARILY_PUBLIC");
        assertThat(Instant.parse(hour.path("publicUntil").asString()))
                .isCloseTo(Instant.now().plus(Duration.ofHours(1)), within(Duration.ofMinutes(1)));

        JsonNode day =
                callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "ONE_DAY"), 200);
        assertThat(day.path("visibility").asString()).isEqualTo("TEMPORARILY_PUBLIC");
        assertThat(Instant.parse(day.path("publicUntil").asString()))
                .isCloseTo(Instant.now().plus(Duration.ofDays(1)), within(Duration.ofMinutes(1)));

        JsonNode open =
                callJson(
                        HttpMethod.POST,
                        uri + "/publish",
                        uid,
                        Map.of("mode", "UNTIL_DISABLED"),
                        200);
        assertThat(open.path("visibility").asString()).isEqualTo("PUBLIC");
        assertThat(open.path("publicUntil").isNull()).isTrue();

        JsonNode unpublished = callJson(HttpMethod.POST, uri + "/unpublish", uid, null, 200);
        assertThat(unpublished.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(unpublished.path("publicUntil").isNull()).isTrue();

        callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "FOREVER"), 400);
        callJson(HttpMethod.POST, uri + "/publish", uid, Map.of(), 400);

        // PATCH with a temporary visibility needs an end at most 30 days ahead.
        callJson(HttpMethod.PATCH, uri, uid, Map.of("visibility", "TEMPORARILY_PUBLIC"), 400);
        JsonNode temporary =
                callJson(
                        HttpMethod.PATCH,
                        uri,
                        uid,
                        Map.of(
                                "visibility",
                                "TEMPORARILY_PUBLIC",
                                "publicUntil",
                                Instant.now().plus(Duration.ofDays(10)).toString()),
                        200);
        assertThat(temporary.path("visibility").asString()).isEqualTo("TEMPORARILY_PUBLIC");
    }

    @Test
    void publishingAndConfirmingRefreshTheBinderAndItsItems() {
        String uid = uniqueUid("binder-confirm");
        provisionCompliant(uid);
        String id = createBinder(uid, "Old binder", "PRIVATE");
        String itemId = createItem(uid, id);
        testUsers.update(
                "UPDATE binder SET freshness_state = 'HIDDEN', confirmed_at = now() - interval '50"
                        + " days' WHERE id = ?",
                UUID.fromString(id));
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN', hidden_reason ="
                        + " 'STALE_UNCONFIRMED', confirmed_at = now() - interval '50 days' WHERE"
                        + " id = ?",
                UUID.fromString(itemId));

        JsonNode confirmed =
                callJson(HttpMethod.POST, "/api/v1/binders/" + id + "/confirm", uid, null, 200);
        assertThat(confirmed.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/inventory/items/" + itemId,
                                        uid,
                                        null,
                                        200)
                                .path("freshness")
                                .path("state")
                                .asString())
                .isEqualTo("ACTIVE");
        assertThat(
                        testUsers.query(
                                "SELECT event FROM inventory_freshness_event WHERE binder_id = ?",
                                UUID.fromString(id)))
                .extracting(row -> row.get("event"))
                .containsExactly("RESTORED");

        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE', confirmed_at = now() -"
                        + " interval '35 days' WHERE id = ?",
                UUID.fromString(itemId));
        callJson(
                HttpMethod.POST,
                "/api/v1/binders/" + id + "/publish",
                uid,
                Map.of("mode", "PUBLIC"),
                200);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/inventory/items/" + itemId,
                                        uid,
                                        null,
                                        200)
                                .path("freshness")
                                .path("state")
                                .asString())
                .isEqualTo("ACTIVE");
    }

    @Test
    void deletingABinderKeepsItsItemsUnlessAskedOtherwise() {
        String uid = uniqueUid("binder-delete");
        provisionCompliant(uid);

        String privateBinder = createBinder(uid, "Private", "PRIVATE");
        String hiddenItem = createItem(uid, privateBinder);
        callJson(HttpMethod.DELETE, "/api/v1/binders/" + privateBinder, uid, null, 204);
        callJson(HttpMethod.GET, "/api/v1/binders/" + privateBinder, uid, null, 404);
        JsonNode unfiled =
                callJson(HttpMethod.GET, "/api/v1/inventory/items/" + hiddenItem, uid, null, 200);
        assertThat(unfiled.path("binder").isNull()).isTrue();
        assertThat(unfiled.path("visibility").asString())
                .as("unfiling never exposes an item of a private binder")
                .isEqualTo("PRIVATE");

        String publicBinder = createBinder(uid, "Public", "PUBLIC");
        String shownItem = createItem(uid, publicBinder);
        callJson(HttpMethod.DELETE, "/api/v1/binders/" + publicBinder, uid, null, 204);
        JsonNode kept =
                callJson(HttpMethod.GET, "/api/v1/inventory/items/" + shownItem, uid, null, 200);
        assertThat(kept.path("binder").isNull()).isTrue();
        assertThat(kept.path("visibility").asString()).isEqualTo("PUBLIC");

        String doomed = createBinder(uid, "Doomed", "PRIVATE");
        String doomedItem = createItem(uid, doomed);
        callJson(
                HttpMethod.DELETE,
                "/api/v1/binders/" + doomed + "?deleteItems=true",
                uid,
                null,
                204);
        callJson(HttpMethod.GET, "/api/v1/inventory/items/" + doomedItem, uid, null, 404);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/inventory/items", uid, null, 200)))
                .containsExactlyInAnyOrder(hiddenItem, shownItem);
    }

    @Test
    void countsFollowTheItemsAndTheOwnersSettings() {
        String uid = uniqueUid("binder-counts");
        provisionCompliant(uid);
        String id = createBinder(uid, "Counted", "PUBLIC");
        createItem(uid, id);
        String second = createItem(uid, id);
        JsonNode binder = callJson(HttpMethod.GET, "/api/v1/binders/" + id, uid, null, 200);
        assertThat(binder.path("itemCount").asLong()).isEqualTo(2);
        assertThat(binder.path("games").toString()).isEqualTo("[\"yugioh\"]");
        assertThat(binder.path("publicItemCount").asLong())
                .as("default privacy: not discoverable, MEMBERS profile")
                .isZero();
        assertThat(binder.path("effectivePublic").asBoolean()).isFalse();
        assertThat(binder.path("coverImageUrl").asString()).contains("azure-eyes-sky-dragon");

        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        JsonNode listed = callJson(HttpMethod.GET, "/api/v1/binders/" + id, uid, null, 200);
        assertThat(listed.path("publicItemCount").asLong()).isEqualTo(2);
        assertThat(listed.path("effectivePublic").asBoolean()).isTrue();

        callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + second, uid, null, 204);
        JsonNode afterDelete = callJson(HttpMethod.GET, "/api/v1/binders/" + id, uid, null, 200);
        assertThat(afterDelete.path("itemCount").asLong()).isEqualTo(1);
        assertThat(afterDelete.path("publicItemCount").asLong()).isEqualTo(1);
    }

    @Test
    void bindersBelongToTheirOwnerOnly() {
        String owner = uniqueUid("binder-owner");
        String other = uniqueUid("binder-other");
        provisionCompliant(owner);
        provisionCompliant(other);
        String id = createBinder(owner, "Mine", "PRIVATE");
        String uri = "/api/v1/binders/" + id;
        callJson(HttpMethod.GET, uri, other, null, 404);
        callJson(HttpMethod.PATCH, uri, other, Map.of("name", "Stolen"), 404);
        callJson(HttpMethod.DELETE, uri, other, null, 404);
        callJson(HttpMethod.POST, uri + "/publish", other, Map.of("mode", "PUBLIC"), 404);
        callJson(HttpMethod.POST, uri + "/unpublish", other, null, 404);
        callJson(HttpMethod.POST, uri + "/confirm", other, null, 404);
        callJson(
                HttpMethod.PUT,
                "/api/v1/binders/reorder",
                other,
                Map.of("binderIds", List.of(id)),
                404);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/binders", other, null, 200))).isEmpty();
        callJson(HttpMethod.GET, "/api/v1/binders", null, null, 401);
        callJson(HttpMethod.POST, "/api/v1/binders", null, binder("Anon", "PRIVATE"), 401);
        callJson(HttpMethod.GET, uri, null, null, 401);
        assertThat(callJson(HttpMethod.GET, uri, owner, null, 200).path("name").asString())
                .isEqualTo("Mine");
    }

    @Test
    void invalidInputIsRejected() {
        String uid = uniqueUid("binder-invalid");
        provisionCompliant(uid);
        callJson(HttpMethod.POST, "/api/v1/binders", uid, binder("  ", "PRIVATE"), 400);
        callJson(HttpMethod.POST, "/api/v1/binders", uid, binder("x".repeat(81), "PRIVATE"), 400);
        Map<String, Object> longDescription = binder("Fine", "PRIVATE");
        longDescription.put("description", "x".repeat(1001));
        callJson(HttpMethod.POST, "/api/v1/binders", uid, longDescription, 400);
        callJson(
                HttpMethod.POST, "/api/v1/binders", uid, binder("Temp", "TEMPORARILY_PUBLIC"), 400);
        Map<String, Object> wrongKind = binder("Kind", "PRIVATE");
        wrongKind.put("kind", "SHOEBOX");
        callJson(HttpMethod.POST, "/api/v1/binders", uid, wrongKind, 400);
        Map<String, Object> unknownCover = binder("Cover", "PRIVATE");
        unknownCover.put("coverPrintingId", UUID.randomUUID().toString());
        callJson(HttpMethod.POST, "/api/v1/binders", uid, unknownCover, 400);

        String id = createBinder(uid, "Valid", "PRIVATE");
        Map<String, Object> nullName = new LinkedHashMap<>();
        nullName.put("name", null);
        callJson(HttpMethod.PATCH, "/api/v1/binders/" + id, uid, nullName, 400);
        callJson(HttpMethod.PATCH, "/api/v1/binders/" + id, uid, Map.of("kind", "SHOEBOX"), 400);
        callJson(HttpMethod.PATCH, "/api/v1/binders/" + id, uid, Map.of("name", ""), 400);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/binders", uid, null, 200)))
                .containsExactly(id);
    }

    @Test
    void theBinderLimitFollowsThePlan() {
        String uid = uniqueUid("binder-limit");
        provisionCompliant(uid);
        String first = null;
        for (int i = 1; i <= 5; i++) {
            String id = createBinder(uid, "Binder " + i, "PRIVATE");
            if (first == null) {
                first = id;
            }
        }
        JsonNode problem =
                callJson(HttpMethod.POST, "/api/v1/binders", uid, binder("Sixth", "PRIVATE"), 429);
        assertThat(problem.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(problem.path("limitKey").asString()).isEqualTo("binders.max");
        assertThat(problem.path("limit").asInt()).isEqualTo(5);
        assertThat(problem.path("used").asInt()).isEqualTo(5);
        assertThat(problem.path("upgradeUrl").asString()).isEqualTo("/premium");
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/binders", uid, null, 200))).hasSize(5);

        JsonNode plan = callJson(HttpMethod.GET, "/api/v1/me/plan", uid, null, 200);
        JsonNode bindersMax = null;
        for (JsonNode limit : plan.path("limits")) {
            if (limit.path("key").asString().equals("binders.max")) {
                bindersMax = limit;
            }
        }
        assertThat(bindersMax).isNotNull();
        assertThat(bindersMax.path("used").asLong()).isEqualTo(5);

        callJson(HttpMethod.DELETE, "/api/v1/binders/" + first, uid, null, 204);
        createBinder(uid, "Replacement", "PRIVATE");
    }
}
