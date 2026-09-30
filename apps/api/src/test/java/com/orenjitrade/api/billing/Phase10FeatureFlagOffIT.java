package com.orenjitrade.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.donations.infra.FakeDonationProvider;
import com.orenjitrade.api.donations.infra.FakeDonationProvider.SignedWebhook;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 feature flags: with {@code premiumPlans}, {@code credits} or {@code donations} off,
 * their member routes (and the donation webhook and supporters list) answer 404 FEATURE_DISABLED
 * with the flag in the {@code feature} extension; with {@code advertising} off {@code GET /ads}
 * answers an empty list and impressions are not recorded; admin routes stay available.
 */
class Phase10FeatureFlagOffIT extends AbstractPhase10IT {

    @Autowired private FakeDonationProvider fakeDonations;

    record Route(HttpMethod method, String path, @Nullable String uid, @Nullable Object body) {}

    @Test
    void premiumCreditAndDonationRoutesAreFeatureDisabledWhileTheirFlagIsOff() {
        Member member = member("flags-off");
        String checkoutRef =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/me/subscription/checkout",
                                member.uid(),
                                Map.of("planCode", "PREMIUM"),
                                200)
                        .path("url")
                        .asString()
                        .replace("/checkout/fake-billing/", "");
        flag("donations", true);
        String donationRef =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/donations/checkout",
                                member.uid(),
                                Map.of("amount", 5, "currency", "CAD"),
                                201)
                        .path("url")
                        .asString()
                        .replace(FakeDonationProvider.CHECKOUT_PATH, "");
        SignedWebhook webhook =
                fakeDonations.syntheticEvent(
                        FakeDonationProvider.DONATION_SUCCEEDED,
                        Map.of("checkoutRef", donationRef));

        flag("premiumPlans", false);
        flag("credits", false);
        flag("donations", false);

        List<String> failures = new ArrayList<>();
        expectDisabled(
                "premiumPlans",
                new Route(
                        HttpMethod.POST,
                        "/api/v1/me/subscription/checkout",
                        member.uid(),
                        Map.of("planCode", "PREMIUM")),
                failures);
        expectDisabled(
                "premiumPlans",
                new Route(
                        HttpMethod.GET, "/api/v1/billing/fake/" + checkoutRef, member.uid(), null),
                failures);
        expectDisabled(
                "premiumPlans",
                new Route(
                        HttpMethod.POST,
                        "/api/v1/billing/fake/" + checkoutRef + "/confirm",
                        member.uid(),
                        null),
                failures);
        for (Route route :
                List.of(
                        new Route(HttpMethod.GET, "/api/v1/me/credits", member.uid(), null),
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/me/credits/spend",
                                member.uid(),
                                Map.of("featureKey", "premium_search_day", "idempotencyKey", "k")),
                        new Route(HttpMethod.GET, "/api/v1/me/referrals", member.uid(), null),
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/me/referrals/redeem",
                                member.uid(),
                                Map.of("code", "COLLECTOR1")))) {
            expectDisabled("credits", route, failures);
        }
        for (Route route :
                List.of(
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/donations/checkout",
                                member.uid(),
                                Map.of("amount", 5, "currency", "CAD")),
                        new Route(HttpMethod.GET, "/api/v1/me/donations", member.uid(), null),
                        new Route(
                                HttpMethod.GET,
                                "/api/v1/donations/fake/" + donationRef,
                                member.uid(),
                                null),
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/donations/fake/" + donationRef + "/confirm",
                                member.uid(),
                                null),
                        new Route(
                                HttpMethod.GET,
                                "/api/v1/public/donations/supporters",
                                null,
                                null))) {
            expectDisabled("donations", route, failures);
        }
        check(
                "donations",
                "webhook",
                postWebhook(
                        "/api/v1/webhooks/donations/fake", webhook.payload(), webhook.headers()),
                failures);
        assertThat(failures).as("routes answering something else than FEATURE_DISABLED").isEmpty();

        // The live subscription can still be cancelled; admins keep their consoles.
        callJson(HttpMethod.POST, "/api/v1/me/subscription/cancel", member.uid(), null, 200);
        String admin = staff("flags-off-admin", Role.ADMIN);
        for (String path :
                List.of(
                        "/api/v1/admin/subscriptions",
                        "/api/v1/admin/credits/ledger",
                        "/api/v1/admin/credits/products",
                        "/api/v1/admin/donations",
                        "/api/v1/admin/ads/campaigns")) {
            callJson(HttpMethod.GET, path, admin, null, 200);
        }
    }

    @Test
    void adsAnswerAnEmptyListAndRecordNothingWhileAdvertisingIsOff() {
        flag("advertising", true);
        String admin = staff("flags-off-ads", Role.ADMIN);
        String advertiser =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/admin/ads/advertisers",
                                admin,
                                Map.of("name", "Fictional Flag Advertiser"),
                                201)
                        .path("id")
                        .asString();
        String game = "zz-flag-" + member("flags-game").id().toString().substring(0, 6);
        Map<String, Object> campaign = new LinkedHashMap<>();
        campaign.put("advertiserId", advertiser);
        campaign.put("name", "Flag test");
        campaign.put("status", "ACTIVE");
        campaign.put("startAt", Instant.now().minus(1, ChronoUnit.HOURS).toString());
        campaign.put("budgetTotal", 10);
        campaign.put("currency", "CAD");
        campaign.put("pricing", "FLAT");
        campaign.put("priority", 100);
        String campaignId =
                callJson(HttpMethod.POST, "/api/v1/admin/ads/campaigns", admin, campaign, 201)
                        .path("campaign")
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/ads/campaigns/" + campaignId + "/targeting",
                admin,
                Map.of("rules", List.of(Map.of("kind", "GAME", "value", game))),
                200);
        Map<String, Object> creative = new LinkedHashMap<>();
        creative.put("placement", "MOBILE_FEED");
        creative.put("headline", "Fictional flag test");
        creative.put("ctaLabel", "Look");
        creative.put("landingUrl", "https://accessories.example/flag");
        creative.put("status", "ACTIVE");
        String creativeId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/admin/ads/campaigns/" + campaignId + "/creatives",
                                admin,
                                creative,
                                201)
                        .path("id")
                        .asString();
        String path = "/api/v1/ads?placement=MOBILE_FEED&game=" + game;
        JsonNode on = callJson(HttpMethod.GET, path, null, null, 200);
        assertThat(on.size()).isEqualTo(1);
        String token = on.get(0).path("impressionToken").asString();

        flag("advertising", false);
        assertThat(callJson(HttpMethod.GET, path, null, null, 200).size()).isZero();
        Member member = member("flags-ads-member");
        assertThat(callJson(HttpMethod.GET, path, member.uid(), null, 200).size()).isZero();
        callJson(
                HttpMethod.POST,
                "/api/v1/ads/" + creativeId + "/impression",
                null,
                Map.of("token", token),
                204);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM ad_impression WHERE creative_id = ?::uuid",
                                creativeId))
                .isZero();
    }

    private void expectDisabled(String feature, Route route, List<String> failures) {
        check(
                feature,
                route.method() + " " + route.path(),
                call(route.method(), route.path(), route.uid(), route.body()),
                failures);
    }

    private void check(
            String feature,
            String label,
            EntityExchangeResult<byte[]> result,
            List<String> failures) {
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        if (result.getStatus().value() != 404) {
            failures.add(label + ": " + result.getStatus().value() + " " + text);
            return;
        }
        JsonNode problem = jsonMapper.readTree(text);
        if (!"FEATURE_DISABLED".equals(problem.path("errorCode").asString())
                || !feature.equals(problem.path("feature").asString())) {
            failures.add(label + ": " + text);
        }
    }
}
