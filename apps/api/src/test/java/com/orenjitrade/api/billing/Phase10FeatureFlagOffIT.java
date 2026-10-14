package com.orenjitrade.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.donations.infra.FakeDonationProvider;
import com.orenjitrade.api.donations.infra.FakeDonationProvider.SignedWebhook;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
 * with the flag in the {@code feature} extension; admin routes stay available.
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
                        "/api/v1/admin/donations")) {
            callJson(HttpMethod.GET, path, admin, null, 200);
        }
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
