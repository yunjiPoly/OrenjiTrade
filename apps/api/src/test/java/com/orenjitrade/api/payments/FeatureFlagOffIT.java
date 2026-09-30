package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.payments.infra.FakePaymentProvider;
import com.orenjitrade.api.payments.infra.FakePaymentProvider.SignedWebhook;
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
 * Phase 9 feature flag: with {@code protectedPayments} off, every member payment route, the fake
 * checkout, the provider webhook and the internal fake-payment routes answer 404 FEATURE_DISABLED
 * (extension feature = protectedPayments), even for a protected trade and a dispute created while
 * it was on; admins keep managing existing payments.
 */
class FeatureFlagOffIT extends AbstractPaymentsIT {

    record Route(HttpMethod method, String path, @Nullable String uid, @Nullable Object body) {}

    @Test
    void everyPaymentRouteIsFeatureDisabledWhileTheFlagIsOff() {
        Collector seller = member("ff-seller");
        Collector buyer = member("ff-buyer");
        String tradeId = protectedTrade(seller, buyer, "22.00");
        String ref = paid(seller, buyer, tradeId);
        String disputeId = openDispute(buyer, tradeId, "OTHER", 201).path("id").asString();
        String other = protectedTrade(seller, buyer, "11.00");
        SignedWebhook webhook =
                fakeProvider.syntheticEvent(
                        FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", ref));

        protectedPayments(false);

        List<Route> routes = new ArrayList<>();
        routes.add(new Route(HttpMethod.GET, "/api/v1/me/seller-account", seller.uid(), null));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/me/seller-account/onboarding",
                        seller.uid(),
                        null));
        routes.add(
                new Route(HttpMethod.POST, "/api/v1/trades/" + other + "/pay", buyer.uid(), null));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/trades/" + tradeId + "/ship",
                        seller.uid(),
                        null));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/trades/" + tradeId + "/confirm-receipt",
                        buyer.uid(),
                        null));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/trades/" + other + "/disputes",
                        buyer.uid(),
                        Map.of("reason", "OTHER", "description", "Flag off")));
        routes.add(new Route(HttpMethod.GET, "/api/v1/disputes/" + disputeId, buyer.uid(), null));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/disputes/" + disputeId + "/evidence",
                        buyer.uid(),
                        Map.of("kind", "TEXT", "body", "Flag off")));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/disputes/" + disputeId + "/messages",
                        seller.uid(),
                        Map.of("body", "Flag off")));
        routes.add(new Route(HttpMethod.GET, "/api/v1/payments/fake/" + ref, buyer.uid(), null));
        routes.add(
                new Route(
                        HttpMethod.POST,
                        "/api/v1/payments/fake/" + ref + "/confirm",
                        buyer.uid(),
                        null));

        List<String> failures = new ArrayList<>();
        for (Route route : routes) {
            expectDisabled(
                    route.method() + " " + route.path(),
                    call(route.method(), route.path(), route.uid(), route.body()),
                    failures);
        }
        expectDisabled(
                "webhook", postWebhook("fake", webhook.payload(), webhook.headers()), failures);
        for (String action : new String[] {"succeed", "fail"}) {
            EntityExchangeResult<byte[]> internal =
                    http.post()
                            .uri("/internal/fake-payments/" + ref + "/" + action)
                            .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                            .exchange()
                            .expectBody()
                            .returnResult();
            expectDisabled("internal " + action, internal, failures);
        }
        assertThat(failures).as("routes answering something else than FEATURE_DISABLED").isEmpty();

        // Nothing changed; admins still see and manage the existing payment and dispute.
        assertThat(trade(buyer, tradeId, 200).path("status").asString()).isEqualTo("DISPUTED");
        String admin = staff("ff-admin", com.orenjitrade.api.auth.domain.Role.ADMIN);
        JsonNode adminView =
                callJson(HttpMethod.GET, "/api/v1/admin/disputes/" + disputeId, admin, null, 200);
        assertThat(adminView.path("dispute").path("status").asString()).isEqualTo("OPEN");
        callJson(HttpMethod.GET, "/api/v1/admin/payments?size=5", admin, null, 200);
    }

    private void expectDisabled(
            String label, EntityExchangeResult<byte[]> result, List<String> failures) {
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        if (result.getStatus().value() != 404) {
            failures.add(label + ": " + result.getStatus().value() + " " + text);
            return;
        }
        JsonNode problem = jsonMapper.readTree(text);
        if (!"FEATURE_DISABLED".equals(problem.path("errorCode").asString())
                || !"protectedPayments".equals(problem.path("feature").asString())) {
            failures.add(label + ": " + text);
        }
    }
}
