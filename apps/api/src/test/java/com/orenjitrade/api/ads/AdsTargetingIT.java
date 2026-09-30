package com.orenjitrade.api.ads;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.AbstractPhase10IT;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.location.domain.ApproximateLocationService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 ad targeting: only public context is used (the viewer's public grid cell and region
 * label, never the trading-area centre or the home point; verified by behaviour and by scanning the
 * ads module's sources), the ads.enabled entitlement and the PREMIUM plan hide ads, PLAN rules
 * separate members from signed-out visitors, and every ad says "Sponsored". Each test targets its
 * own random game slug so campaigns of other tests and the seed never interfere.
 */
class AdsTargetingIT extends AbstractPhase10IT {

    String admin;
    String advertiserId;
    String game;

    @BeforeEach
    void advertiser() {
        flag("advertising", true);
        admin = staff("ads-admin", Role.ADMIN);
        advertiserId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/admin/ads/advertisers",
                                admin,
                                Map.of("name", "Fictional Test Advertiser"),
                                201)
                        .path("id")
                        .asString();
        game = "zz-" + Long.toHexString(ThreadLocalRandom.current().nextLong() & 0xffffffL);
    }

    @Test
    void targetingOnlyUsesThePublicPointNeverTheCentreOrTheHomePoint() {
        Member viewer = member("ads-viewer");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                viewer.uid(),
                InventoryTestSupport.privacy(true, "MEMBERS"),
                200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer.uid(),
                Map.of("lat", 45.522, "lng", -73.581, "radiusKm", 5),
                200);
        Map<String, Object> stored = testUsers.locationOf(viewer.id());
        String publicCell = stored.get("grid_cell").toString();
        String publicLabel = stored.get("public_label").toString();
        assertThat(publicLabel).contains("Montréal");
        // The private centre moves to Toronto and a home point to Vancouver; the public point
        // stays.
        testUsers.update(
                "UPDATE user_location SET trading_area_center ="
                        + " ST_SetSRID(ST_MakePoint(-79.383, 43.653), 4326)::geography,"
                        + " home_point = ST_SetSRID(ST_MakePoint(-123.121, 49.283),"
                        + " 4326)::geography WHERE user_id = ?",
                viewer.id());
        String centreCell = ApproximateLocationService.cellOf(43.653, -79.383).id();
        String homeCell = ApproximateLocationService.cellOf(49.283, -123.121).id();
        assertThat(centreCell).isNotEqualTo(publicCell);

        String publicAd = campaign("SEARCH_SPONSORED", rules("GEO_CELL", publicCell, "GAME", game));
        String centreAd = campaign("SEARCH_SPONSORED", rules("GEO_CELL", centreCell, "GAME", game));
        String homeAd = campaign("SEARCH_SPONSORED", rules("GEO_CELL", homeCell, "GAME", game));
        String torontoAd =
                campaign("SEARCH_SPONSORED", rules("REGION_LABEL", "Toronto", "GAME", game));
        String montrealAd =
                campaign("COLLECTOR_PROFILE", rules("REGION_LABEL", "Montréal", "GAME", game));

        List<String> served = served(viewer.uid(), "SEARCH_SPONSORED", null);
        assertThat(served).contains(publicAd).doesNotContain(centreAd, homeAd, torontoAd);
        assertThat(served(viewer.uid(), "COLLECTOR_PROFILE", null)).contains(montrealAd);
        // A signed-out visitor has no location: no cell or label rule matches.
        assertThat(served(null, "SEARCH_SPONSORED", null)).doesNotContain(publicAd, centreAd);
        // An explicit public grid cell of the map view targets like the viewer's own cell.
        assertThat(served(null, "SEARCH_SPONSORED", centreCell))
                .contains(centreAd)
                .doesNotContain(publicAd);

        JsonNode ads = ads(viewer.uid(), "SEARCH_SPONSORED", null);
        for (JsonNode ad : ads) {
            assertThat(ad.path("sponsored").asBoolean()).isTrue();
            assertThat(ad.path("label").asString()).isEqualTo("Sponsored");
            assertThat(ad.path("advertiser").asString()).isEqualTo("Fictional Test Advertiser");
            assertThat(ad.path("clickUrl").asString()).startsWith("/api/v1/ads/");
        }
        assertThat(ads.toString())
                .doesNotContain("\"lat\"")
                .doesNotContain("\"lng\"")
                .doesNotContain("publicPoint")
                .doesNotContain(viewer.id().toString());
    }

    @Test
    void theAdsModuleNeverReadsPrivateLocationData() throws IOException {
        Path root = Path.of("src/main/java/com/orenjitrade/api/ads");
        assertThat(root).isDirectory();
        List<String> offenders = new ArrayList<>();
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8);
                for (String forbidden :
                        List.of(
                                "home_point",
                                "trading_area_center",
                                "user_location",
                                "searchCentreOf",
                                "distanceFrom",
                                "centreLat",
                                "centreLng",
                                "StoredLocation",
                                "UserLocationRepository")) {
                    if (source.contains(forbidden)) {
                        offenders.add(file.getFileName() + ": " + forbidden);
                    }
                }
            }
        }
        assertThat(offenders).as("private location access in the ads module").isEmpty();
    }

    @Test
    void premiumMembersAndTheAdsEnabledEntitlementHideAdsAndPlanRulesSplitAudiences() {
        String everybody = campaign("SEARCH_SPONSORED", rules("GAME", game));
        String anonymousOnly = campaign("MOBILE_FEED", rules("GAME", game, "PLAN", "ANONYMOUS"));

        Member free = member("ads-free");
        assertThat(served(free.uid(), "SEARCH_SPONSORED", null)).contains(everybody);
        assertThat(served(free.uid(), "MOBILE_FEED", null)).doesNotContain(anonymousOnly);
        assertThat(served(null, "SEARCH_SPONSORED", null)).contains(everybody);
        assertThat(served(null, "MOBILE_FEED", null)).contains(anonymousOnly);

        Member premium = member("ads-premium");
        testUsers.update(
                "UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", premium.id());
        assertThat(ads(premium.uid(), "SEARCH_SPONSORED", null).size()).isZero();

        Member entitled = member("ads-entitled");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + entitled.id() + "/entitlements",
                admin,
                Map.of("featureKey", "ads.enabled", "value", "false"),
                201);
        assertThat(ads(entitled.uid(), "SEARCH_SPONSORED", null).size()).isZero();

        // Interest games and tags of the viewer's profile target when no game is requested.
        Member fan = member("ads-fan");
        String tagAd = campaign("INVENTORY_SIDEBAR", rules("TAG", "sealed", "GAME", game));
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", me(fan.uid()).path("handle").asString());
        profile.put("displayName", "Fictional Fan");
        profile.put("bio", "");
        profile.put("games", List.of("pokemon"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", fan.uid(), profile, 200);
        String sealed =
                testUsers
                        .query("SELECT id FROM tag WHERE slug = 'sealed'")
                        .get(0)
                        .get("id")
                        .toString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                fan.uid(),
                Map.of("tagIds", List.of(sealed), "customLabels", List.of()),
                200);
        assertThat(served(fan.uid(), "INVENTORY_SIDEBAR", null)).contains(tagAd);
        assertThat(served(free.uid(), "INVENTORY_SIDEBAR", null)).doesNotContain(tagAd);

        // Validation of the request.
        callJson(HttpMethod.GET, "/api/v1/ads?placement=NOWHERE", null, null, 400);
        callJson(HttpMethod.GET, "/api/v1/ads", null, null, 400);
        callJson(
                HttpMethod.GET,
                "/api/v1/ads?placement=MAP_PANEL&geoCell=45.5,-73.5",
                null,
                null,
                400);
    }

    // ---------------------------------------------------------------------------------------

    /** Creates an ACTIVE FLAT campaign (priority 100) with one ACTIVE creative; its creative id. */
    String campaign(String placement, List<Map<String, String>> rules) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("advertiserId", advertiserId);
        body.put("name", "Targeting test " + game);
        body.put("status", "ACTIVE");
        body.put("startAt", Instant.now().minus(1, ChronoUnit.HOURS).toString());
        body.put("budgetTotal", 100);
        body.put("currency", "CAD");
        body.put("pricing", "FLAT");
        body.put("priority", 100);
        String campaignId =
                callJson(HttpMethod.POST, "/api/v1/admin/ads/campaigns", admin, body, 201)
                        .path("campaign")
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/ads/campaigns/" + campaignId + "/targeting",
                admin,
                Map.of("rules", rules),
                200);
        Map<String, Object> creative = new LinkedHashMap<>();
        creative.put("placement", placement);
        creative.put("headline", "Fictional accessory");
        creative.put("body", "A fictional product for tests.");
        creative.put("ctaLabel", "Look");
        creative.put("landingUrl", "https://accessories.example/test");
        creative.put("status", "ACTIVE");
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/ads/campaigns/" + campaignId + "/creatives",
                        admin,
                        creative,
                        201)
                .path("id")
                .asString();
    }

    static List<Map<String, String>> rules(String... kindValues) {
        List<Map<String, String>> rules = new ArrayList<>();
        for (int i = 0; i < kindValues.length; i += 2) {
            rules.add(Map.of("kind", kindValues[i], "value", kindValues[i + 1]));
        }
        return rules;
    }

    JsonNode ads(@Nullable String uid, String placement, @Nullable String geoCell) {
        String path =
                "/api/v1/ads?placement="
                        + placement
                        + (geoCell == null
                                ? "&game=" + game
                                : "&game=" + game + "&geoCell=" + geoCell);
        return callJson(HttpMethod.GET, path, uid, null, 200);
    }

    List<String> served(@Nullable String uid, String placement, @Nullable String geoCell) {
        List<String> ids = new ArrayList<>();
        ads(uid, placement, geoCell).forEach(ad -> ids.add(ad.path("creativeId").asString()));
        return ids;
    }
}
