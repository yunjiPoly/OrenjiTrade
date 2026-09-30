package com.orenjitrade.api.analytics;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.analytics.domain.ActorHasher;
import com.orenjitrade.api.analytics.domain.AnalyticsPublisher;
import com.orenjitrade.api.analytics.infra.LogAnalyticsTransport;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Minimal analytics (Phase 12 readiness): the Phase 4 flows emit {@code search_performed}, {@code
 * search_no_results}, {@code collector_viewed}, {@code binder_viewed} and {@code card_viewed}
 * through the default log transport, schema-versioned, and no emitted event carries a coordinate,
 * an e-mail address, a raw account id or a handle.
 */
@ExtendWith(OutputCaptureExtension.class)
class AnalyticsIT extends AbstractIntegrationTest {

    /** A number with 3 or more decimals (a coordinate) anywhere in an event line. */
    static final Pattern DECIMAL = Pattern.compile("\\d+\\.\\d{2,}");

    /** Anything that looks like an e-mail address. */
    static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[a-z]{2,}");

    static final Set<String> TYPES =
            Set.of(
                    "search_performed",
                    "search_no_results",
                    "collector_viewed",
                    "binder_viewed",
                    "card_viewed");

    @Autowired private CatalogImportService importService;
    @Autowired private AnalyticsPublisher publisher;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
    }

    @Test
    void phase4FlowsEmitPrivacySafeEvents(CapturedOutput output) throws InterruptedException {
        assertThat(publisher.transportName()).as("log transport by default").isEqualTo("log");
        UUID printingId = InventoryTestSupport.printing(testUsers, "ygo-p006a");
        String code =
                testUsers
                        .query("SELECT printing_code FROM card_printing WHERE id = ?", printingId)
                        .get(0)
                        .get("printing_code")
                        .toString();
        UUID cardId =
                (UUID)
                        testUsers
                                .query("SELECT card_id FROM card_printing WHERE id = ?", printingId)
                                .get(0)
                                .get("card_id");
        double lat = 12.34567;
        double lng = 101.23456;

        String owner = uniqueUid("ana-owner");
        UUID ownerId = provisionCompliant(owner);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                owner,
                privacy(true, "MEMBERS"),
                200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                owner,
                Map.of("lat", lat + 0.01, "lng", lng, "radiusKm", 5),
                200);
        String handle = me(owner).path("handle").asString();
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner,
                                binder("Analytics", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> body = item(printingId);
        body.put("binderId", binderId);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", owner, body, 201);

        String viewer = uniqueUid("ana-viewer");
        UUID viewerId = provisionCompliant(viewer);
        String viewerEmail = me(viewer).path("email").asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer,
                Map.of("lat", lat, "lng", lng, "radiusKm", 5),
                200);

        String centre = "lat=" + lat + "&lng=" + lng;
        Instant start = Instant.now();
        // search_no_results: an e-mail address and a coordinate typed into the search box.
        get(viewer, "/api/v1/search?q={q}&" + centre, viewerEmail + " 45.52341 -73.58127");
        // search_performed with a resolved printing and holders.
        get(viewer, "/api/v1/search?q={q}", code);
        get(null, "/api/v1/search/card-holders?printingId={id}&" + centre, printingId);
        get(viewer, "/api/v1/collectors/nearby?query={q}&" + centre, handle);
        // collector_viewed (profile and preview), binder_viewed, card_viewed.
        get(viewer, "/api/v1/collectors/{handle}", handle);
        get(null, "/api/v1/collectors/{handle}/preview?" + centre, handle);
        get(viewer, "/api/v1/public/binders/{id}", binderId);
        get(null, "/api/v1/cards/{id}", cardId);
        get(viewer, "/api/v1/printings/{id}", printingId);

        List<JsonNode> events = awaitEvents(output, start);
        Set<String> types = new HashSet<>();
        events.forEach(event -> types.add(event.path("event_type").asString()));
        assertThat(types).containsAll(TYPES);

        ActorHasher hasher = publisher.actorHasher();
        String viewerHash = hasher.hash(viewerId);
        boolean sawViewer = false;
        for (JsonNode event : events) {
            // Everything but the timestamp (whose fraction of a second looks like a decimal).
            ObjectNode checked = (ObjectNode) event.deepCopy();
            checked.remove("occurred_at");
            String text = checked.toString();
            assertThat(event.path("event_id").asString()).isNotBlank();
            assertThat(event.path("event_version").asInt()).isEqualTo(1);
            assertThat(event.path("occurred_at").asString()).isNotBlank();
            assertThat(event.has("payload")).isTrue();
            assertThat(text)
                    .as("no coordinate, e-mail, raw id or handle in %s", text)
                    .doesNotContain("\"lat\"")
                    .doesNotContain("\"lng\"")
                    .doesNotContain("12.34")
                    .doesNotContain("101.23")
                    .doesNotContain("45.52341")
                    .doesNotContain("73.58127")
                    .doesNotContain(viewerId.toString())
                    .doesNotContain(ownerId.toString())
                    .doesNotContain(viewerEmail);
            if (!event.path("event_type").asString().startsWith("search_")) {
                assertThat(text).as("views carry hashes, not handles").doesNotContain(handle);
            }
            assertThat(DECIMAL.matcher(text).find()).as("decimal number in %s", text).isFalse();
            assertThat(EMAIL.matcher(text).find()).as("e-mail in %s", text).isFalse();
            if (!event.path("geo_cell").isNull()) {
                assertThat(event.path("geo_cell").asString()).matches("r-?\\d+c-?\\d+");
            }
            if (viewerHash.equals(event.path("actor_hash").asString())) {
                sawViewer = true;
            }
        }
        assertThat(sawViewer).as("the viewer's events carry the actor hash").isTrue();

        JsonNode noResults = first(events, "search_no_results");
        assertThat(noResults.path("payload").path("query").asString())
                .contains("[email]")
                .contains("[number]");
        assertThat(noResults.path("payload").path("surface").asString()).isEqualTo("search");
        assertThat(noResults.path("geo_cell").asString()).isNotBlank();
        JsonNode holders = firstWhere(events, "search_performed", "card_holders");
        assertThat(holders.path("payload").path("result_count").asLong()).isEqualTo(1);
        assertThat(holders.path("actor_hash").isNull()).isTrue();
        JsonNode binderViewed = first(events, "binder_viewed");
        assertThat(binderViewed.path("payload").path("binder_id").asString()).isEqualTo(binderId);
        assertThat(binderViewed.path("payload").path("owner_hash").asString())
                .isEqualTo(hasher.hash(ownerId));
        JsonNode cardViewed = first(events, "card_viewed");
        assertThat(cardViewed.path("payload").path("card_id").asString())
                .isEqualTo(cardId.toString());
    }

    @Test
    void phase5MessagesAndPostsEmitEventsWithoutText(CapturedOutput output)
            throws InterruptedException {
        Instant start = Instant.now().minusSeconds(1);
        String sender = uniqueUid("an-sender");
        String recipient = uniqueUid("an-recipient");
        UUID senderId = provisionCompliant(sender);
        UUID recipientId = provisionCompliant(recipient);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                recipient,
                Map.of(
                        "discoverable", false,
                        "showDistance", true,
                        "showOnlineStatus", false,
                        "showLastActive", true,
                        "profileVisibility", "MEMBERS",
                        "messagingPermission", "EVERYONE",
                        "wishlistVisible", false,
                        "searchDiscoverable", true),
                200);
        String conversationId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                sender,
                                Map.of("recipientId", recipientId.toString()),
                                201)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                sender,
                Map.of("kind", "TEXT", "body", "Secret meeting spot at the library"),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/community/channels/general/posts",
                sender,
                Map.of("body", "Public question about card sleeves " + UUID.randomUUID()),
                201);

        ActorHasher actorHasher = publisher.actorHasher();
        String senderHash = actorHasher.hash(senderId);
        Instant deadline = Instant.now().plus(Duration.ofSeconds(15));
        List<JsonNode> mine = List.of();
        while (Instant.now().isBefore(deadline)) {
            mine =
                    parse(output.getAll(), start).stream()
                            .filter(event -> senderHash.equals(event.path("actor_hash").asString()))
                            .toList();
            Set<String> types = new HashSet<>();
            mine.forEach(event -> types.add(event.path("event_type").asString()));
            if (types.containsAll(Set.of("message_sent", "community_post_created"))) {
                break;
            }
            Thread.sleep(200);
        }
        JsonNode sent = first(mine, "message_sent");
        assertThat(sent.path("payload").path("kind").asString()).isEqualTo("TEXT");
        assertThat(sent.path("payload").path("recipient_hash").asString())
                .isEqualTo(actorHasher.hash(recipientId));
        JsonNode posted = first(mine, "community_post_created");
        assertThat(posted.path("payload").path("channel").asString()).isEqualTo("general");
        for (JsonNode event : mine) {
            assertThat(event.toString())
                    .doesNotContain("Secret meeting")
                    .doesNotContain("card sleeves")
                    .doesNotContain(senderId.toString())
                    .doesNotContain(recipientId.toString())
                    .doesNotContain(conversationId);
        }
    }

    private void get(String uid, String template, Object... variables) {
        var spec = http.get().uri(template, variables);
        if (uid != null) {
            spec = spec.header(HttpHeaders.AUTHORIZATION, bearer(uid));
        }
        var result = spec.exchange().expectBody().returnResult();
        assertThat(result.getStatus().value())
                .as(
                        "GET %s -> %s",
                        template,
                        result.getResponseBody() == null
                                ? ""
                                : new String(result.getResponseBody(), StandardCharsets.UTF_8))
                .isEqualTo(200);
    }

    /** Analytics lines logged since the test started, waiting for the asynchronous transport. */
    private List<JsonNode> awaitEvents(CapturedOutput output, Instant start)
            throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(15));
        List<JsonNode> events = List.of();
        while (Instant.now().isBefore(deadline)) {
            events = parse(output.getAll(), start);
            Set<String> types = new HashSet<>();
            events.forEach(event -> types.add(event.path("event_type").asString()));
            if (types.containsAll(TYPES)
                    && events.stream()
                                    .filter(
                                            e ->
                                                    "card_viewed"
                                                            .equals(
                                                                    e.path("event_type")
                                                                            .asString()))
                                    .count()
                            >= 2) {
                return events;
            }
            Thread.sleep(200);
        }
        return events;
    }

    private List<JsonNode> parse(String logs, Instant start) {
        List<JsonNode> events = new ArrayList<>();
        for (String line : logs.split("\\R")) {
            int index = line.indexOf(LogAnalyticsTransport.PREFIX + "{");
            if (index < 0) {
                continue;
            }
            JsonNode event =
                    jsonMapper.readTree(
                            line.substring(index + LogAnalyticsTransport.PREFIX.length()));
            if (!Instant.parse(event.path("occurred_at").asString()).isBefore(start)) {
                events.add(event);
            }
        }
        return events;
    }

    private static JsonNode first(List<JsonNode> events, String type) {
        return events.stream()
                .filter(event -> type.equals(event.path("event_type").asString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no " + type + " event"));
    }

    private static JsonNode firstWhere(List<JsonNode> events, String type, String surface) {
        return events.stream()
                .filter(event -> type.equals(event.path("event_type").asString()))
                .filter(event -> surface.equals(event.path("payload").path("surface").asString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no " + type + " event for " + surface));
    }
}
