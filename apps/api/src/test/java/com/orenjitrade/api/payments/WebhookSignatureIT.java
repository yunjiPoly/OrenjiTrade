package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.payments.infra.FakePaymentProvider;
import com.orenjitrade.api.payments.infra.FakePaymentProvider.SignedWebhook;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 9 webhook signatures: a missing, wrong, tampered or stale signature answers 400
 * WEBHOOK_SIGNATURE_INVALID and the event is stored IGNORED (signature_valid false, no provider
 * event id) without touching any payment; another provider's route is 404; admins browse the stored
 * events and the dashboard counts the failures.
 */
class WebhookSignatureIT extends AbstractPaymentsIT {

    @Test
    void badSignaturesAreRefusedStoredAndChangeNothing() {
        Collector seller = member("ws-seller");
        Collector buyer = member("ws-buyer");
        String tradeId = protectedTrade(seller, buyer, "20.00");
        onboard(seller);
        String ref = refOf(pay(buyer, tradeId, 200));
        String admin = staff("ws-admin", Role.ADMIN);
        long failuresBefore =
                callJson(HttpMethod.GET, "/api/v1/admin/dashboard", admin, null, 200)
                        .path("webhookFailures24h")
                        .asLong();

        SignedWebhook genuine =
                fakeProvider.syntheticEvent(
                        FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", ref));
        String tampered = genuine.payload().replace("payment.secured", "payment.failed");
        assertRefused(postWebhook("fake", tampered, genuine.headers()));
        assertRefused(postWebhook("fake", genuine.payload(), Map.of()));
        assertRefused(
                postWebhook(
                        "fake",
                        genuine.payload(),
                        Map.of(FakePaymentProvider.SIGNATURE_HEADER, "t=1,v1=00ff")));
        String stale =
                "t="
                        + Instant.now().minus(Duration.ofHours(1)).getEpochSecond()
                        + ",v1=0000000000000000000000000000000000000000000000000000000000000000";
        assertRefused(
                postWebhook(
                        "fake",
                        genuine.payload(),
                        Map.of(FakePaymentProvider.SIGNATURE_HEADER, stale)));

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM payment_webhook_event WHERE NOT"
                                        + " signature_valid AND status = 'IGNORED' AND error ="
                                        + " 'INVALID_SIGNATURE' AND provider_event_id IS NULL AND"
                                        + " received_at > now() - interval '1 minute'"))
                .isGreaterThanOrEqualTo(4);
        assertThat(paymentEvents(tradeId)).containsExactly("CREATED");
        assertThat(trade(buyer, tradeId, 200).path("status").asString())
                .isEqualTo("AWAITING_PAYMENT");

        // Only the active provider has a webhook route.
        EntityExchangeResult<byte[]> stripe =
                postWebhook("stripe", genuine.payload(), genuine.headers());
        assertThat(stripe.getStatus().value()).isEqualTo(404);

        // Admins browse every stored event; the payload only in the detail.
        JsonNode ignored =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/payments/webhooks?status=IGNORED&provider=fake&size=50",
                        admin,
                        null,
                        200);
        assertThat(ignored.path("totalItems").asLong()).isGreaterThanOrEqualTo(4);
        JsonNode first = ignored.path("items").get(0);
        assertThat(first.path("signatureValid").asBoolean()).isFalse();
        assertThat(first.path("payload").isMissingNode() || first.path("payload").isNull())
                .isTrue();
        JsonNode detail =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/payments/webhooks/" + first.path("id").asString(),
                        admin,
                        null,
                        200);
        assertThat(detail.path("payload").isObject()).isTrue();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/admin/dashboard", admin, null, 200)
                                .path("webhookFailures24h")
                                .asLong())
                .isGreaterThanOrEqualTo(failuresBefore + 4);

        // The genuine event still goes through afterwards.
        postWebhook(genuine, 200);
        awaitTradeStatus(buyer, tradeId, "PAID");
    }

    @Test
    void unreadableBodiesAreStoredAsMarkers() {
        String body = "not json at all";
        SignedWebhook signed = fakeProvider.sign(body);
        EntityExchangeResult<byte[]> result = postWebhook("fake", body, signed.headers());
        assertThat(result.getStatus().value()).isEqualTo(400);
        JsonNode problem = json(result);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM payment_webhook_event WHERE error ="
                                        + " 'UNREADABLE_PAYLOAD' AND payload ->> 'unparsable' ="
                                        + " 'true'"))
                .isGreaterThanOrEqualTo(1);
    }

    private void assertRefused(EntityExchangeResult<byte[]> result) {
        byte[] body = result.getResponseBody();
        String text = body == null ? "" : new String(body, StandardCharsets.UTF_8);
        assertThat(result.getStatus().value()).as(text).isEqualTo(400);
        assertThat(json(result).path("errorCode").asString())
                .isEqualTo("WEBHOOK_SIGNATURE_INVALID");
        assertThat(text).doesNotContain("secret");
    }
}
