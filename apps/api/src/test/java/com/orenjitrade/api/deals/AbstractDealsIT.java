package com.orenjitrade.api.deals;

import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the stage R4 tests (chat subjects and Mark as sold): discoverable collectors with a
 * saved profile in Ontario (city Kingston, which must never reach the other collector), their cards
 * and deck cores, chats about them, sales and undos.
 */
abstract class AbstractDealsIT extends AbstractIntegrationTest {

    static final String SECRET = "r4-private-note-5b1e";
    static final String CITY = "Kingston";
    static final String ITEMS = "/api/v1/inventory/items";
    static final String BINDERS = "/api/v1/binders";
    static final String CONVERSATIONS = "/api/v1/conversations";

    @Autowired private CatalogImportService importService;

    /** A collector of these tests. */
    record Collector(String uid, UUID id, String handle) {}

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    /** A discoverable collector with a saved profile, in Ontario (city shown on their profile). */
    Collector collector(String prefix) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        setLocation(uid, "CA", "CA-ON", CITY);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", handle);
        profile.put("displayName", "Collector " + handle);
        profile.put("bio", "Ships with tracking");
        profile.put("games", java.util.List.of("yugioh"));
        profile.put("languages", java.util.List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                uid,
                InventoryTestSupport.privacy(true, "MEMBERS"),
                200);
        return new Collector(uid, id, handle);
    }

    /** A card of {@code owner} with its copies, price as typed and visibility; returns its id. */
    String card(Collector owner, int quantity, String visibility, @Nullable String price) {
        return card(owner, quantity, visibility, price, null);
    }

    String card(
            Collector owner,
            int quantity,
            String visibility,
            @Nullable String price,
            @Nullable String binderId) {
        Map<String, Object> body = InventoryTestSupport.item(printing(testUsers, "ygo-p001a"));
        body.put("quantity", quantity);
        body.put("visibility", visibility);
        body.put("notes", SECRET);
        if (price != null) {
            body.put("askingPriceText", price);
        }
        if (binderId != null) {
            body.put("binderId", binderId);
        }
        return callJson(HttpMethod.POST, ITEMS, owner.uid(), body, 201).path("id").asString();
    }

    /** A public deck core of {@code owner} holding one card; returns the binder id. */
    String deckCore(Collector owner, String name, String price) {
        Map<String, Object> body = InventoryTestSupport.binder(name, "PUBLIC");
        body.put("sellsAsCore", true);
        body.put("askingPriceText", price);
        body.put("description", "NM, English. " + SECRET);
        String id =
                callJson(HttpMethod.POST, BINDERS, owner.uid(), body, 201).path("id").asString();
        card(owner, 2, "PRIVATE", "$5", id);
        return id;
    }

    JsonNode item(Collector owner, String itemId, int expectedStatus) {
        return callJson(HttpMethod.GET, ITEMS + "/" + itemId, owner.uid(), null, expectedStatus);
    }

    /** {@code POST /conversations} with an optional subject. */
    JsonNode startAbout(
            Collector from,
            Collector to,
            @Nullable String itemId,
            @Nullable String binderId,
            int expectedStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("recipientId", to.id().toString());
        if (itemId != null) {
            body.put("subjectItemId", itemId);
        }
        if (binderId != null) {
            body.put("subjectBinderId", binderId);
        }
        return callJson(HttpMethod.POST, CONVERSATIONS, from.uid(), body, expectedStatus);
    }

    /** A chat {@code buyer} opened about {@code seller}'s public card; returns its id. */
    String chatAbout(Collector buyer, Collector seller, String itemId) {
        JsonNode started = startAbout(buyer, seller, itemId, null, 201);
        return started.path("id").asString();
    }

    JsonNode conversation(Collector member, String conversationId, int expectedStatus) {
        return callJson(
                HttpMethod.GET,
                CONVERSATIONS + "/" + conversationId,
                member.uid(),
                null,
                expectedStatus);
    }

    JsonNode messages(Collector member, String conversationId) {
        return callJson(
                HttpMethod.GET,
                CONVERSATIONS + "/" + conversationId + "/messages",
                member.uid(),
                null,
                200);
    }

    JsonNode sendText(Collector from, String conversationId, String text) {
        return callJson(
                HttpMethod.POST,
                CONVERSATIONS + "/" + conversationId + "/messages",
                from.uid(),
                Map.of("kind", "TEXT", "body", text),
                201);
    }

    /** {@code POST /conversations/{id}/sales}. */
    JsonNode markSold(
            Collector caller,
            String conversationId,
            @Nullable Integer quantity,
            @Nullable String tracking,
            int expectedStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (quantity != null) {
            body.put("quantity", quantity);
        }
        if (tracking != null) {
            body.put("trackingNumber", tracking);
        }
        return callJson(
                HttpMethod.POST,
                CONVERSATIONS + "/" + conversationId + "/sales",
                caller.uid(),
                body,
                expectedStatus);
    }

    JsonNode undo(Collector caller, String saleId, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/sales/" + saleId + "/undo",
                caller.uid(),
                null,
                expectedStatus);
    }

    /** The SYSTEM sale messages of a chat, as {@code member} reads it. */
    java.util.List<JsonNode> saleMessages(Collector member, String conversationId) {
        java.util.List<JsonNode> result = new java.util.ArrayList<>();
        for (JsonNode message : messages(member, conversationId).path("items")) {
            if ("SYSTEM".equals(message.path("kind").asString())
                    && message.path("payload").has("sale")) {
                result.add(message);
            }
        }
        return result;
    }

    /** The member's notifications of a type, newest first. */
    java.util.List<JsonNode> notifications(Collector member, String type) {
        java.util.List<JsonNode> result = new java.util.ArrayList<>();
        for (JsonNode notification :
                callJson(HttpMethod.GET, "/api/v1/notifications", member.uid(), null, 200)
                        .path("items")) {
            if (type.equals(notification.path("type").asString())) {
                result.add(notification);
            }
        }
        return result;
    }

    JsonNode eligibility(Collector rater, Collector other) {
        return callJson(
                HttpMethod.GET,
                "/api/v1/ratings/eligibility?userId=" + other.id(),
                rater.uid(),
                null,
                200);
    }

    /** The interaction id of the SALE interactions {@code rater} can rate {@code other} for. */
    java.util.List<String> saleInteractions(Collector rater, Collector other) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        for (JsonNode interaction : eligibility(rater, other).path("interactions")) {
            if ("SALE".equals(interaction.path("kind").asString())) {
                ids.add(interaction.path("id").asString());
            }
        }
        return ids;
    }

    /** Uploads a PNG photo to a binder. */
    JsonNode binderPhoto(Collector owner, String binderId) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(InventoryTestSupport.png(40, 56)) {
                            @Override
                            public String getFilename() {
                                return "core.png";
                            }
                        })
                .contentType(MediaType.IMAGE_PNG);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(BINDERS + "/" + binderId + "/images")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner.uid()))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        byte[] bytes = result.getResponseBody();
        assertThat(result.getStatus().value())
                .as("photo -> %s", bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8))
                .isEqualTo(201);
        return json(result);
    }

    /** No private note, no city, no coordinate in a document another collector reads. */
    static void assertNoPrivateData(JsonNode document) {
        String text = document.toString();
        assertThat(text).doesNotContain(SECRET);
        assertThat(text).doesNotContain(CITY);
        assertThat(text).doesNotContain("\"lat\"").doesNotContain("\"lng\"");
        assertThat(text).doesNotContain("\"latitude\"").doesNotContain("\"longitude\"");
        assertThat(text).doesNotContain("distance");
    }
}
