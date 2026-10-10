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
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
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
    @Autowired private InteractionService interactionService;

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
        String ownerCity = InventoryTestSupport.token() + "ville";

        String owner = uniqueUid("ana-owner");
        UUID ownerId = provisionCompliant(owner);
        setLocation(owner, "CA", "CA-PE", ownerCity);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                owner,
                privacy(true, "MEMBERS"),
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
        setLocation(viewer, "CA", "CA-NS", null);

        String region = "region=americas-north";
        Instant start = Instant.now();
        // search_no_results: an e-mail address and a coordinate typed into the search box.
        get(viewer, "/api/v1/search?q={q}&" + region, viewerEmail + " 45.52341 -73.58127");
        // search_performed with a resolved printing and holders.
        get(viewer, "/api/v1/search?q={q}", code);
        get(null, "/api/v1/search/card-holders?printingId={id}&" + region, printingId);
        // search_performed of the map: the binders of a state/province.
        get(null, "/api/v1/regions/americas-north/subdivisions/{code}/binders", "CA-PE");
        // collector_viewed (profile), binder_viewed, card_viewed.
        get(viewer, "/api/v1/collectors/{handle}", handle);
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
                    .doesNotContain(ownerCity)
                    .doesNotContain("distance")
                    .doesNotContain("radius")
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
            assertThat(event.has("geo_cell")).isFalse();
            assertThat(event.has("region_label")).isFalse();
            if (!event.path("region_code").isNull()) {
                assertThat(event.path("region_code").asString()).matches("[a-z]+(-[a-z]+)*");
            }
            if (!event.path("subdivision_code").isNull()) {
                assertThat(event.path("subdivision_code").asString())
                        .matches("[A-Z]{2}(-[A-Z0-9]{1,3})?");
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
        assertThat(noResults.path("region_code").asString()).isEqualTo("americas-north");
        JsonNode holders = firstWhere(events, "search_performed", "card_holders");
        assertThat(holders.path("payload").path("result_count").asLong()).isPositive();
        assertThat(holders.path("region_code").asString()).isEqualTo("americas-north");
        JsonNode map = firstWhere(events, "search_performed", "map");
        assertThat(map.path("subdivision_code").asString()).isEqualTo("CA-PE");
        JsonNode profileViewed = first(events, "collector_viewed");
        assertThat(profileViewed.path("region_code").asString()).isEqualTo("americas-north");
        assertThat(profileViewed.path("subdivision_code").asString()).isEqualTo("CA-PE");
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

    @Test
    void phase6WishlistEventsCarryNoNotesIdsOrCoordinates(CapturedOutput output)
            throws InterruptedException {
        Instant start = Instant.now().minusSeconds(1);
        UUID printingId = InventoryTestSupport.isolatedCard(testUsers, "ygo-p001a").printingId();
        String wisher = uniqueUid("an-wisher");
        UUID wisherId = provisionCompliant(wisher);
        String seller = uniqueUid("an-seller");
        UUID sellerId = provisionCompliant(seller);
        for (String uid : List.of(wisher, seller)) {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/me/settings/privacy",
                    uid,
                    privacy(true, "MEMBERS"),
                    200);
        }
        setLocation(seller, "MX", "MX-YUC", null);
        Map<String, Object> wish = new java.util.LinkedHashMap<>();
        wish.put("printingId", printingId.toString());
        wish.put("note", "Public wish note");
        wish.put("nearMintOnly", true);
        wish.put("priceTerm", "85% TCG");
        String wishId =
                callJson(HttpMethod.POST, "/api/v1/wishlist", wisher, wish, 201)
                        .path("id")
                        .asString();
        Map<String, Object> listed = item(printingId);
        listed.put("visibility", "PUBLIC");
        listed.put("notes", "Secret seller note");
        String itemId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", seller, listed, 201)
                        .path("id")
                        .asString();

        ActorHasher actorHasher = publisher.actorHasher();
        String wisherHash = actorHasher.hash(wisherId);
        Instant deadline = Instant.now().plus(Duration.ofSeconds(20));
        List<JsonNode> mine = List.of();
        while (Instant.now().isBefore(deadline)) {
            mine =
                    parse(output.getAll(), start).stream()
                            .filter(event -> wisherHash.equals(event.path("actor_hash").asString()))
                            .toList();
            Set<String> types = new HashSet<>();
            mine.forEach(event -> types.add(event.path("event_type").asString()));
            if (types.contains("wishlist_item_created")) {
                break;
            }
            Thread.sleep(200);
        }
        JsonNode created = first(mine, "wishlist_item_created");
        assertThat(created.path("payload").path("game").asString()).isEqualTo("yugioh");
        assertThat(created.path("payload").path("target").asString()).isEqualTo("printing");
        assertThat(created.path("payload").path("near_mint_only").asBoolean()).isTrue();
        assertThat(created.path("payload").path("has_price_term").asBoolean()).isTrue();
        assertThat(created.path("payload").has("has_max_price")).isFalse();
        // The matches feature and its analytics are gone (stage S2): no wishlist_matched event.
        assertThat(mine.stream().map(event -> event.path("event_type").asString()))
                .doesNotContain("wishlist_matched");
        for (JsonNode event : mine) {
            ObjectNode checked = (ObjectNode) event.deepCopy();
            checked.remove("occurred_at");
            String text = checked.toString();
            assertThat(text)
                    .doesNotContain("Public wish note")
                    .doesNotContain("Secret seller note")
                    .doesNotContain(wisherId.toString())
                    .doesNotContain(sellerId.toString())
                    .doesNotContain(wishId)
                    .doesNotContain(itemId)
                    .doesNotContain("\"lat\"")
                    .doesNotContain("21.37")
                    .doesNotContain("55.53");
            assertThat(DECIMAL.matcher(text).find()).as("decimal number in %s", text).isFalse();
        }
    }

    @Test
    void phase7RatingAndReportEventsCarryNoIdsOrText(CapturedOutput output)
            throws InterruptedException {
        Instant start = Instant.now().minusSeconds(1);
        String rater = uniqueUid("an-rater");
        UUID raterId = provisionCompliant(rater);
        String ratee = uniqueUid("an-ratee");
        UUID rateeId = provisionCompliant(ratee);
        UUID interactionId =
                interactionService
                        .record(
                                InteractionKind.TRADE,
                                raterId,
                                rateeId,
                                InteractionKind.TRADE.subjectType(),
                                UUID.randomUUID())
                        .id();
        Map<String, Object> rating = new java.util.LinkedHashMap<>();
        rating.put("interactionId", interactionId.toString());
        rating.put("overall", 4);
        rating.put("comment", "Secret rating comment");
        String ratingId =
                callJson(HttpMethod.POST, "/api/v1/ratings", rater, rating, 201)
                        .path("id")
                        .asString();
        Map<String, Object> report = new java.util.LinkedHashMap<>();
        report.put("reportedUserId", rateeId.toString());
        report.put("reason", "MISLEADING_LISTINGS");
        report.put("details", "Secret report details");
        String reportId =
                callJson(HttpMethod.POST, "/api/v1/reports/collectors", rater, report, 201)
                        .path("id")
                        .asString();

        String raterHash = publisher.actorHasher().hash(raterId);
        Instant deadline = Instant.now().plus(Duration.ofSeconds(20));
        List<JsonNode> mine = List.of();
        while (Instant.now().isBefore(deadline)) {
            mine =
                    parse(output.getAll(), start).stream()
                            .filter(event -> raterHash.equals(event.path("actor_hash").asString()))
                            .toList();
            Set<String> types = new HashSet<>();
            mine.forEach(event -> types.add(event.path("event_type").asString()));
            if (types.containsAll(Set.of("rating_submitted", "collector_reported"))) {
                break;
            }
            Thread.sleep(200);
        }
        JsonNode rated = first(mine, "rating_submitted");
        assertThat(rated.path("payload").path("interaction_kind").asString()).isEqualTo("TRADE");
        assertThat(rated.path("payload").path("overall").asInt()).isEqualTo(4);
        assertThat(rated.path("payload").path("has_comment").asBoolean()).isTrue();
        assertThat(rated.path("payload").path("ratee_hash").asString())
                .isEqualTo(publisher.actorHasher().hash(rateeId));
        JsonNode reported = first(mine, "collector_reported");
        assertThat(reported.path("payload").path("reason").asString())
                .isEqualTo("MISLEADING_LISTINGS");
        assertThat(reported.path("payload").path("context_source").asString()).isEqualTo("PROFILE");
        for (JsonNode event : mine) {
            ObjectNode checked = (ObjectNode) event.deepCopy();
            checked.remove("occurred_at");
            String text = checked.toString();
            assertThat(text)
                    .doesNotContain("Secret rating comment")
                    .doesNotContain("Secret report details")
                    .doesNotContain(raterId.toString())
                    .doesNotContain(rateeId.toString())
                    .doesNotContain(ratingId)
                    .doesNotContain(reportId)
                    .doesNotContain(interactionId.toString());
            assertThat(DECIMAL.matcher(text).find()).as("decimal number in %s", text).isFalse();
        }
    }

    @Test
    void phase8OfferAndTradeEventsCarryNoAmountsIdsOrText(CapturedOutput output)
            throws InterruptedException {
        Instant start = Instant.now().minusSeconds(1);
        UUID printingId = InventoryTestSupport.printing(testUsers, "ygo-p001a");
        String seller = uniqueUid("an-offer-seller");
        UUID sellerId = provisionCompliant(seller);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                seller,
                privacy(true, "MEMBERS"),
                200);
        Map<String, Object> listed = item(printingId);
        listed.put("visibility", "PUBLIC");
        listed.put("availability", "SALE");
        listed.put("acceptsOffers", true);
        listed.put("notes", "Secret seller note");
        String itemId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", seller, listed, 201)
                        .path("id")
                        .asString();
        String buyer = uniqueUid("an-offer-buyer");
        UUID buyerId = provisionCompliant(buyer);
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("itemId", itemId);
        body.put("cashAmount", new java.math.BigDecimal("40.00"));
        body.put("message", "Secret offer message");
        String offerId =
                callJson(HttpMethod.POST, "/api/v1/offers", buyer, body, 201).path("id").asString();
        String tradeId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/offers/" + offerId + "/accept",
                                seller,
                                null,
                                200)
                        .path("tradeId")
                        .asString();
        callJson(HttpMethod.POST, "/api/v1/trades/" + tradeId + "/complete", buyer, null, 200);
        callJson(HttpMethod.POST, "/api/v1/trades/" + tradeId + "/complete", seller, null, 200);

        ActorHasher actorHasher = publisher.actorHasher();
        Set<String> hashes = Set.of(actorHasher.hash(buyerId), actorHasher.hash(sellerId));
        Instant deadline = Instant.now().plus(Duration.ofSeconds(20));
        List<JsonNode> mine = List.of();
        while (Instant.now().isBefore(deadline)) {
            mine =
                    parse(output.getAll(), start).stream()
                            .filter(event -> hashes.contains(event.path("actor_hash").asString()))
                            .toList();
            long trades =
                    mine.stream()
                            .filter(
                                    event ->
                                            "trade_status_changed"
                                                    .equals(event.path("event_type").asString()))
                            .count();
            Set<String> types = new HashSet<>();
            mine.forEach(event -> types.add(event.path("event_type").asString()));
            if (types.containsAll(Set.of("offer_created", "offer_status_changed")) && trades >= 3) {
                break;
            }
            Thread.sleep(200);
        }
        JsonNode created = first(mine, "offer_created");
        assertThat(created.path("actor_hash").asString()).isEqualTo(actorHasher.hash(buyerId));
        assertThat(created.path("payload").path("kind").asString()).isEqualTo("CASH");
        assertThat(created.path("payload").path("game").asString()).isEqualTo("yugioh");
        assertThat(created.path("payload").path("has_message").asBoolean()).isTrue();
        assertThat(created.path("payload").path("seller_hash").asString())
                .isEqualTo(actorHasher.hash(sellerId));
        JsonNode accepted = first(mine, "offer_status_changed");
        assertThat(accepted.path("payload").path("event").asString()).isEqualTo("ACCEPTED");
        assertThat(accepted.path("payload").path("round").asInt()).isEqualTo(1);
        List<String> tradeEvents = new ArrayList<>();
        mine.stream()
                .filter(event -> "trade_status_changed".equals(event.path("event_type").asString()))
                .forEach(event -> tradeEvents.add(event.path("payload").path("event").asString()));
        assertThat(tradeEvents).contains("CREATED", "COMPLETION_CONFIRMED", "COMPLETED");
        for (JsonNode event : mine) {
            ObjectNode checked = (ObjectNode) event.deepCopy();
            checked.remove("occurred_at");
            String text = checked.toString();
            assertThat(text)
                    .doesNotContain("Secret offer message")
                    .doesNotContain("Secret seller note")
                    .doesNotContain(buyerId.toString())
                    .doesNotContain(sellerId.toString())
                    .doesNotContain(offerId)
                    .doesNotContain(tradeId)
                    .doesNotContain(itemId);
            assertThat(DECIMAL.matcher(text).find()).as("decimal number in %s", text).isFalse();
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
