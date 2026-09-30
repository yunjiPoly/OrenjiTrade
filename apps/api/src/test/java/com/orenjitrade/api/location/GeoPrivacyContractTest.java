package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * ADR 0004 contract test over the seeded collectors: every coordinate in a public or admin response
 * has at most 3 decimals and is the stored public point; trading-area centres and home points never
 * appear; nothing coordinate-like reaches the logs. Shares the seeded context with {@code
 * SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
@ExtendWith(OutputCaptureExtension.class)
class GeoPrivacyContractTest extends AbstractIntegrationTest {

    static final List<String> DISCOVERABLE =
            List.of(
                    "collector1",
                    "collector2",
                    "collector3",
                    "collector4",
                    "collector5",
                    "collector6",
                    "collector8",
                    "premium_user");

    static final List<String> NOT_DISCOVERABLE =
            List.of("collector7", "moderator", "admin", "superadmin");

    /** A longitude of the Montréal area with 3+ decimals, e.g. {@code -73.581}. */
    static final Pattern LONGITUDE_IN_LOGS = Pattern.compile("-7\\d\\.\\d{3,}");

    /** Seed admin token uid with its real email (so the login does not rewrite the seed email). */
    static final String SEED_ADMIN = "seed-admin:admin@orenjitrade.test";

    private UUID idOf(String handle) {
        return (UUID)
                testUsers
                        .query("SELECT id FROM user_account WHERE handle = ?", handle)
                        .get(0)
                        .get("id");
    }

    @Test
    void publicAndAdminResponsesOnlyEverCarryPublicPoints(CapturedOutput output) {
        String viewer = uniqueUid("geo-viewer");
        UUID viewerId = provisionCompliant(viewer);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer,
                Map.of("lat", 45.51739, "lng", -73.58914, "radiusKm", 10),
                200);

        for (String handle : DISCOVERABLE) {
            UUID id = idOf(handle);
            Map<String, Object> stored = testUsers.locationOf(id);
            assertThat(stored).as("seeded location of %s", handle).isNotEmpty();
            double publicLat = ((Number) stored.get("public_lat")).doubleValue();
            double publicLng = ((Number) stored.get("public_lng")).doubleValue();

            JsonNode profile =
                    callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 200);
            assertOnlyPublicPrecision(profile, handle);
            List<double[]> points = coordinatePairs(profile);
            assertThat(points).as("%s exposes exactly its stored public point", handle).hasSize(1);
            assertThat(points.get(0)[0]).isEqualTo(publicLat);
            assertThat(points.get(0)[1]).isEqualTo(publicLng);
            assertThat(profile.path("location").path("publicLabel").asString())
                    .isEqualTo(stored.get("public_label"));
            assertThat(profile.path("location").path("distanceBucket").asString()).isNotBlank();
            assertNoPrivateLocationKeys(profile, handle);
        }

        for (String handle : NOT_DISCOVERABLE) {
            JsonNode profile =
                    callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 200);
            assertThat(profile.path("location").isNull()).as(handle).isTrue();
            assertThat(coordinatePairs(profile)).isEmpty();
            assertThat(testUsers.locationOf(idOf(handle)).get("public_lat"))
                    .as("ADR 0004: no public point while not discoverable")
                    .isNull();
        }

        List<String> everyone = new ArrayList<>(DISCOVERABLE);
        everyone.addAll(NOT_DISCOVERABLE);
        for (String handle : everyone) {
            UUID id = idOf(handle);
            JsonNode detail =
                    callJson(HttpMethod.GET, "/api/v1/admin/users/" + id, SEED_ADMIN, null, 200);
            assertOnlyPublicPrecision(detail, handle);
            assertThat(coordinatePairs(detail)).as("admin detail of %s", handle).isEmpty();
            assertNoPrivateLocationKeys(detail, handle);
            assertThat(detail.path("locationLabel").asString())
                    .isEqualTo(testUsers.locationOf(id).get("public_label"));
        }

        // The viewer's own public profile never shows their centre either.
        JsonNode self =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + me(viewer).path("handle").asString(),
                        viewer,
                        null,
                        200);
        assertThat(self.toString()).doesNotContain("45.51739").doesNotContain("45.517,");
        assertThat(testUsers.locationOf(viewerId)).isNotEmpty();

        String logs = output.getAll();
        assertThat(logs).doesNotContain("45.51739").doesNotContain("-73.58914");
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    /**
     * Phase 3 public listings of the seeded collectors (binders, binder items, collector
     * inventory), anonymous and signed in: no coordinate at all (the owner block carries a label
     * and a distance bucket only), every number with at most 3 decimals, no private location keys
     * and never the private item notes.
     */
    @Test
    void publicListingsNeverCarryCoordinatesOrPrivateNotes(CapturedOutput output) {
        String viewer = uniqueUid("geo-listings");
        provisionCompliant(viewer);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer,
                Map.of("lat", 45.51739, "lng", -73.58914, "radiusKm", 10),
                200);
        int publicBinders = 0;
        for (String handle : DISCOVERABLE) {
            for (String caller : java.util.Arrays.asList(null, viewer)) {
                JsonNode binders =
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/collectors/" + handle + "/binders",
                                caller,
                                null,
                                200);
                assertPublicListing(binders, handle);
                JsonNode inventory =
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/collectors/" + handle + "/inventory?size=100",
                                caller,
                                null,
                                200);
                assertPublicListing(inventory, handle);
                for (JsonNode binder : binders) {
                    String id = binder.path("id").asString();
                    JsonNode detail =
                            callJson(
                                    HttpMethod.GET,
                                    "/api/v1/public/binders/" + id,
                                    caller,
                                    null,
                                    200);
                    assertPublicListing(detail, handle);
                    assertThat(detail.path("owner").has("publicPoint")).isFalse();
                    assertThat(detail.path("owner").path("location").path("publicLabel").asString())
                            .isEqualTo(testUsers.locationOf(idOf(handle)).get("public_label"));
                    assertPublicListing(
                            callJson(
                                    HttpMethod.GET,
                                    "/api/v1/public/binders/" + id + "/items?size=100",
                                    caller,
                                    null,
                                    200),
                            handle);
                    publicBinders++;
                }
            }
        }
        assertThat(publicBinders).as("seeded public binders were checked").isPositive();
        // The private-only collector exposes nothing.
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/collector7/inventory",
                                        viewer,
                                        null,
                                        200)
                                .path("totalItems")
                                .asLong())
                .isZero();
        String logs = output.getAll();
        assertThat(logs).doesNotContain("45.51739").doesNotContain("-73.58914");
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    /**
     * Phase 4 map discovery and search (nearby, preview, unified search, card holders, suggest),
     * anonymous and signed in: every coordinate pair is either the snapped search centre (2
     * decimals, never the stored centre of the viewer) or the stored public point of the collector
     * it describes; every number has at most 3 decimals; no private location keys, no private
     * notes; non-discoverable collectors never appear; signed-out callers get no distance buckets;
     * logs stay free of coordinates.
     */
    @Test
    void mapAndSearchResponsesOnlyEverCarryPublicPoints(CapturedOutput output) {
        String viewer = uniqueUid("geo-map");
        provisionCompliant(viewer);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer,
                Map.of("lat", 45.51739, "lng", -73.58914, "radiusKm", 10),
                200);
        UUID printingId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'ygo-p001a'")
                                .get(0)
                                .get("id");
        int markers = 0;
        for (String caller : java.util.Arrays.asList(null, viewer)) {
            boolean anonymous = caller == null;
            JsonNode nearby =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/collectors/nearby?lat=45.52&lng=-73.58&radiusKm=25",
                            caller,
                            null,
                            200);
            assertThat(nearby.path("center").path("lat").asDouble()).isEqualTo(45.52);
            assertThat(nearby.path("center").path("lng").asDouble()).isEqualTo(-73.58);
            markers += assertMarkersArePublicPoints(nearby.path("collectors"), anonymous);
            assertSearchDocument(nearby, "nearby");
            List<String> handles = new ArrayList<>();
            nearby.path("collectors")
                    .forEach(marker -> handles.add(marker.path("handle").asString()));
            assertThat(handles)
                    .contains("collector1")
                    .doesNotContainAnyElementsOf(NOT_DISCOVERABLE);

            JsonNode search =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/search?q=AZR-EN001&lat=45.52&lng=-73.58",
                            caller,
                            null,
                            200);
            assertThat(search.path("collectors").size()).isPositive();
            markers += assertMarkersArePublicPoints(search.path("collectors"), anonymous);
            assertSearchDocument(search, "search");
            JsonNode binders =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/search?q=binder&types=binders,collectors",
                            caller,
                            null,
                            200);
            assertThat(binders.path("binders").size()).isPositive();
            assertThat(coordinatePairs(binders.path("binders")))
                    .as("binder owners carry a label, never a point")
                    .isEmpty();
            assertSearchDocument(binders, "search binders");

            JsonNode holders =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/search/card-holders?printingId="
                                    + printingId
                                    + "&lat=45.52&lng=-73.58&radiusKm=25",
                            caller,
                            null,
                            200);
            assertThat(holders.path("totalItems").asLong()).isPositive();
            for (JsonNode row : holders.path("items")) {
                markers +=
                        assertMarkersArePublicPoints(
                                jsonMapper.createArrayNode().add(row.path("collector")), anonymous);
                assertThat(coordinatePairs(row.path("item"))).isEmpty();
            }
            assertSearchDocument(holders, "card holders");

            JsonNode suggest =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/search/suggest?q=collector&lat=45.52&lng=-73.58",
                            caller,
                            null,
                            200);
            assertThat(coordinatePairs(suggest)).isEmpty();
            assertSearchDocument(suggest, "suggest");

            for (String handle : DISCOVERABLE) {
                JsonNode preview =
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/collectors/" + handle + "/preview",
                                caller,
                                null,
                                200);
                markers +=
                        assertMarkersArePublicPoints(
                                jsonMapper.createArrayNode().add(preview), anonymous);
                assertSearchDocument(preview, handle);
            }
            for (String handle : NOT_DISCOVERABLE) {
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + handle + "/preview",
                        caller,
                        null,
                        404);
            }
        }
        assertThat(markers).as("markers were checked").isPositive();

        // Without lat/lng the trading area of the viewer is the centre, snapped to 0.01 degrees.
        JsonNode own = callJson(HttpMethod.GET, "/api/v1/collectors/nearby", viewer, null, 200);
        assertThat(own.path("center").path("lat").asDouble()).isEqualTo(45.52);
        assertThat(own.path("center").path("lng").asDouble()).isEqualTo(-73.59);
        assertThat(own.toString()).doesNotContain("45.51739").doesNotContain("-73.58914");
        assertMarkersArePublicPoints(own.path("collectors"), false);

        String logs = output.getAll();
        assertThat(logs).doesNotContain("45.51739").doesNotContain("-73.58914");
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    /**
     * The point of each marker is the stored public point of that collector; distance buckets are
     * absent for signed-out callers. Returns the number of markers checked.
     */
    private int assertMarkersArePublicPoints(JsonNode markers, boolean anonymous) {
        int count = 0;
        for (JsonNode marker : markers) {
            UUID id = UUID.fromString(marker.path("id").asString());
            Map<String, Object> stored = testUsers.locationOf(id);
            assertThat(stored.get("public_lat")).as("public point of %s", id).isNotNull();
            List<double[]> pairs = coordinatePairs(marker);
            assertThat(pairs).as("points of marker %s", id).hasSize(1);
            assertThat(pairs.get(0)[0])
                    .isEqualTo(((Number) stored.get("public_lat")).doubleValue());
            assertThat(pairs.get(0)[1])
                    .isEqualTo(((Number) stored.get("public_lng")).doubleValue());
            if (anonymous) {
                assertThat(marker.path("distanceBucket").isNull())
                        .as("no distance bucket for signed-out callers")
                        .isTrue();
            }
            count++;
        }
        return count;
    }

    /**
     * Phase 5 responses that carry other members (conversations, messages with card and binder
     * links, blocks, community channels, posts and replies) never carry a coordinate or a private
     * location key; the seeded conversation and posts are served as seeded.
     */
    @Test
    void messagingAndCommunityResponsesNeverCarryCoordinates(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String conversationId = "00000000-0000-4000-8d00-000000000001";

        JsonNode conversations =
                callJson(HttpMethod.GET, "/api/v1/conversations", collector1, null, 200);
        JsonNode seeded = null;
        for (JsonNode item : conversations.path("items")) {
            if (item.path("id").asString().equals(conversationId)) {
                seeded = item;
            }
        }
        assertThat(seeded).as("the seeded conversation of collector1").isNotNull();
        assertThat(seeded.path("other").path("handle").asString()).isEqualTo("collector2");
        assertThat(seeded.path("lastMessage").path("senderId").asString())
                .isEqualTo(idOf("collector1").toString());
        assertPublicListing(conversations, "conversations");

        JsonNode messages =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/conversations/" + conversationId + "/messages",
                        collector2,
                        null,
                        200);
        assertThat(messages.path("items")).hasSize(6);
        List<String> kinds = new ArrayList<>();
        messages.path("items").forEach(item -> kinds.add(item.path("kind").asString()));
        assertThat(kinds).contains("CARD_LINK", "BINDER_LINK", "TEXT");
        assertPublicListing(messages, "messages");
        JsonNode summary2 =
                callJson(HttpMethod.GET, "/api/v1/conversations", collector2, null, 200);
        for (JsonNode item : summary2.path("items")) {
            if (item.path("id").asString().equals(conversationId)) {
                assertThat(item.path("unreadCount").asInt()).isEqualTo(1);
            }
        }

        JsonNode channels =
                callJson(HttpMethod.GET, "/api/v1/community/channels", collector1, null, 200);
        assertPublicListing(channels, "channels");
        for (String slug : List.of("montreal-yugioh", "looking-for", "new-listings", "general")) {
            JsonNode posts =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/community/channels/" + slug + "/posts",
                            collector2,
                            null,
                            200);
            assertThat(posts.path("items")).as("seeded posts in %s", slug).isNotEmpty();
            assertPublicListing(posts, slug);
            for (JsonNode post : posts.path("items")) {
                assertPublicListing(
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/community/posts/"
                                        + post.path("id").asString()
                                        + "/replies",
                                collector2,
                                null,
                                200),
                        "replies");
            }
        }
        JsonNode blocks = callJson(HttpMethod.GET, "/api/v1/me/blocks", collector1, null, 200);
        assertPublicListing(blocks, "blocks");

        String logs = output.getAll();
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    /** At most 3 decimals, no private location keys, no private notes. */
    private static void assertSearchDocument(JsonNode document, String context) {
        assertOnlyPublicPrecision(document, context);
        assertThat(document.toString())
                .as("private data in %s", context)
                .doesNotContain("tradingArea")
                .doesNotContain("homePoint")
                .doesNotContain("home_point")
                .doesNotContain("trading_area")
                .doesNotContain("\"notes\"")
                .doesNotContain("Pulled at the spring locals")
                .doesNotContain("Grading candidate");
    }

    private static void assertPublicListing(JsonNode document, String handle) {
        assertOnlyPublicPrecision(document, handle);
        assertThat(coordinatePairs(document))
                .as("coordinates in a listing of %s", handle)
                .isEmpty();
        assertNoPrivateLocationKeys(document, handle);
        assertThat(document.toString())
                .as("private notes in a listing of %s", handle)
                .doesNotContain("\"notes\"")
                .doesNotContain("Grading candidate")
                .doesNotContain("Pulled at the spring locals");
    }

    private static void assertNoPrivateLocationKeys(JsonNode node, String handle) {
        String text = node.toString();
        assertThat(text)
                .as("private location keys in the response for %s", handle)
                .doesNotContain("tradingArea")
                .doesNotContain("radiusKm")
                .doesNotContain("homePoint")
                .doesNotContain("home_point")
                .doesNotContain("trading_area");
    }

    /** Every number in the document (not only lat/lng) has at most 3 decimals. */
    private static void assertOnlyPublicPrecision(JsonNode node, String context) {
        if (node.isNumber()) {
            assertThat(decimals(node.decimalValue()))
                    .as("numeric value %s in %s", node, context)
                    .isLessThanOrEqualTo(3);
            return;
        }
        for (JsonNode child : node) {
            assertOnlyPublicPrecision(child, context);
        }
    }

    /** Every object carrying numeric {@code lat} and {@code lng} members. */
    static List<double[]> coordinatePairs(JsonNode node) {
        List<double[]> pairs = new ArrayList<>();
        collect(node, pairs);
        return pairs;
    }

    private static void collect(JsonNode node, List<double[]> pairs) {
        if (node.isObject() && node.path("lat").isNumber() && node.path("lng").isNumber()) {
            pairs.add(new double[] {node.path("lat").asDouble(), node.path("lng").asDouble()});
        }
        for (JsonNode child : node) {
            collect(child, pairs);
        }
    }

    private static int decimals(BigDecimal value) {
        return Math.max(0, value.stripTrailingZeros().scale());
    }
}
