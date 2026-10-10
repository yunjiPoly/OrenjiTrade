package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * ADR 0017 privacy contract over the seeded collectors and every response family of Phases 1-10: no
 * response anywhere carries a coordinate, a distance, a radius or a grid cell (no such key, no
 * number with more than 3 decimals, no "km away" text), and a collector's city appears only in
 * their own public profile ({@code GET /collectors/{handle}}) while "Show my city on my profile" is
 * on, never in lists, search, binders, offers, messages, notifications, admin views or logs (the
 * owner's own settings and export excepted). Every other surface shows state/province + country.
 * Shares the seeded context with {@code SeedDataRunnerIT}.
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

    /** State/province + country of every seed account (db/seed/locations.json). */
    static final Map<String, String> PLACES =
            Map.ofEntries(
                    Map.entry("collector1", "Quebec, Canada"),
                    Map.entry("collector2", "Ontario, Canada"),
                    Map.entry("collector3", "Buenos Aires City, Argentina"),
                    Map.entry("collector4", "Community of Madrid, Spain"),
                    Map.entry("collector5", "California, United States"),
                    Map.entry("collector6", "Santiago Metropolitan Region, Chile"),
                    Map.entry("collector7", "New York, United States"),
                    Map.entry("collector8", "Île-de-France, France"),
                    Map.entry("premium_user", "São Paulo, Brazil"),
                    Map.entry("moderator", "Berlin, Germany"),
                    Map.entry("admin", "England, United Kingdom"),
                    Map.entry("superadmin", "Quebec, Canada"));

    /** Collectors who hide their city on their profile in this test. */
    static final Set<String> HIDE_CITY = Set.of("collector2", "collector6", "collector8");

    /** Keys that would describe a position, a distance or an area: never in any response. */
    static final Set<String> FORBIDDEN_KEYS =
            Set.of(
                    "lat",
                    "lng",
                    "lon",
                    "latitude",
                    "longitude",
                    "publicPoint",
                    "homePoint",
                    "tradingArea",
                    "center",
                    "centre",
                    "radiusKm",
                    "distanceBucket",
                    "distance",
                    "distanceKm",
                    "gridCell",
                    "geoCell",
                    "publicLabel");

    /**
     * A coordinate as it would appear in a log line: a decimal-degree pair ({@code 45.508,
     * -73.587}) or a {@code lat=}/{@code lng:}-style key with a number. Lone decimals are left
     * alone: log timestamps and durations have them.
     */
    static final Pattern COORDINATE_IN_LOGS =
            Pattern.compile(
                    "-?\\d{1,3}\\.\\d{3,}\\s*,\\s*-?\\d{1,3}\\.\\d{3,}"
                            + "|(?i)\\b(?:lat|lng|lon|latitude|longitude)\\b\"?\\s*[=:]\\s*-?\\d");

    /** Seed admin token uid with its real email (so the login does not rewrite the seed email). */
    static final String SEED_ADMIN = "seed-admin:admin@orenjitrade.test";

    @Autowired private FeatureFlags featureFlags;

    /** Original seeded city and switch per handle, restored after each test. */
    private final Map<String, Object[]> original = new LinkedHashMap<>();

    /** Every document checked by the current test, with what fetched it. */
    private final List<Fetched> fetched = new ArrayList<>();

    private record Fetched(String path, @Nullable String caller, JsonNode body) {}

    private UUID idOf(String handle) {
        return (UUID)
                testUsers
                        .query("SELECT id FROM user_account WHERE handle = ?", handle)
                        .get(0)
                        .get("id");
    }

    /** The distinctive city of a seed account in this test (letters only, moderated as usual). */
    static String cityOf(String handle) {
        return "Zqcity" + handle.replace("_", "").toLowerCase(Locale.ROOT);
    }

    @BeforeEach
    void distinctiveCities() {
        for (String handle : PLACES.keySet()) {
            UUID id = idOf(handle);
            Map<String, Object> stored = testUsers.locationOf(id);
            assertThat(stored).as("seeded location of %s", handle).isNotEmpty();
            original.put(handle, new Object[] {stored.get("city"), stored.get("show_city")});
            testUsers.update(
                    "UPDATE user_location SET city = ?, show_city = ? WHERE user_id = ?",
                    cityOf(handle),
                    !HIDE_CITY.contains(handle),
                    id);
        }
    }

    @AfterEach
    void restoreCities() {
        for (Map.Entry<String, Object[]> entry : original.entrySet()) {
            testUsers.update(
                    "UPDATE user_location SET city = ?, show_city = ? WHERE user_id = ?",
                    entry.getValue()[0],
                    entry.getValue()[1],
                    idOf(entry.getKey()));
        }
    }

    private JsonNode fetch(String path, @Nullable String caller) {
        JsonNode body = callJson(HttpMethod.GET, path, caller, null, 200);
        fetched.add(new Fetched(path, caller, body));
        return body;
    }

    /**
     * Every document of the test: no geography key, at most 3 decimals, no distance text, and a
     * city only in the public profile of a collector who shows it.
     */
    private void assertContract(CapturedOutput output) {
        assertThat(fetched).as("documents were checked").isNotEmpty();
        for (Fetched document : fetched) {
            String context = document.path() + " as " + document.caller();
            assertNoGeography(document.body(), context);
            String text = document.body().toString();
            for (String handle : PLACES.keySet()) {
                boolean ownProfile =
                        document.path().equals("/api/v1/collectors/" + handle)
                                && !HIDE_CITY.contains(handle);
                if (!ownProfile) {
                    assertThat(text)
                            .as("city of %s in %s", handle, context)
                            .doesNotContain(cityOf(handle));
                }
            }
        }
        String logs = output.getAll();
        for (String handle : PLACES.keySet()) {
            assertThat(logs).as("city of %s in the logs", handle).doesNotContain(cityOf(handle));
        }
        assertThat(COORDINATE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    @Test
    void profilesShowStateAndCountryAndTheCityOnlyOnTheirOwnPage(CapturedOutput output) {
        String viewer = uniqueUid("geo-viewer");
        provisionCompliant(viewer);

        for (String handle : DISCOVERABLE) {
            JsonNode profile = fetch("/api/v1/collectors/" + handle, viewer);
            JsonNode location = profile.path("location");
            assertThat(location.path("label").asString())
                    .as("place of %s", handle)
                    .isEqualTo(PLACES.get(handle));
            if (HIDE_CITY.contains(handle)) {
                assertThat(location.path("city").isNull())
                        .as("%s hides their city", handle)
                        .isTrue();
            } else {
                assertThat(location.path("city").asString()).isEqualTo(cityOf(handle));
            }
        }
        for (String handle : NOT_DISCOVERABLE) {
            JsonNode profile = fetch("/api/v1/collectors/" + handle, viewer);
            assertThat(profile.path("location").isNull())
                    .as("%s is not discoverable", handle)
                    .isTrue();
        }
        for (String handle : PLACES.keySet()) {
            JsonNode detail = fetch("/api/v1/admin/users/" + idOf(handle), SEED_ADMIN);
            assertThat(detail.path("locationLabel").asString())
                    .as("admin sees state/province + country of %s", handle)
                    .isEqualTo(PLACES.get(handle));
        }
        assertContract(output);
    }

    /**
     * Phase 3 public listings of the seeded collectors (binders, binder items, collector
     * inventory), anonymous and signed in: the owner block carries state/province + country only.
     */
    @Test
    void publicListingsCarryThePlaceNeverTheCityOrPrivateNotes(CapturedOutput output) {
        String viewer = uniqueUid("geo-listings");
        provisionCompliant(viewer);
        int publicBinders = 0;
        for (String handle : DISCOVERABLE) {
            for (String caller : Arrays.asList(null, viewer)) {
                JsonNode binders = fetch("/api/v1/collectors/" + handle + "/binders", caller);
                fetch("/api/v1/collectors/" + handle + "/inventory?size=100", caller);
                for (JsonNode binder : binders) {
                    String id = binder.path("id").asString();
                    JsonNode detail = fetch("/api/v1/public/binders/" + id, caller);
                    assertThat(detail.path("owner").path("place").path("label").asString())
                            .isEqualTo(PLACES.get(handle));
                    fetch("/api/v1/public/binders/" + id + "/items?size=100", caller);
                    publicBinders++;
                }
            }
        }
        assertThat(publicBinders).as("seeded public binders were checked").isPositive();
        assertThat(
                        fetch("/api/v1/collectors/collector7/inventory", viewer)
                                .path("totalItems")
                                .asLong())
                .isZero();
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    /**
     * Region search, card holders, suggestions and the map (binder counts and the binders of a
     * state), anonymous and signed in: collectors carry their state/province + country only;
     * non-discoverable collectors never appear.
     */
    @Test
    void searchAndMapResponsesCarryPlacesOnly(CapturedOutput output) {
        String viewer = uniqueUid("geo-map");
        provisionCompliant(viewer);
        UUID printingId =
                (UUID)
                        testUsers
                                .query(
                                        "SELECT id FROM card_printing WHERE external_ref ->>"
                                                + " 'id' = 'ygo-p001a'")
                                .get(0)
                                .get("id");
        for (String caller : Arrays.asList(null, viewer)) {
            JsonNode search = fetch("/api/v1/search?q=AZR-EN001&region=americas-north", caller);
            assertThat(search.path("collectors").size()).isPositive();
            assertPlaces(search.path("collectors"));
            JsonNode binders =
                    fetch(
                            "/api/v1/search?q=binder&types=binders,collectors&region=americas-north",
                            caller);
            assertThat(binders.path("binders").size()).isPositive();
            JsonNode holders =
                    fetch(
                            "/api/v1/search/card-holders?region=americas-north&printingId="
                                    + printingId,
                            caller);
            assertThat(holders.path("totalItems").asLong()).isPositive();
            for (JsonNode row : holders.path("items")) {
                assertPlaces(jsonMapper.createArrayNode().add(row.path("collector")));
            }
            fetch("/api/v1/search/suggest?q=collector&region=americas-north", caller);
            for (String region : List.of("americas-north", "americas-south", "europe")) {
                fetch("/api/v1/search?q=collector&types=collectors&region=" + region, caller);
                fetch("/api/v1/regions/" + region + "/binder-counts", caller);
            }
            JsonNode counts = fetch("/api/v1/regions/americas-north/binder-counts", caller);
            assertThat(counts.toString()).contains("\"CA-QC\"");
            JsonNode quebec =
                    fetch("/api/v1/regions/americas-north/subdivisions/CA-QC/binders", caller);
            assertThat(quebec.path("items").size()).isPositive();
            for (JsonNode binder : quebec.path("items")) {
                assertThat(binder.path("owner").path("place").path("label").asString())
                        .isEqualTo("Quebec, Canada");
            }
            fetch("/api/v1/regions/americas-south/subdivisions/BR-SP/binders", caller);
            fetch("/api/v1/regions/europe/subdivisions/FR-IDF/binders", caller);
        }
        fetch("/api/v1/regions", null);
        for (Fetched document : fetched) {
            String text = document.body().toString();
            for (String handle : NOT_DISCOVERABLE) {
                assertThat(text)
                        .as("%s in %s", handle, document.path())
                        .doesNotContain("\"handle\":\"" + handle + "\"");
            }
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    /** Each collector of a search document carries the place of its seeded location. */
    private void assertPlaces(JsonNode collectors) {
        for (JsonNode collector : collectors) {
            String handle = collector.path("handle").asString();
            if (PLACES.containsKey(handle)) {
                assertThat(collector.path("place").path("label").asString())
                        .as("place of %s", handle)
                        .isEqualTo(PLACES.get(handle));
            }
            assertThat(collector.path("place").path("subdivisionCode").asString()).isNotBlank();
        }
    }

    /**
     * Phase 5 responses that carry other members (conversations, messages with card and binder
     * links, blocks, community channels, posts and replies); the seeded conversation and posts are
     * served as seeded; the platform region channels exist and the old city channels are archived.
     */
    @Test
    void messagingAndCommunityResponsesNeverCarryGeography(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String conversationId = "00000000-0000-4000-8d00-000000000001";

        JsonNode conversations = fetch("/api/v1/conversations", collector1);
        JsonNode seeded = null;
        for (JsonNode item : conversations.path("items")) {
            if (item.path("id").asString().equals(conversationId)) {
                seeded = item;
            }
        }
        assertThat(seeded).as("the seeded conversation of collector1").isNotNull();
        assertThat(seeded.path("other").path("handle").asString()).isEqualTo("collector2");
        JsonNode messages =
                fetch("/api/v1/conversations/" + conversationId + "/messages", collector2);
        assertThat(messages.path("items")).hasSize(6);
        fetch("/api/v1/conversations", collector2);

        JsonNode channels = fetch("/api/v1/community/channels", collector1);
        List<String> slugs = new ArrayList<>();
        channels.forEach(channel -> slugs.add(channel.path("slug").asString()));
        assertThat(slugs)
                .contains("americas-north", "americas-south", "europe")
                .doesNotContain("montreal-yugioh");
        for (String slug : List.of("looking-for", "new-listings", "general")) {
            JsonNode posts = fetch("/api/v1/community/channels/" + slug + "/posts", collector2);
            assertThat(posts.path("items")).as("seeded posts in %s", slug).isNotEmpty();
            for (JsonNode post : posts.path("items")) {
                fetch(
                        "/api/v1/community/posts/" + post.path("id").asString() + "/replies",
                        collector2);
            }
        }
        fetch("/api/v1/me/blocks", collector1);
        assertContract(output);
    }

    /**
     * Phase 6 / stage S2: the seeded wishlist of collector2 (items, public summary, price terms)
     * and the notification centre: the wishlist alert about collector1's listing names the
     * state/province + country, never a distance or a city.
     */
    @Test
    void wishlistAndNotificationResponsesCarryPlacesNotDistances(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String azureItem = "00000000-0000-4000-8c00-000000010101";

        JsonNode wishlist = fetch("/api/v1/wishlist", collector2);
        assertThat(wishlist).hasSizeGreaterThanOrEqualTo(3);
        fetch("/api/v1/wishlist/price-terms", collector2);
        fetch("/api/v1/collectors/collector2/wishlist", collector1);

        JsonNode notifications = fetch("/api/v1/notifications?limit=50", collector2);
        boolean sawAlert = false;
        for (JsonNode notification : notifications.path("items")) {
            if ("WISHLIST_ALERT".equals(notification.path("type").asString())
                    && azureItem.equals(
                            notification.path("data").path("inventoryItemId").asString())) {
                sawAlert = true;
                assertThat(notification.path("body").asString())
                        .contains("was just listed by @collector1 in Quebec, Canada");
            }
        }
        assertThat(sawAlert).as("the seeded listing alerted collector2").isTrue();
        fetch("/api/v1/notifications", collector1);
        for (Fetched document : fetched) {
            if (document.path().startsWith("/api/v1/wishlist")) {
                // collector2's own wishlist: public wish notes only; item notes still never
                // show.
                assertNoItemNotes(document.body(), document.path());
            } else {
                assertNoPrivateNotes(document.body(), document.path());
            }
        }
        assertContract(output);
    }

    /** Phase 7: ratings, references, reports, listing status and every admin console response. */
    @Test
    void ratingsReportsAndAdminConsoleResponsesNeverCarryGeography(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector4 = "seed-collector4:collector4@orenjitrade.test";
        String seededReport = "00000000-0000-4000-9e00-000000000001";
        UUID collector6 = idOf("collector6");

        JsonNode ratings = fetch("/api/v1/collectors/collector1/ratings", collector4);
        fetch("/api/v1/collectors/collector1/references", collector4);
        fetch("/api/v1/ratings/eligibility?userId=" + idOf("collector2"), collector1);
        fetch("/api/v1/me/reports", collector4);
        fetch("/api/v1/me/listings/status", collector1);
        fetch("/api/v1/public/report-reasons", null);
        JsonNode report = null;
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
                        "/api/v1/admin/system/health",
                        "/api/v1/admin/regions",
                        "/api/v1/admin/users?size=100")) {
            JsonNode document = fetch(path, SEED_ADMIN);
            if (path.endsWith(seededReport)) {
                report = document;
            }
        }
        assertThat(ratings.path("summary").path("count").asInt())
                .as("collector1's seeded ratings")
                .isEqualTo(2);
        assertThat(report).isNotNull();
        assertThat(report.path("reportedUser").path("handle").asString()).isEqualTo("collector6");
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    @Test
    void offersAndTradesCarryPartyPlacesOnly(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        String collector6 = "seed-collector6:collector6@orenjitrade.test";
        String openOffer = "00000000-0000-4000-9c00-000000000003";
        String counterOffer = "00000000-0000-4000-9c00-000000000005";

        JsonNode open = fetch("/api/v1/offers/" + openOffer, collector1);
        fetch("/api/v1/offers/" + openOffer, collector5);
        fetch("/api/v1/offers?role=seller", collector1);
        fetch("/api/v1/offers/00000000-0000-4000-9c00-000000000001", collector2);
        JsonNode countered = fetch("/api/v1/offers/" + counterOffer, collector6);
        fetch("/api/v1/offers/00000000-0000-4000-9c00-000000000004", collector2);
        fetch("/api/v1/offers?role=buyer", collector6);
        fetch("/api/v1/trades", collector1);
        JsonNode completed =
                fetch("/api/v1/trades/00000000-0000-4000-9d00-000000000001", collector2);
        fetch("/api/v1/trades/00000000-0000-4000-9d00-000000000002", collector5);
        fetch("/api/v1/me/settings/offers", collector1);

        assertThat(open.path("status").asString()).isEqualTo("OPEN");
        assertThat(open.path("buyer").path("handle").asString()).isEqualTo("collector5");
        assertThat(open.path("seller").path("place").path("label").asString())
                .isEqualTo("Quebec, Canada");
        assertThat(open.path("buyer").path("place").path("label").asString())
                .isEqualTo("California, United States");
        assertThat(countered.path("status").asString()).isEqualTo("COUNTERED");
        assertThat(countered.path("currentTurn").asString()).isEqualTo("BUYER");
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(completed.path("meetup").asBoolean()).isTrue();
        callJson(HttpMethod.GET, "/api/v1/offers/" + openOffer, collector6, null, 404);
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
        }
        assertContract(output);
    }

    @Test
    void paymentsAndDisputesNeverCarryGeographyOrProviderAccounts(CapturedOutput output) {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String collector5 = "seed-collector5:collector5@orenjitrade.test";
        String collector8 = "seed-collector8:collector8@orenjitrade.test";
        String shippedTrade = "00000000-0000-4000-9d00-000000000003";
        String disputedTrade = "00000000-0000-4000-9d00-000000000004";
        String dispute = "00000000-0000-4000-9f00-000000000101";

        JsonNode shipped;
        JsonNode disputed;
        JsonNode disputeDocument;
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100 WHERE key ="
                        + " 'protectedPayments'");
        featureFlags.invalidate();
        try {
            shipped = fetch("/api/v1/trades/" + shippedTrade, collector8);
            fetch("/api/v1/trades/" + shippedTrade, collector1);
            disputed = fetch("/api/v1/trades/" + disputedTrade, collector5);
            disputeDocument = fetch("/api/v1/disputes/" + dispute, collector5);
            fetch("/api/v1/disputes/" + dispute, collector2);
            fetch("/api/v1/me/seller-account", collector1);
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
            fetch(path, SEED_ADMIN);
        }
        assertThat(shipped.path("status").asString()).isEqualTo("SHIPPED");
        assertThat(shipped.path("payment").path("status").asString()).isEqualTo("SECURED");
        assertThat(disputed.path("status").asString()).isEqualTo("DISPUTED");
        assertThat(disputeDocument.path("reason").asString()).isEqualTo("NOT_AS_DESCRIBED");
        for (Fetched document : fetched) {
            assertNoPrivateNotes(document.body(), document.path());
            assertThat(document.body().toString())
                    .as("provider accounts never leave the server")
                    .doesNotContain("fake_acct_")
                    .doesNotContain("storageKey");
        }
        assertContract(output);
    }

    @Test
    void subscriptionsCreditsAdsAndDonationsNeverCarryGeography(CapturedOutput output) {
        String premium = "seed-premium-user:premium@orenjitrade.test";
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        String subscription = "00000000-0000-4000-a000-000000000001";
        String sleeves = "00000000-0000-4000-a200-000000000101";

        JsonNode plan;
        JsonNode credits;
        JsonNode supporters;
        List<JsonNode> ads = new ArrayList<>();
        // Every money flag is off by the migrations (V105 launch configuration): switch on the
        // four this test reads through, and put them back afterwards.
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100 WHERE key IN"
                        + " ('premiumPlans', 'credits', 'advertising', 'donations')");
        featureFlags.invalidate();
        try {
            plan = fetch("/api/v1/me/plan", premium);
            credits = fetch("/api/v1/me/credits", collector1);
            fetch("/api/v1/me/referrals", collector1);
            fetch("/api/v1/me/donations", collector2);
            supporters = fetch("/api/v1/public/donations/supporters", null);
            for (String placement :
                    List.of(
                            "SEARCH_SPONSORED",
                            "MAP_PANEL",
                            "INVENTORY_SIDEBAR",
                            "COLLECTOR_PROFILE",
                            "MOBILE_FEED")) {
                for (String viewer : Arrays.asList(null, collector1)) {
                    ads.add(
                            fetch(
                                    "/api/v1/ads?placement="
                                            + placement
                                            + "&game=pokemon&region=americas-north",
                                    viewer));
                }
            }
            assertThat(fetch("/api/v1/ads?placement=MAP_PANEL", premium).size())
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
                        "/api/v1/admin/donations/settings",
                        "/api/v1/plans")) {
            fetch(path, SEED_ADMIN);
        }
        assertThat(plan.path("subscription").path("status").asString()).isEqualTo("ACTIVE");
        assertThat(credits.path("balance").asLong()).isGreaterThanOrEqualTo(300);
        assertThat(supporters.path("supporters").size()).isPositive();
        assertThat(ads.stream().mapToInt(JsonNode::size).sum())
                .as("seeded campaigns serve")
                .isPositive();
        for (Fetched document : fetched) {
            String text = document.body().toString();
            assertThat(text)
                    .as("provider references never reach members or admin lists")
                    .doesNotContain("fake_sub_")
                    .doesNotContain("fake_acct_")
                    .doesNotContain("user_hash")
                    .doesNotContain("userHash")
                    .doesNotContain("map.radius")
                    .doesNotContain("map_radius_day");
        }
        for (JsonNode list : ads) {
            for (JsonNode ad : list) {
                assertThat(ad.path("label").asString()).isEqualTo("Sponsored");
            }
        }
        assertContract(output);
    }

    /** No private notes of the seeded items in a document. */
    private static void assertNoPrivateNotes(JsonNode document, String context) {
        assertThat(document.toString())
                .as("private notes in %s", context)
                .doesNotContain("\"notes\"");
        assertNoItemNotes(document, context);
    }

    /** No private inventory notes of the seeded items in a document. */
    private static void assertNoItemNotes(JsonNode document, String context) {
        assertThat(document.toString())
                .as("private item notes in %s", context)
                .doesNotContain("Grading candidate")
                .doesNotContain("Pulled at the spring locals");
    }

    /**
     * No key describing a position, a distance or an area anywhere in the document, every number
     * with at most 3 decimals, and no distance wording.
     */
    static void assertNoGeography(JsonNode node, String context) {
        if (node.isNumber()) {
            assertThat(decimals(node.decimalValue()))
                    .as("numeric value %s in %s", node, context)
                    .isLessThanOrEqualTo(3);
            return;
        }
        if (node.isString()) {
            assertThat(node.asString())
                    .as("distance wording in %s", context)
                    .doesNotContain("km away")
                    .doesNotContain("km radius");
            return;
        }
        if (node.isObject()) {
            for (String key : node.propertyNames()) {
                assertThat(FORBIDDEN_KEYS).as("key %s in %s", key, context).doesNotContain(key);
            }
        }
        for (JsonNode child : node) {
            assertNoGeography(child, context);
        }
    }

    private static int decimals(BigDecimal value) {
        return Math.max(0, value.stripTrailingZeros().scale());
    }
}
