package com.orenjitrade.api.featureflags;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.offers.AbstractOffersIT;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * The launch configuration (2026-10-05, "discovery + messaging only"): with {@code
 * protectedPayments}, {@code premiumPlans}, {@code credits}, {@code donations}, {@code advertising}
 * and {@code mlScanning} all off — the migration state since V105 — every money route refuses with
 * the existing {@code 404 FEATURE_DISABLED} Problem Details (extension {@code feature}), ads answer
 * an empty list, and everything else keeps working end to end: map discovery, a public listing and
 * a binder, the wishlist, messaging, an offer as a plain proposal, the trade agreed and completed
 * in person, a rating and a report. The plan endpoints stay readable because the mobile client
 * reads the map radius cap from them.
 */
class LaunchConfigurationIT extends AbstractOffersIT {

    static final List<String> MONEY_FLAGS =
            List.of(
                    "protectedPayments",
                    "premiumPlans",
                    "credits",
                    "donations",
                    "advertising",
                    "mlScanning");

    record Route(HttpMethod method, String path, @Nullable String uid, @Nullable Object body) {}

    @BeforeEach
    void everyMoneyFlagOff() {
        MONEY_FLAGS.forEach(key -> flag(key, false));
    }

    @AfterEach
    void backToTheMigrationState() {
        MONEY_FLAGS.forEach(key -> flag(key, false));
    }

    @Test
    void thePublicMapShowsEveryMoneyFeatureOffAndCommunityOn() {
        JsonNode flags = callJson(HttpMethod.GET, "/api/v1/public/feature-flags", null, null, 200);
        for (String key : MONEY_FLAGS) {
            assertThat(flags.path(key).asBoolean()).as(key).isFalse();
        }
        assertThat(flags.path("publicChat").asBoolean()).isTrue();
    }

    @Test
    void discoveryMessagingAndPlainTradesWorkWithEveryMoneyFlagOff() {
        Centre centre = randomCentre();
        Collector seller = collector("launch-seller", centre);
        Collector buyer = collector("launch-buyer", centre.offset(2, 1));

        // Map discovery: both are discoverable and find each other (approximate positions only).
        JsonNode nearby =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/nearby?lat="
                                + centre.lat()
                                + "&lng="
                                + centre.lng()
                                + "&radiusKm=10",
                        buyer.uid(),
                        null,
                        200);
        List<String> handles = new ArrayList<>();
        (nearby.has("collectors") ? nearby.path("collectors") : nearby.path("items"))
                .forEach(marker -> handles.add(marker.path("handle").asString()));
        assertThat(handles).contains(seller.handle());

        // Inventory, binder and wishlist.
        String itemId = listing(seller, "TRADE_OR_SALE", 2);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                seller.uid(),
                                InventoryTestSupport.binder("Launch binder", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, buyer.uid(), null, 200);
        createWish(buyer, wish(printing(AZURE_FR), true));

        // Messaging.
        String conversationId = conversation(buyer, seller);
        texts(buyer, conversationId, 1);

        // An offer is a plain proposal: payment protection cannot even be requested.
        Map<String, Object> protectedOffer = new LinkedHashMap<>(cash(itemId, "30.00"));
        protectedOffer.put("protectionRequested", true);
        JsonNode refused = makeOffer(buyer, protectedOffer, 404);
        assertThat(refused.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
        assertThat(refused.path("feature").asString()).isEqualTo("protectedPayments");

        String offerId = makeOffer(buyer, cash(itemId, "30.00"), 201).path("id").asString();
        String tradeId = act(seller, offerId, "accept", null, 200).path("tradeId").asString();
        JsonNode agreed = trade(buyer, tradeId, 200);
        assertThat(agreed.path("status").asString()).isEqualTo("AGREED");
        assertThat(agreed.path("protectionEnabled").asBoolean()).isFalse();
        assertThat(agreed.path("payment").isNull()).isTrue();
        assertThat(agreed.path("nextAction").path("action").asString()).isEqualTo("MEET");
        assertThat(agreed.toString()).doesNotContain("PAY");

        // Paying is a money route: refused even on an agreed trade.
        JsonNode pay = tradeAction(buyer, tradeId, "pay", 404);
        assertThat(pay.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
        assertThat(pay.path("feature").asString()).isEqualTo("protectedPayments");

        // The trade completes in person and unlocks a rating; a report still goes through.
        tradeAction(buyer, tradeId, "complete", 200);
        JsonNode completed = tradeAction(seller, tradeId, "complete", 200);
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        JsonNode eligibility =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + seller.id(),
                        buyer.uid(),
                        null,
                        200);
        assertThat(eligibility.path("eligible").asBoolean()).isTrue();
        String tradeInteraction = null;
        for (JsonNode interaction : eligibility.path("interactions")) {
            if ("TRADE".equals(interaction.path("kind").asString())) {
                tradeInteraction = interaction.path("id").asString();
            }
        }
        assertThat(tradeInteraction).isNotNull();
        Map<String, Object> rating = new LinkedHashMap<>();
        rating.put("interactionId", tradeInteraction);
        rating.put("overall", 5);
        callJson(HttpMethod.POST, "/api/v1/ratings", buyer.uid(), rating, 201);
        report(buyer, seller, "SPAM", null, 201);

        // Plans stay readable (the mobile client reads the map radius cap there); the plan
        // answer still names the upgrade page as data, clients hide it while the flag is off.
        callJson(HttpMethod.GET, "/api/v1/plans", null, null, 200);
        callJson(HttpMethod.GET, "/api/v1/me/plan", buyer.uid(), null, 200);
    }

    @Test
    void everyMoneyRouteRefusesWithFeatureDisabledAndAdsAreEmpty() {
        Collector member = member("launch-money");
        List<String> failures = new ArrayList<>();
        Map<String, List<Route>> byFlag = new LinkedHashMap<>();
        byFlag.put(
                "premiumPlans",
                List.of(
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/me/subscription/checkout",
                                member.uid(),
                                Map.of("planCode", "PREMIUM"))));
        byFlag.put(
                "credits",
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
                                Map.of("code", "COLLECTOR1"))));
        byFlag.put(
                "donations",
                List.of(
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/donations/checkout",
                                member.uid(),
                                Map.of("amount", 5, "currency", "CAD")),
                        new Route(HttpMethod.GET, "/api/v1/me/donations", member.uid(), null),
                        new Route(
                                HttpMethod.GET,
                                "/api/v1/public/donations/supporters",
                                null,
                                null)));
        byFlag.put(
                "protectedPayments",
                List.of(
                        new Route(HttpMethod.GET, "/api/v1/me/seller-account", member.uid(), null),
                        new Route(
                                HttpMethod.POST,
                                "/api/v1/me/seller-account/onboarding",
                                member.uid(),
                                null)));
        byFlag.forEach(
                (feature, routes) ->
                        routes.forEach(route -> expectDisabled(feature, route, failures)));
        assertThat(failures).as("routes answering something else than FEATURE_DISABLED").isEmpty();

        // Sponsored placements: an empty list for everybody, never an error.
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/ads?placement=MAP_PANEL", null, null, 200)
                                .size())
                .isZero();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/ads?placement=MAP_PANEL",
                                        member.uid(),
                                        null,
                                        200)
                                .size())
                .isZero();
    }

    private void flag(String key, boolean enabled) {
        testUsers.update(
                "UPDATE feature_flag SET enabled = ?, rollout_percent = 100 WHERE key = ?",
                enabled,
                key);
        featureFlags.invalidate();
    }

    private void expectDisabled(String feature, Route route, List<String> failures) {
        String label = route.method() + " " + route.path();
        EntityExchangeResult<byte[]> result =
                call(route.method(), route.path(), route.uid(), route.body());
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        if (result.getStatus().value() != 404) {
            failures.add(label + ": " + result.getStatus().value() + " " + text);
            return;
        }
        JsonNode problem = jsonMapper.readTree(text);
        if (!"FEATURE_DISABLED".equals(problem.path("errorCode").asString())
                || !feature.equals(problem.path("feature").asString())
                || problem.path("requestId").asString().isBlank()) {
            failures.add(label + ": " + text);
        }
    }
}
