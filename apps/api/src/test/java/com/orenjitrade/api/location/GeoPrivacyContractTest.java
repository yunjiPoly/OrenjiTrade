package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired private FeatureFlags featureFlags;

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

    /**
     * Phase 6: the seeded wishlist of collector2 (items, matches with collector1's listing, public
     * summary) and the notification centre never carry a trading-area centre; a match's only point
     * is the item owner's stored public point with at most 3 decimals and its distance is a bucket;
     * public items never show private notes.
     */
    @Test
    void wishlistAndNotificationResponsesOnlyCarryPublicPoints(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String azureWish = "00000000-0000-4000-8f00-000000000201";
        String azureItem = "00000000-0000-4000-8c00-000000010101";

        JsonNode wishlist = callJson(HttpMethod.GET, "/api/v1/wishlist", collector2, null, 200);
        assertThat(wishlist).hasSizeGreaterThanOrEqualTo(3);
        assertOnlyPublicPrecision(wishlist, "wishlist");
        assertThat(coordinatePairs(wishlist)).as("wishlist items carry no point").isEmpty();
        assertThat(wishlist.toString())
                .doesNotContain("tradingArea")
                .doesNotContain("homePoint")
                .doesNotContain("home_point");

        int markers = 0;
        boolean sawSeededMatch = false;
        for (JsonNode item : wishlist) {
            JsonNode matches =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/wishlist/" + item.path("id").asString() + "/matches",
                            collector2,
                            null,
                            200);
            assertSearchDocument(matches, "matches");
            var collectors = jsonMapper.createArrayNode();
            for (JsonNode match : matches.path("items")) {
                collectors.add(match.path("collector"));
                assertThat(match.path("distanceBucket").asString()).isNotBlank();
                assertThat(coordinatePairs(match.path("item"))).isEmpty();
                if (azureWish.equals(item.path("id").asString())
                        && azureItem.equals(match.path("item").path("id").asString())) {
                    sawSeededMatch = true;
                    assertThat(match.path("collector").path("handle").asString())
                            .isEqualTo("collector1");
                }
            }
            markers += assertMarkersArePublicPoints(collectors, false);
        }
        assertThat(sawSeededMatch).as("collector1's Azure-Eyes matches collector2's wish").isTrue();
        assertThat(markers).isPositive();

        JsonNode summary =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/collector2/wishlist",
                        collector1,
                        null,
                        200);
        assertThat(summary).isNotEmpty();
        assertPublicListing(summary, "public wishlist");

        JsonNode notifications =
                callJson(HttpMethod.GET, "/api/v1/notifications?limit=50", collector2, null, 200);
        assertPublicListing(notifications, "notifications");
        boolean sawMatchNotification = false;
        for (JsonNode notification : notifications.path("items")) {
            if ("WISHLIST_MATCH".equals(notification.path("type").asString())
                    && azureItem.equals(
                            notification.path("data").path("inventoryItemId").asString())) {
                sawMatchNotification = true;
                assertThat(notification.path("body").asString()).contains("km away");
            }
        }
        assertThat(sawMatchNotification).as("the seeded match notified collector2").isTrue();
        assertPublicListing(
                callJson(HttpMethod.GET, "/api/v1/notifications", collector1, null, 200),
                "notifications of collector1");

        String logs = output.getAll();
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    /**
     * Phase 7: ratings, references, reports, listing status and every admin console response
     * (report detail with history, users' history, stale and admin listings, binders, dashboard,
     * notification statistics, analytics summary, system health) carry no coordinates, at most 3
     * decimals and no private notes; the logs stay free of coordinates.
     */
    @Test
    void ratingsReportsAndAdminConsoleResponsesNeverCarryCoordinates(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector4 = "seed-collector4:collector4@orenjitrade.test";
        String seededReport = "00000000-0000-4000-9e00-000000000001";
        UUID collector6 = idOf("collector6");

        List<JsonNode> documents = new ArrayList<>();
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/collector1/ratings",
                        collector4,
                        null,
                        200));
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/collector1/references",
                        collector4,
                        null,
                        200));
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + idOf("collector2"),
                        collector1,
                        null,
                        200));
        documents.add(callJson(HttpMethod.GET, "/api/v1/me/reports", collector4, null, 200));
        documents.add(
                callJson(HttpMethod.GET, "/api/v1/me/listings/status", collector1, null, 200));
        documents.add(callJson(HttpMethod.GET, "/api/v1/public/report-reasons", null, null, 200));
        for (String path :
                List.of(
                        "/api/v1/admin/reports?size=100",
                        "/api/v1/admin/reports/" + seededReport,
                        "/api/v1/admin/users/" + collector6 + "/history",
                        "/api/v1/admin/users/" + collector6 + "/listing-status",
                        "/api/v1/admin/listings/stale?size=100",
                        "/api/v1/admin/listings?size=100",
                        "/api/v1/admin/binders?size=100",
                        "/api/v1/admin/ratings?size=100",
                        "/api/v1/admin/moderation/rules",
                        "/api/v1/admin/dashboard",
                        "/api/v1/admin/notifications/stats",
                        "/api/v1/admin/analytics/summary",
                        "/api/v1/admin/system/health")) {
            documents.add(callJson(HttpMethod.GET, path, SEED_ADMIN, null, 200));
        }
        assertThat(documents.get(0).path("summary").path("count").asInt())
                .as("collector1's seeded ratings")
                .isEqualTo(2);
        assertThat(documents.get(7).path("reportedUser").path("handle").asString())
                .isEqualTo("collector6");
        for (JsonNode document : documents) {
            assertPublicListing(document, "phase 7 document");
        }

        String logs = output.getAll();
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    @Test
    void offersAndTradesNeverCarryCoordinatesOrPrivateNotes(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        String collector6 = "seed-collector6:collector6@orenjitrade.test";
        String openOffer = "00000000-0000-4000-9c00-000000000003";
        String counterOffer = "00000000-0000-4000-9c00-000000000005";

        List<JsonNode> documents = new ArrayList<>();
        documents.add(
                callJson(HttpMethod.GET, "/api/v1/offers/" + openOffer, collector1, null, 200));
        documents.add(
                callJson(HttpMethod.GET, "/api/v1/offers/" + openOffer, collector5, null, 200));
        documents.add(
                callJson(HttpMethod.GET, "/api/v1/offers?role=seller", collector1, null, 200));
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/offers/00000000-0000-4000-9c00-000000000001",
                        collector2,
                        null,
                        200));
        documents.add(
                callJson(HttpMethod.GET, "/api/v1/offers/" + counterOffer, collector6, null, 200));
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/offers/00000000-0000-4000-9c00-000000000004",
                        collector2,
                        null,
                        200));
        documents.add(callJson(HttpMethod.GET, "/api/v1/offers?role=buyer", collector6, null, 200));
        documents.add(callJson(HttpMethod.GET, "/api/v1/trades", collector1, null, 200));
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/trades/00000000-0000-4000-9d00-000000000001",
                        collector2,
                        null,
                        200));
        documents.add(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/trades/00000000-0000-4000-9d00-000000000002",
                        collector5,
                        null,
                        200));
        documents.add(
                callJson(HttpMethod.GET, "/api/v1/me/settings/offers", collector1, null, 200));

        assertThat(documents.get(0).path("status").asString()).isEqualTo("OPEN");
        assertThat(documents.get(0).path("buyer").path("handle").asString())
                .isEqualTo("collector5");
        assertThat(documents.get(4).path("status").asString()).isEqualTo("COUNTERED");
        assertThat(documents.get(4).path("currentTurn").asString()).isEqualTo("BUYER");
        assertThat(documents.get(8).path("status").asString()).isEqualTo("COMPLETED");
        assertThat(documents.get(8).path("meetup").asBoolean()).isTrue();
        for (JsonNode document : documents) {
            assertPublicListing(document, "phase 8 document");
        }
        for (JsonNode party :
                List.of(documents.get(0).path("seller"), documents.get(0).path("buyer"))) {
            assertThat(coordinatePairs(party)).isEmpty();
            JsonNode location = party.path("location");
            if (!location.isNull() && !location.isMissingNode()) {
                assertThat(location.has("publicLabel")).isTrue();
                assertThat(location.has("lat")).isFalse();
            }
        }
        callJson(HttpMethod.GET, "/api/v1/offers/" + openOffer, collector6, null, 404);

        String logs = output.getAll();
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    @Test
    void paymentsAndDisputesNeverCarryCoordinatesOrProviderAccounts(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        String collector8 = "seed-collector8:collector8@orenjitrade.test";
        String shippedTrade = "00000000-0000-4000-9d00-000000000003";
        String disputedTrade = "00000000-0000-4000-9d00-000000000004";
        String dispute = "00000000-0000-4000-9f00-000000000101";

        List<JsonNode> documents = new ArrayList<>();
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100 WHERE key ="
                        + " 'protectedPayments'");
        featureFlags.invalidate();
        try {
            documents.add(
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/trades/" + shippedTrade,
                            collector8,
                            null,
                            200));
            documents.add(
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/trades/" + shippedTrade,
                            collector1,
                            null,
                            200));
            documents.add(
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/trades/" + disputedTrade,
                            collector5,
                            null,
                            200));
            documents.add(
                    callJson(HttpMethod.GET, "/api/v1/disputes/" + dispute, collector5, null, 200));
            documents.add(
                    callJson(HttpMethod.GET, "/api/v1/disputes/" + dispute, collector2, null, 200));
            documents.add(
                    callJson(HttpMethod.GET, "/api/v1/me/seller-account", collector1, null, 200));
            callJson(HttpMethod.GET, "/api/v1/disputes/" + dispute, collector1, null, 404);
        } finally {
            testUsers.update(
                    "UPDATE feature_flag SET enabled = false WHERE key = 'protectedPayments'");
            featureFlags.invalidate();
        }
        for (String path :
                List.of(
                        "/api/v1/admin/disputes?size=100",
                        "/api/v1/admin/disputes/" + dispute,
                        "/api/v1/admin/transactions?size=100",
                        "/api/v1/admin/transactions/pending-confirmation?size=100",
                        "/api/v1/admin/payments?size=100",
                        "/api/v1/admin/payments/00000000-0000-4000-9f00-000000000001",
                        "/api/v1/admin/payments/webhooks?size=100",
                        "/api/v1/admin/payments/settings")) {
            documents.add(callJson(HttpMethod.GET, path, SEED_ADMIN, null, 200));
        }
        assertThat(documents.get(0).path("status").asString()).isEqualTo("SHIPPED");
        assertThat(documents.get(0).path("payment").path("status").asString()).isEqualTo("SECURED");
        assertThat(documents.get(2).path("status").asString()).isEqualTo("DISPUTED");
        assertThat(documents.get(3).path("reason").asString()).isEqualTo("NOT_AS_DESCRIBED");
        for (JsonNode document : documents) {
            assertPublicListing(document, "phase 9 document");
            assertThat(document.toString())
                    .as("provider accounts never leave the server")
                    .doesNotContain("fake_acct_")
                    .doesNotContain("storageKey");
        }

        String logs = output.getAll();
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    @Test
    void subscriptionsCreditsAdsAndDonationsNeverCarryCoordinates(CapturedOutput output) {
        String premium = "seed-premium-user:premium@orenjitrade.test";
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String subscription = "00000000-0000-4000-a000-000000000001";
        String sleeves = "00000000-0000-4000-a200-000000000101";

        List<JsonNode> documents = new ArrayList<>();
        List<JsonNode> ads = new ArrayList<>();
        // Every money flag is off by the migrations (V105 launch configuration): switch on the
        // four this test reads through, and put them back afterwards.
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100 WHERE key IN"
                        + " ('premiumPlans', 'credits', 'advertising', 'donations')");
        featureFlags.invalidate();
        try {
            documents.add(callJson(HttpMethod.GET, "/api/v1/me/plan", premium, null, 200));
            documents.add(callJson(HttpMethod.GET, "/api/v1/me/credits", collector1, null, 200));
            documents.add(callJson(HttpMethod.GET, "/api/v1/me/referrals", collector1, null, 200));
            documents.add(callJson(HttpMethod.GET, "/api/v1/me/donations", collector2, null, 200));
            documents.add(
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/public/donations/supporters",
                            null,
                            null,
                            200));
            for (String placement :
                    List.of(
                            "SEARCH_SPONSORED",
                            "MAP_PANEL",
                            "INVENTORY_SIDEBAR",
                            "COLLECTOR_PROFILE",
                            "MOBILE_FEED")) {
                for (String viewer : new String[] {null, collector1}) {
                    ads.add(
                            callJson(
                                    HttpMethod.GET,
                                    "/api/v1/ads?placement=" + placement + "&game=pokemon",
                                    viewer,
                                    null,
                                    200));
                }
            }
            assertThat(
                            callJson(
                                            HttpMethod.GET,
                                            "/api/v1/ads?placement=MAP_PANEL",
                                            premium,
                                            null,
                                            200)
                                    .size())
                    .as("no ads for PREMIUM")
                    .isZero();
        } finally {
            testUsers.update(
                    "UPDATE feature_flag SET enabled = false WHERE key IN ('premiumPlans',"
                            + " 'credits', 'advertising', 'donations')");
            featureFlags.invalidate();
        }
        for (String path :
                List.of(
                        "/api/v1/admin/subscriptions?size=100",
                        "/api/v1/admin/subscriptions/" + subscription,
                        "/api/v1/admin/credits/ledger?size=100",
                        "/api/v1/admin/credits/products",
                        "/api/v1/admin/credits/settings",
                        "/api/v1/admin/ads/advertisers",
                        "/api/v1/admin/ads/placements",
                        "/api/v1/admin/ads/campaigns?size=100",
                        "/api/v1/admin/ads/campaigns/" + sleeves,
                        "/api/v1/admin/ads/campaigns/" + sleeves + "/stats",
                        "/api/v1/admin/donations?size=100",
                        "/api/v1/admin/donations/settings")) {
            documents.add(callJson(HttpMethod.GET, path, SEED_ADMIN, null, 200));
        }
        assertThat(documents.get(0).path("subscription").path("status").asString())
                .isEqualTo("ACTIVE");
        assertThat(documents.get(1).path("balance").asLong()).isGreaterThanOrEqualTo(300);
        assertThat(documents.get(4).path("supporters").size()).isPositive();
        assertThat(documents.get(4).toString())
                .doesNotContain("25.00")
                .doesNotContain("Keep the local trade nights going");
        assertThat(ads.stream().mapToInt(JsonNode::size).sum())
                .as("seeded campaigns serve")
                .isPositive();
        documents.addAll(ads);
        for (JsonNode document : documents) {
            assertPublicListing(document, "phase 10 document");
            assertThat(document.toString())
                    .as("provider references never reach members or admin lists")
                    .doesNotContain("fake_sub_")
                    .doesNotContain("fake_acct_")
                    .doesNotContain("user_hash")
                    .doesNotContain("userHash");
        }
        for (JsonNode list : ads) {
            for (JsonNode ad : list) {
                assertThat(ad.path("label").asString()).isEqualTo("Sponsored");
            }
        }

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
