package com.orenjitrade.api.ads;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.AbstractPhase10IT;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 ad delivery and administration: impressions and clicks recorded once per signed serve
 * token (forged or foreign tokens refused), click redirects, statistics and derived spend, budget
 * exhaustion, per-viewer frequency caps, conversions through the internal route, admin validation
 * (never coordinates in targeting) and the audit trail.
 */
class AdsDeliveryIT extends AbstractPhase10IT {

    String admin;
    String advertiserId;
    String game;

    @BeforeEach
    void setUp() {
        flag("advertising", true);
        admin = staff("ads-delivery-admin", Role.ADMIN);
        advertiserId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/admin/ads/advertisers",
                                admin,
                                Map.of(
                                        "name",
                                        "Fictional Delivery Advertiser",
                                        "contactEmail",
                                        "ads@accessories.example"),
                                201)
                        .path("id")
                        .asString();
        game = "zz-" + Long.toHexString(ThreadLocalRandom.current().nextLong() & 0xffffffL);
    }

    @Test
    void impressionsAndClicksAreRecordedOncePerServeAndSpendTheBudget() {
        // CPC 0.40 with a 0.50 budget: after one click the next click is no longer affordable.
        JsonNode campaign = campaign("CPC", "0.50", "0.40", null);
        String campaignId = campaign.path("campaign").path("id").asString();
        String creativeId = creative(campaignId, "SEARCH_SPONSORED");
        Member viewer = member("ads-delivery-viewer");

        JsonNode ad = only(viewer.uid(), creativeId);
        String token = ad.path("impressionToken").asString();
        impression(creativeId, token, 204);
        impression(creativeId, token, 204);
        impression(creativeId, "v1.forged.token", 400);
        String otherCreative = creative(campaignId, "MAP_PANEL");
        impression(otherCreative, token, 400);

        EntityExchangeResult<byte[]> click = click(ad.path("clickUrl").asString());
        assertThat(click.getStatus().value()).isEqualTo(302);
        assertThat(click.getResponseHeaders().getLocation())
                .hasToString("https://accessories.example/test");
        click(ad.path("clickUrl").asString());
        assertThat(click("/api/v1/ads/" + UUID.randomUUID() + "/click").getStatus().value())
                .isEqualTo(404);
        // A click without a valid token still redirects but is not counted.
        assertThat(click("/api/v1/ads/" + creativeId + "/click?token=nope").getStatus().value())
                .isEqualTo(302);

        JsonNode stats =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/ads/campaigns/" + campaignId + "/stats",
                        admin,
                        null,
                        200);
        assertThat(stats.path("totals").path("impressions").asLong()).isEqualTo(1);
        assertThat(stats.path("totals").path("clicks").asLong()).isEqualTo(1);
        assertThat(stats.path("totals").path("ctrPercent").decimalValue())
                .isEqualByComparingTo("100.00");
        assertThat(stats.path("spent").decimalValue()).isEqualByComparingTo("0.40");
        assertThat(stats.path("remainingBudget").decimalValue()).isEqualByComparingTo("0.10");
        assertThat(stats.path("daily").size()).isEqualTo(1);
        assertThat(stats.path("daily").get(0).path("spent").decimalValue())
                .isEqualByComparingTo("0.40");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM ad_impression WHERE creative_id = ?::uuid"
                                        + " AND user_hash ~ '^[0-9a-f]{32}$'",
                                creativeId))
                .as("impressions carry a pseudonymous hash only")
                .isEqualTo(1);

        // The budget no longer covers a click: the campaign stops serving.
        assertThat(servedIds(viewer.uid(), "SEARCH_SPONSORED")).doesNotContain(creativeId);

        // Conversions of a recorded click, once per kind.
        String clickId =
                testUsers
                        .query(
                                "SELECT id::text AS id FROM ad_click WHERE creative_id = ?::uuid",
                                creativeId)
                        .get(0)
                        .get("id")
                        .toString();
        JsonNode first =
                conversion(
                        clickId, Map.of("kind", "PURCHASE", "value", 12.5, "currency", "CAD"), 200);
        assertThat(first.path("recorded").asBoolean()).isTrue();
        assertThat(
                        conversion(clickId, Map.of("kind", "PURCHASE"), 200)
                                .path("recorded")
                                .asBoolean())
                .isFalse();
        conversion(UUID.randomUUID().toString(), Map.of("kind", "SIGNUP"), 404);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/admin/ads/campaigns/" + campaignId,
                                        admin,
                                        null,
                                        200)
                                .path("totals")
                                .path("conversions")
                                .asLong())
                .isEqualTo(1);
    }

    @Test
    void frequencyCapsLimitImpressionsPerViewerAndDay() {
        JsonNode campaign = campaign("CPM", "100.00", "5.00", 1);
        String creativeId =
                creative(campaign.path("campaign").path("id").asString(), "INVENTORY_SIDEBAR");
        Member viewer = member("ads-cap-viewer");
        Member other = member("ads-cap-other");

        JsonNode ad = only(viewer.uid(), creativeId, "INVENTORY_SIDEBAR");
        impression(creativeId, ad.path("impressionToken").asString(), 204);
        assertThat(servedIds(viewer.uid(), "INVENTORY_SIDEBAR")).doesNotContain(creativeId);
        assertThat(servedIds(other.uid(), "INVENTORY_SIDEBAR")).contains(creativeId);
    }

    @Test
    void adminValidationKeepsCoordinatesOutAndWritesAreAudited() {
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/ads/advertisers",
                admin,
                Map.of("name", "Bad", "contactEmail", "not-an-email"),
                400);
        Map<String, Object> campaign = campaignBody("CPC", "10.00", "0", null);
        callJson(HttpMethod.POST, "/api/v1/admin/ads/campaigns", admin, campaign, 400);
        Map<String, Object> reversed = campaignBody("FLAT", "10.00", null, null);
        reversed.put("endAt", Instant.now().minus(2, ChronoUnit.DAYS).toString());
        callJson(HttpMethod.POST, "/api/v1/admin/ads/campaigns", admin, reversed, 400);
        Map<String, Object> unknownAdvertiser = campaignBody("FLAT", "10.00", null, null);
        unknownAdvertiser.put("advertiserId", UUID.randomUUID().toString());
        callJson(HttpMethod.POST, "/api/v1/admin/ads/campaigns", admin, unknownAdvertiser, 400);

        String campaignId =
                campaign("FLAT", "10.00", null, null).path("campaign").path("id").asString();
        for (List<Map<String, String>> rules :
                List.of(
                        AdsTargetingIT.rules("GEO_CELL", "45.522,-73.581"),
                        AdsTargetingIT.rules("REGION_LABEL", "near 45.522"),
                        AdsTargetingIT.rules("PLAN", "GOLD"),
                        AdsTargetingIT.rules("GAME", "Not A Slug!"))) {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/ads/campaigns/" + campaignId + "/targeting",
                    admin,
                    Map.of("rules", rules),
                    400);
        }
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/ads/campaigns/" + campaignId + "/targeting",
                admin,
                Map.of("rules", List.of(Map.of("kind", "POINT", "value", "x"))),
                400);
        JsonNode targeted =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/admin/ads/campaigns/" + campaignId + "/targeting",
                        admin,
                        Map.of(
                                "rules",
                                AdsTargetingIT.rules(
                                        "PLAN", "free", "SUBDIVISION", "ca-qc", "GAME", game)),
                        200);
        assertThat(targeted.path("targeting").toString()).contains("FREE").contains("CA-QC");

        Map<String, Object> creative = creativeBody("MAP_PANEL");
        creative.put("landingUrl", "javascript:alert(1)");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/ads/campaigns/" + campaignId + "/creatives",
                admin,
                creative,
                400);
        creative.put("landingUrl", "//evil.example");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/ads/campaigns/" + campaignId + "/creatives",
                admin,
                creative,
                400);
        creative.put("landingUrl", "/premium");
        String creativeId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/admin/ads/campaigns/" + campaignId + "/creatives",
                                admin,
                                creative,
                                201)
                        .path("id")
                        .asString();
        creative.put("status", "PAUSED");
        assertThat(
                        callJson(
                                        HttpMethod.PUT,
                                        "/api/v1/admin/ads/creatives/" + creativeId,
                                        admin,
                                        creative,
                                        200)
                                .path("status")
                                .asString())
                .isEqualTo("PAUSED");
        Map<String, Object> paused = campaignBody("FLAT", "10.00", null, null);
        paused.put("status", "PAUSED");
        assertThat(
                        callJson(
                                        HttpMethod.PUT,
                                        "/api/v1/admin/ads/campaigns/" + campaignId,
                                        admin,
                                        paused,
                                        200)
                                .path("campaign")
                                .path("status")
                                .asString())
                .isEqualTo("PAUSED");
        JsonNode list =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/ads/campaigns?advertiserId=" + advertiserId,
                        admin,
                        null,
                        200);
        assertThat(list.path("totalItems").asInt()).isEqualTo(1);
        callJson(HttpMethod.GET, "/api/v1/admin/ads/placements", admin, null, 200);
        callJson(HttpMethod.GET, "/api/v1/admin/ads/advertisers", admin, null, 200);

        assertThat(
                        testUsers.query(
                                "SELECT action FROM audit_log WHERE target_id IN (?, ?, ?)"
                                        + " ORDER BY occurred_at",
                                advertiserId,
                                campaignId,
                                creativeId))
                .extracting(row -> row.get("action").toString())
                .contains(
                        "ads.advertiser.create",
                        "ads.campaign.create",
                        "ads.targeting.update",
                        "ads.creative.create",
                        "ads.creative.update",
                        "ads.campaign.update");
    }

    // ---------------------------------------------------------------------------------------

    JsonNode campaign(
            String pricing, String budget, @Nullable String bid, @Nullable Integer frequencyCap) {
        JsonNode created =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/ads/campaigns",
                        admin,
                        campaignBody(pricing, budget, bid, frequencyCap),
                        201);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/ads/campaigns/"
                        + created.path("campaign").path("id").asString()
                        + "/targeting",
                admin,
                Map.of("rules", AdsTargetingIT.rules("GAME", game)),
                200);
        return created;
    }

    Map<String, Object> campaignBody(
            String pricing, String budget, @Nullable String bid, @Nullable Integer frequencyCap) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("advertiserId", advertiserId);
        body.put("name", "Delivery test " + game);
        body.put("status", "ACTIVE");
        body.put("startAt", Instant.now().minus(1, ChronoUnit.HOURS).toString());
        body.put("budgetTotal", budget);
        body.put("currency", "CAD");
        body.put("pricing", pricing);
        if (bid != null) {
            body.put("bidAmount", bid);
        }
        body.put("priority", 100);
        if (frequencyCap != null) {
            body.put("frequencyCapPerDay", frequencyCap);
        }
        return body;
    }

    Map<String, Object> creativeBody(String placement) {
        Map<String, Object> creative = new LinkedHashMap<>();
        creative.put("placement", placement);
        creative.put("headline", "Fictional sleeves");
        creative.put("body", "A fictional product for tests.");
        creative.put("ctaLabel", "Look");
        creative.put("landingUrl", "https://accessories.example/test");
        creative.put("status", "ACTIVE");
        return creative;
    }

    String creative(String campaignId, String placement) {
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/ads/campaigns/" + campaignId + "/creatives",
                        admin,
                        creativeBody(placement),
                        201)
                .path("id")
                .asString();
    }

    JsonNode only(String uid, String creativeId) {
        return only(uid, creativeId, "SEARCH_SPONSORED");
    }

    JsonNode only(String uid, String creativeId, String placement) {
        JsonNode ads =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ads?placement=" + placement + "&game=" + game,
                        uid,
                        null,
                        200);
        for (JsonNode ad : ads) {
            if (creativeId.equals(ad.path("creativeId").asString())) {
                return ad;
            }
        }
        throw new AssertionError("creative " + creativeId + " not served: " + ads);
    }

    List<String> servedIds(String uid, String placement) {
        JsonNode ads =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ads?placement=" + placement + "&game=" + game,
                        uid,
                        null,
                        200);
        List<String> ids = new java.util.ArrayList<>();
        ads.forEach(ad -> ids.add(ad.path("creativeId").asString()));
        return ids;
    }

    void impression(String creativeId, String token, int expectedStatus) {
        callJson(
                HttpMethod.POST,
                "/api/v1/ads/" + creativeId + "/impression",
                null,
                Map.of("token", token),
                expectedStatus);
    }

    EntityExchangeResult<byte[]> click(String path) {
        return http.get().uri(path).exchange().expectBody().returnResult();
    }

    JsonNode conversion(String clickId, Map<String, Object> body, int expectedStatus) {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/ads/clicks/" + clickId + "/conversions")
                        .header(
                                com.orenjitrade.api.auth.web.ServiceAuthFilter.SERVICE_TOKEN_HEADER,
                                SERVICE_TOKEN)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .body(body)
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).isEqualTo(expectedStatus);
        byte[] bytes = result.getResponseBody();
        return bytes == null || bytes.length == 0
                ? tools.jackson.databind.node.MissingNode.getInstance()
                : jsonMapper.readTree(bytes);
    }
}
