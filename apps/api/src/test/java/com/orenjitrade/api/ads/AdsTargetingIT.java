package com.orenjitrade.api.ads;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.AbstractPhase10IT;
import com.orenjitrade.api.inventory.InventoryTestSupport;
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
 * Phase 10 ad targeting: only public codes are used (the page's platform region, the viewer's
 * country and state/province, never the city; verified by behaviour and by scanning the ads
 * module's sources; ADR 0017), the ads.enabled entitlement and the PREMIUM plan hide ads, PLAN
 * rules separate members from signed-out visitors, and every ad says "Sponsored". Each test targets
 * its own random game slug so campaigns of other tests and the seed never interfere.
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
    void targetingUsesTheRegionCountryAndSubdivisionNeverTheCity() {
        Member viewer = member("ads-viewer");
        setLocation(viewer.uid(), "CA", "CA-ON", "Ottawa");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                viewer.uid(),
                InventoryTestSupport.privacy(true, "MEMBERS"),
                200);

        String ontarioAd =
                campaign("SEARCH_SPONSORED", rules("SUBDIVISION", "CA-ON", "GAME", game));
        String quebecAd = campaign("SEARCH_SPONSORED", rules("SUBDIVISION", "CA-QC", "GAME", game));
        String canadaAd = campaign("SEARCH_SPONSORED", rules("COUNTRY", "CA", "GAME", game));
        String northAd =
                campaign("COLLECTOR_PROFILE", rules("REGION", "americas-north", "GAME", game));
        String europeAd = campaign("COLLECTOR_PROFILE", rules("REGION", "europe", "GAME", game));

        List<String> served = served(viewer.uid(), "SEARCH_SPONSORED", null);
        assertThat(served).contains(ontarioAd, canadaAd).doesNotContain(quebecAd);
        assertThat(served(viewer.uid(), "COLLECTOR_PROFILE", null))
                .contains(northAd)
                .doesNotContain(europeAd);
        // A signed-out visitor has no location: no country or subdivision rule matches; the page's
        // region targets REGION rules.
        assertThat(served(null, "SEARCH_SPONSORED", null)).doesNotContain(ontarioAd, canadaAd);
        assertThat(served(null, "COLLECTOR_PROFILE", "europe"))
                .contains(europeAd)
                .doesNotContain(northAd);
        // Browsing another region: the viewer's own country no longer targets.
        assertThat(served(viewer.uid(), "SEARCH_SPONSORED", "europe"))
                .doesNotContain(ontarioAd, canadaAd);

        // Admin validation of the new kinds; the old geography kinds are gone.
        String campaignId = campaignOf(ontarioAd);
        for (List<Map<String, String>> invalid :
                List.of(
                        rules("REGION", "Montréal"),
                        rules("COUNTRY", "Canada"),
                        rules("SUBDIVISION", "45.5,-73.5"),
                        rules("GEO_CELL", "r5058c-5438"),
                        rules("REGION_LABEL", "Montréal"))) {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/ads/campaigns/" + campaignId + "/targeting",
                    admin,
                    Map.of("rules", invalid),
                    400);
        }

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
                .doesNotContain("Ottawa")
                .doesNotContain(viewer.id().toString());
    }

    /** Campaign id of a creative (admin campaign list). */
    private String campaignOf(String creativeId) {
        return testUsers
                .query("SELECT campaign_id FROM ad_creative WHERE id = ?::uuid", creativeId)
                .get(0)
                .get("campaign_id")
                .toString();
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
                                "user_location",
                                "profileCityOf",
                                "city()",
                                "getMine",
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
        callJson(HttpMethod.GET, "/api/v1/ads?placement=MAP_PANEL&region=mars", null, null, 400);
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

    JsonNode ads(@Nullable String uid, String placement, @Nullable String region) {
        String path =
                "/api/v1/ads?placement="
                        + placement
                        + (region == null
                                ? "&game=" + game
                                : "&game=" + game + "&region=" + region);
        return callJson(HttpMethod.GET, path, uid, null, 200);
    }

    List<String> served(@Nullable String uid, String placement, @Nullable String region) {
        List<String> ids = new ArrayList<>();
        ads(uid, placement, region).forEach(ad -> ids.add(ad.path("creativeId").asString()));
        return ids;
    }
}
