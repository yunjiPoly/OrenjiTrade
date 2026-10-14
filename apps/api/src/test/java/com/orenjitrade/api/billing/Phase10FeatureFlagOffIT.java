package com.orenjitrade.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 feature flags: with {@code premiumPlans} off, its member routes answer 404
 * FEATURE_DISABLED with the flag in the {@code feature} extension; admin routes stay available.
 */
class Phase10FeatureFlagOffIT extends AbstractPhase10IT {

    record Route(HttpMethod method, String path, @Nullable String uid, @Nullable Object body) {}

    @Test
    void premiumRoutesAreFeatureDisabledWhileTheirFlagIsOff() {
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

        flag("premiumPlans", false);

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
        assertThat(failures).as("routes answering something else than FEATURE_DISABLED").isEmpty();

        // The live subscription can still be cancelled; admins keep their consoles.
        callJson(HttpMethod.POST, "/api/v1/me/subscription/cancel", member.uid(), null, 200);
        String admin = staff("flags-off-admin", Role.ADMIN);
        callJson(HttpMethod.GET, "/api/v1/admin/subscriptions", admin, null, 200);
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
