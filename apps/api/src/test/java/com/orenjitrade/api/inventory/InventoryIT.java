package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.png;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/** Inventory items: CRUD, defaults, partial updates, validation, ownership, photos, summary. */
class InventoryIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    private UUID azure;
    private UUID emberfang;
    private UUID tidebinder;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        azure = printing(testUsers, "ygo-p001a");
        emberfang = printing(testUsers, "pkm-p001a");
        tidebinder = printing(testUsers, "mtg-p001a");
    }

    private JsonNode create(String uid, Map<String, Object> body) {
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201);
    }

    @Test
    void createsAnItemWithDefaultsAndReadsItBack() {
        String uid = uniqueUid("inv-create");
        provisionCompliant(uid);
        EntityExchangeResult<byte[]> result =
                call(HttpMethod.POST, "/api/v1/inventory/items", uid, item(azure));
        assertThat(result.getStatus().value()).isEqualTo(201);
        JsonNode created = json(result);
        String id = created.path("id").asString();
        assertThat(result.getResponseHeaders().getLocation())
                .hasPath("/api/v1/inventory/items/" + id);
        assertThat(created.path("quantity").asInt()).isEqualTo(1);
        assertThat(created.path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(created.path("language").asString()).isEqualTo("en");
        assertThat(created.path("edition").asString()).isEqualTo("FIRST_EDITION");
        assertThat(created.path("finish").asString()).isEqualTo("NORMAL");
        assertThat(created.path("currency").asString()).isEqualTo("CAD");
        assertThat(created.path("availability").asString()).isEqualTo("COLLECTION_ONLY");
        assertThat(created.path("acceptsOffers").asBoolean()).isFalse();
        assertThat(created.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(created.path("publicUntil").isNull()).isTrue();
        assertThat(created.path("binder").isNull()).isTrue();
        assertThat(created.path("askingPrice").isNull()).isTrue();
        assertThat(created.path("effectivePublic").asBoolean()).isFalse();
        assertThat(created.path("notes").asString()).isEmpty();
        assertThat(created.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(created.path("freshness").path("label").asString())
                .isEqualTo("Updated just now");
        assertThat(created.path("printing").path("id").asString()).isEqualTo(azure.toString());
        assertThat(created.path("printing").path("printingCode").asString()).isEqualTo("AZR-EN001");
        assertThat(created.path("card").path("name").asString()).isEqualTo("Azure-Eyes Sky Dragon");
        assertThat(created.path("card").path("game").asString()).isEqualTo("yugioh");
        assertThat(created.path("images").size()).isZero();

        JsonNode read = callJson(HttpMethod.GET, "/api/v1/inventory/items/" + id, uid, null, 200);
        assertThat(read.path("id").asString()).isEqualTo(id);
        assertThat(read.path("card").path("id").asString())
                .isEqualTo(created.path("card").path("id").asString());
        JsonNode list = callJson(HttpMethod.GET, "/api/v1/inventory/items", uid, null, 200);
        assertThat(ids(list)).containsExactly(id);
        assertThat(list.path("totalItems").asLong()).isEqualTo(1);
    }

    @Test
    void partialUpdatesChangeOnlyTheSentFieldsAndClearNullableOnes() {
        String uid = uniqueUid("inv-patch");
        provisionCompliant(uid);
        Map<String, Object> body = item(emberfang);
        body.put("askingPrice", 12.5);
        body.put("notes", "Private note");
        body.put("publicNotes", "Shown publicly");
        body.put("condition", "lightly_played");
        String id = create(uid, body).path("id").asString();
        String uri = "/api/v1/inventory/items/" + id;

        JsonNode unchanged = callJson(HttpMethod.PATCH, uri, uid, Map.of(), 200);
        assertThat(unchanged.path("askingPrice").decimalValue()).isEqualByComparingTo("12.50");
        assertThat(unchanged.path("condition").asString()).isEqualTo("LIGHTLY_PLAYED");
        assertThat(unchanged.path("finish").asString()).isEqualTo("HOLO");

        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("askingPrice", null);
        patch.put("notes", null);
        patch.put("quantity", 3);
        patch.put("availability", "TRADE");
        patch.put("acceptsOffers", true);
        JsonNode updated = callJson(HttpMethod.PATCH, uri, uid, patch, 200);
        assertThat(updated.path("askingPrice").isNull()).isTrue();
        assertThat(updated.path("notes").asString()).isEmpty();
        assertThat(updated.path("publicNotes").asString()).isEqualTo("Shown publicly");
        assertThat(updated.path("quantity").asInt()).isEqualTo(3);
        assertThat(updated.path("availability").asString()).isEqualTo("TRADE");
        assertThat(updated.path("acceptsOffers").asBoolean()).isTrue();

        // Changing the printing resets language/edition/finish to the new printing's values.
        JsonNode moved =
                callJson(
                        HttpMethod.PATCH,
                        uri,
                        uid,
                        Map.of("printingId", printing(testUsers, "pkm-p001b").toString()),
                        200);
        assertThat(moved.path("language").asString()).isEqualTo("fr");
        assertThat(moved.path("finish").asString()).isEqualTo("REVERSE_HOLO");

        Map<String, Object> nullQuantity = new LinkedHashMap<>();
        nullQuantity.put("quantity", null);
        callJson(HttpMethod.PATCH, uri, uid, nullQuantity, 400);
        callJson(HttpMethod.PATCH, uri, uid, Map.of("condition", "SUPERB"), 400);
        callJson(HttpMethod.PATCH, uri, uid, Map.of("quantity", "many"), 400);
        callJson(HttpMethod.PATCH, uri, uid, Map.of("visibility", "TEMPORARILY_PUBLIC"), 400);
        callJson(
                HttpMethod.PATCH,
                uri,
                uid,
                Map.of(
                        "visibility",
                        "TEMPORARILY_PUBLIC",
                        "publicUntil",
                        Instant.now().plus(Duration.ofDays(31)).toString()),
                400);
        JsonNode temporary =
                callJson(
                        HttpMethod.PATCH,
                        uri,
                        uid,
                        Map.of(
                                "visibility",
                                "TEMPORARILY_PUBLIC",
                                "publicUntil",
                                Instant.now().plus(Duration.ofDays(2)).toString()),
                        200);
        assertThat(temporary.path("visibility").asString()).isEqualTo("TEMPORARILY_PUBLIC");
        assertThat(temporary.path("publicUntil").asString()).isNotBlank();
        JsonNode privateAgain =
                callJson(HttpMethod.PATCH, uri, uid, Map.of("visibility", "PRIVATE"), 200);
        assertThat(privateAgain.path("publicUntil").isNull()).isTrue();
    }

    @Test
    void invalidInputIsRejectedWithFieldErrors() {
        String uid = uniqueUid("inv-invalid");
        provisionCompliant(uid);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, Map.of(), 400);
        JsonNode unknown =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/inventory/items",
                        uid,
                        item(UUID.randomUUID()),
                        400);
        assertThat(unknown.path("errors").toString()).contains("printingId");

        for (Map.Entry<String, Object> invalid :
                Map.<String, Object>of(
                                "quantity",
                                0,
                                "condition",
                                "SUPERB",
                                "askingPrice",
                                1.234,
                                "currency",
                                "ZZZ",
                                "language",
                                "english",
                                "notes",
                                "x".repeat(2001),
                                "publicNotes",
                                "x".repeat(501),
                                "availability",
                                "SOMETIMES")
                        .entrySet()) {
            Map<String, Object> body = item(azure);
            body.put(invalid.getKey(), invalid.getValue());
            JsonNode problem = callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 400);
            assertThat(problem.path("errorCode").asString())
                    .as(invalid.getKey())
                    .isEqualTo("VALIDATION_FAILED");
        }
        Map<String, Object> temporary = item(azure);
        temporary.put("visibility", "TEMPORARILY_PUBLIC");
        JsonNode missingEnd =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, temporary, 400);
        assertThat(missingEnd.path("errors").toString()).contains("publicUntil");
        temporary.put("publicUntil", Instant.now().minusSeconds(60).toString());
        callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, temporary, 400);
        callJson(HttpMethod.GET, "/api/v1/inventory/items?sort=random", uid, null, 400);
        callJson(HttpMethod.GET, "/api/v1/inventory/items?game=chess", uid, null, 400);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item i JOIN user_account u ON"
                                        + " u.id = i.owner_id WHERE u.provider_uid = ?",
                                uid))
                .isZero();
    }

    @Test
    void itemsBelongToTheirOwnerOnly() {
        String owner = uniqueUid("inv-owner");
        String other = uniqueUid("inv-other");
        provisionCompliant(owner);
        provisionCompliant(other);
        String id = create(owner, item(azure)).path("id").asString();
        String uri = "/api/v1/inventory/items/" + id;

        callJson(HttpMethod.GET, uri, other, null, 404);
        callJson(HttpMethod.PATCH, uri, other, Map.of("quantity", 2), 404);
        callJson(HttpMethod.DELETE, uri, other, null, 404);
        callJson(HttpMethod.POST, uri + "/confirm", other, null, 404);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/inventory/items", other, null, 200)))
                .doesNotContain(id);

        callJson(HttpMethod.GET, uri, null, null, 401);
        callJson(HttpMethod.GET, "/api/v1/inventory/items", null, null, 401);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", null, item(azure), 401);
        callJson(HttpMethod.GET, "/api/v1/inventory/summary", null, null, 401);

        String otherBinder =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                other,
                                InventoryTestSupport.binder("Not yours", "PRIVATE"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> intoForeignBinder = item(azure);
        intoForeignBinder.put("binderId", otherBinder);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner, intoForeignBinder, 404);
        callJson(HttpMethod.PATCH, uri, owner, Map.of("binderId", otherBinder), 404);
        callJson(
                HttpMethod.GET,
                "/api/v1/inventory/items?binderId=" + otherBinder,
                owner,
                null,
                404);
        assertThat(callJson(HttpMethod.GET, uri, owner, null, 200).path("quantity").asInt())
                .isEqualTo(1);
    }

    @Test
    void deleteIsSoftAndHidesTheItemEverywhere() {
        String uid = uniqueUid("inv-delete");
        provisionCompliant(uid);
        String id = create(uid, item(azure)).path("id").asString();
        callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + id, uid, null, 204);
        callJson(HttpMethod.GET, "/api/v1/inventory/items/" + id, uid, null, 404);
        callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + id, uid, null, 404);
        assertThat(ids(callJson(HttpMethod.GET, "/api/v1/inventory/items", uid, null, 200)))
                .isEmpty();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ? AND deleted_at IS"
                                        + " NOT NULL",
                                UUID.fromString(id)))
                .isEqualTo(1);
    }

    @Test
    void listFiltersSortsAndPages() {
        String uid = uniqueUid("inv-list");
        provisionCompliant(uid);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                InventoryTestSupport.binder("Trades", "PRIVATE"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> first = item(azure);
        first.put("askingPrice", 40);
        first.put("availability", "SALE");
        first.put("binderId", binderId);
        String azureId = create(uid, first).path("id").asString();
        Map<String, Object> second = item(emberfang);
        second.put("askingPrice", 5);
        second.put("condition", "MINT");
        String emberId = create(uid, second).path("id").asString();
        Map<String, Object> third = item(tidebinder);
        third.put("visibility", "PUBLIC");
        String tideId = create(uid, third).path("id").asString();

        String base = "/api/v1/inventory/items";
        assertThat(ids(callJson(HttpMethod.GET, base + "?game=pokemon", uid, null, 200)))
                .containsExactly(emberId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?binderId=" + binderId, uid, null, 200)))
                .containsExactly(azureId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?unfiled=true", uid, null, 200)))
                .containsExactlyInAnyOrder(emberId, tideId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?visibility=PUBLIC", uid, null, 200)))
                .containsExactlyInAnyOrder(azureId, tideId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?availability=SALE", uid, null, 200)))
                .containsExactly(azureId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?condition=mint", uid, null, 200)))
                .containsExactly(emberId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?freshness=ACTIVE", uid, null, 200)))
                .hasSize(3);
        assertThat(ids(callJson(HttpMethod.GET, base + "?query=azure", uid, null, 200)))
                .containsExactly(azureId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?query=AZR-EN0", uid, null, 200)))
                .containsExactly(azureId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?query=emberfang", uid, null, 200)))
                .containsExactly(emberId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?sort=price", uid, null, 200)))
                .containsExactly(azureId, emberId, tideId);
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        base + "?sort=price&direction=asc",
                                        uid,
                                        null,
                                        200)))
                .containsExactly(emberId, azureId, tideId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?sort=name", uid, null, 200)))
                .containsExactly(azureId, emberId, tideId);
        assertThat(ids(callJson(HttpMethod.GET, base + "?sort=updated", uid, null, 200)).get(0))
                .isEqualTo(tideId);
        JsonNode page = callJson(HttpMethod.GET, base + "?sort=name&size=1&page=1", uid, null, 200);
        assertThat(ids(page)).containsExactly(emberId);
        assertThat(page.path("totalItems").asLong()).isEqualTo(3);
        assertThat(page.path("totalPages").asInt()).isEqualTo(3);

        JsonNode binderItems =
                callJson(HttpMethod.GET, "/api/v1/binders/" + binderId + "/items", uid, null, 200);
        assertThat(ids(binderItems)).containsExactly(azureId);
        String other = uniqueUid("inv-list-other");
        provisionCompliant(other);
        callJson(HttpMethod.GET, "/api/v1/binders/" + binderId + "/items", other, null, 404);
    }

    @Test
    void photosAreReencodedStrippedAndLimitedToFour() {
        String uid = uniqueUid("inv-photos");
        provisionCompliant(uid);
        String id = create(uid, item(azure)).path("id").asString();
        String uri = "/api/v1/inventory/items/" + id + "/images";

        JsonNode withPhoto = upload(uid, uri, png(2000, 1000), MediaType.IMAGE_PNG, 201);
        JsonNode image = withPhoto.path("images").get(0);
        assertThat(image.path("width").asInt()).isEqualTo(1600);
        assertThat(image.path("height").asInt()).isEqualTo(800);
        String url = image.path("url").asString();
        assertThat(url).contains("/api/v1/public/media/inventory/");
        EntityExchangeResult<byte[]> media =
                http.get().uri(URI.create(url).getPath()).exchange().expectBody().returnResult();
        assertThat(media.getStatus().value()).isEqualTo(200);
        assertThat(media.getResponseHeaders().getContentType()).isEqualTo(MediaType.IMAGE_JPEG);

        for (int i = 0; i < 3; i++) {
            upload(uid, uri, png(64, 64), MediaType.IMAGE_PNG, 201);
        }
        JsonNode full = upload(uid, uri, png(64, 64), MediaType.IMAGE_PNG, 409);
        assertThat(full.path("errorCode").asString()).isEqualTo("CONFLICT");
        upload(uid, uri, "not an image".getBytes(), MediaType.TEXT_PLAIN, 415);

        String imageId = image.path("id").asString();
        String other = uniqueUid("inv-photos-other");
        provisionCompliant(other);
        upload(other, uri, png(64, 64), MediaType.IMAGE_PNG, 404);
        callJson(HttpMethod.DELETE, uri + "/" + imageId, other, null, 404);
        callJson(HttpMethod.DELETE, uri + "/" + imageId, uid, null, 204);
        callJson(HttpMethod.DELETE, uri + "/" + imageId, uid, null, 404);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/inventory/items/" + id, uid, null, 200)
                                .path("images")
                                .size())
                .isEqualTo(3);
        http.get().uri(URI.create(url).getPath()).exchange().expectStatus().isNotFound();
    }

    @Test
    void summaryCountsTheCallersInventory() {
        String uid = uniqueUid("inv-summary");
        provisionCompliant(uid);
        Map<String, Object> privateItem = item(azure);
        privateItem.put("quantity", 3);
        create(uid, privateItem);
        Map<String, Object> publicItem = item(emberfang);
        publicItem.put("visibility", "PUBLIC");
        create(uid, publicItem);
        Map<String, Object> temporary = item(tidebinder);
        Instant until = Instant.now().plus(Duration.ofDays(3));
        temporary.put("visibility", "TEMPORARILY_PUBLIC");
        temporary.put("publicUntil", until.toString());
        String staleId = create(uid, temporary).path("id").asString();
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE' WHERE id = ?",
                UUID.fromString(staleId));

        JsonNode summary = callJson(HttpMethod.GET, "/api/v1/inventory/summary", uid, null, 200);
        assertThat(summary.path("totalItems").asLong()).isEqualTo(3);
        assertThat(summary.path("totalQuantity").asLong()).isEqualTo(5);
        assertThat(summary.path("byVisibility").path("PRIVATE").asLong()).isEqualTo(1);
        assertThat(summary.path("byVisibility").path("PUBLIC").asLong()).isEqualTo(1);
        assertThat(summary.path("byVisibility").path("TEMPORARILY_PUBLIC").asLong()).isEqualTo(1);
        assertThat(summary.path("byGame").path("yugioh").asLong()).isEqualTo(1);
        assertThat(summary.path("byGame").path("pokemon").asLong()).isEqualTo(1);
        assertThat(summary.path("byGame").path("mtg").asLong()).isEqualTo(1);
        assertThat(summary.path("staleCount").asLong()).isEqualTo(1);
        assertThat(summary.path("hiddenCount").asLong()).isZero();
        assertThat(Instant.parse(summary.path("nextExpiry").asString()))
                .isCloseTo(until, org.assertj.core.api.Assertions.within(Duration.ofSeconds(1)));
        assertThat(summary.path("effectivePublicCount").asLong())
                .as("a default (not discoverable, MEMBERS) owner lists nothing publicly")
                .isZero();
    }

    @Test
    void confirmRefreshesTheItemAndRestoresHiddenOnes() {
        String uid = uniqueUid("inv-confirm");
        provisionCompliant(uid);
        String id = create(uid, item(azure)).path("id").asString();
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN', hidden_reason ="
                        + " 'STALE_UNCONFIRMED', confirmed_at = now() - interval '60 days' WHERE"
                        + " id = ?",
                UUID.fromString(id));
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/inventory/items/" + id, uid, null, 200)
                                .path("freshness")
                                .path("label")
                                .asString())
                .isEqualTo("Updated 2 months ago");
        JsonNode confirmed =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/inventory/items/" + id + "/confirm",
                        uid,
                        null,
                        200);
        assertThat(confirmed.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(confirmed.path("freshness").path("label").asString())
                .isEqualTo("Updated just now");
        assertThat(
                        testUsers.query(
                                "SELECT event FROM inventory_freshness_event WHERE item_id = ?",
                                UUID.fromString(id)))
                .extracting(row -> row.get("event"))
                .containsExactly("RESTORED");
    }

    private JsonNode upload(
            String uid, String uri, byte[] content, MediaType type, int expectedStatus) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(content) {
                            @Override
                            public String getFilename() {
                                return "photo.bin";
                            }
                        })
                .contentType(type);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(uri)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value())
                .as(
                        "upload -> %s",
                        result.getResponseBody() == null
                                ? ""
                                : new String(result.getResponseBody()))
                .isEqualTo(expectedStatus);
        return json(result);
    }
}
