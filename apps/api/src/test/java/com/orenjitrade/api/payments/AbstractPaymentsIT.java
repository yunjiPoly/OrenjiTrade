package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.offers.AbstractOffersIT;
import com.orenjitrade.api.payments.domain.PaymentSettings;
import com.orenjitrade.api.payments.infra.FakePaymentProvider;
import com.orenjitrade.api.payments.infra.FakePaymentProvider.SignedWebhook;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.test.web.servlet.client.RestTestClient;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the Phase 9 payment protection tests: the protectedPayments flag is on for each test
 * (and off again afterwards, the migration default), protected trades between two fresh collectors,
 * seller onboarding, the fake checkout, raw webhooks, shipping and the auto-release job.
 */
public abstract class AbstractPaymentsIT extends AbstractOffersIT {

    @Autowired protected FakePaymentProvider fakeProvider;

    @Autowired protected PaymentSettings paymentSettings;

    @BeforeEach
    void enableProtectedPayments() {
        protectedPayments(true);
    }

    @AfterEach
    void restoreProtectedPayments() {
        protectedPayments(false);
    }

    /** A protected trade (AWAITING_PAYMENT) of {@code buyer} for a SALE card of {@code seller}. */
    protected String protectedTrade(Collector seller, Collector buyer, String amount) {
        String itemId = listing(seller, "SALE", 2);
        Map<String, Object> body = cash(itemId, amount);
        body.put("protectionRequested", true);
        String offerId = makeOffer(buyer, body, 201).path("id").asString();
        String tradeId = act(seller, offerId, "accept", null, 200).path("tradeId").asString();
        assertThat(trade(buyer, tradeId, 200).path("status").asString())
                .isEqualTo("AWAITING_PAYMENT");
        return tradeId;
    }

    /** The item of a trade (its offer's card). */
    protected String itemOf(String tradeId) {
        return testUsers
                .query("SELECT item_id::text AS id FROM trade WHERE id = ?::uuid", tradeId)
                .get(0)
                .get("id")
                .toString();
    }

    /** Completes the fake payout onboarding of a seller. */
    protected JsonNode onboard(Collector seller) {
        JsonNode answer =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/me/seller-account/onboarding",
                        seller.uid(),
                        null,
                        200);
        assertThat(answer.path("account").path("status").asString()).isEqualTo("ACTIVE");
        return answer;
    }

    /** {@code POST /trades/{id}/pay}. */
    protected JsonNode pay(Collector buyer, String tradeId, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/pay",
                buyer.uid(),
                null,
                expectedStatus);
    }

    /** The provider reference of a checkout URL ({@code /checkout/fake/<ref>}). */
    protected static String refOf(JsonNode payment) {
        String url = payment.path("checkoutUrl").asString();
        assertThat(url).startsWith("/checkout/fake/");
        return url.substring("/checkout/fake/".length());
    }

    /** The buyer pays on the fake checkout ({@code POST /payments/fake/{ref}/confirm}). */
    protected JsonNode confirmCheckout(Collector buyer, String ref, @Nullable String outcome) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/payments/fake/" + ref + "/confirm",
                buyer.uid(),
                outcome == null ? null : Map.of("outcome", outcome),
                202);
    }

    /** Onboards the seller, pays and waits until the trade is PAID; returns the payment ref. */
    protected String paid(Collector seller, Collector buyer, String tradeId) {
        onboard(seller);
        String ref = refOf(pay(buyer, tradeId, 200));
        confirmCheckout(buyer, ref, null);
        awaitTradeStatus(buyer, tradeId, "PAID");
        return ref;
    }

    /** {@code POST /trades/{id}/ship} with a tracking number. */
    protected JsonNode ship(Collector seller, String tradeId, int expectedStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("carrier", "Postal service");
        body.put("trackingNumber", "TRACK-" + tradeId.substring(0, 8));
        body.put("notes", "Sleeved and in a top loader");
        return callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/ship",
                seller.uid(),
                body,
                expectedStatus);
    }

    /** Waits until the trade has {@code status} for {@code viewer}. */
    protected JsonNode awaitTradeStatus(Collector viewer, String tradeId, String status) {
        await().atMost(WAIT)
                .alias("trade " + tradeId + " " + status)
                .until(() -> status.equals(trade(viewer, tradeId, 200).path("status").asString()));
        return trade(viewer, tradeId, 200);
    }

    /** Waits until the payment of a trade has {@code status}. */
    protected void awaitPaymentStatus(String tradeId, String status) {
        await().atMost(WAIT)
                .alias("payment of " + tradeId + " " + status)
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM payment WHERE trade_id ="
                                                        + " ?::uuid AND status = ?",
                                                tradeId,
                                                status)
                                        == 1);
    }

    /** Waits until every stored webhook of the payment of a trade left RECEIVED. */
    protected void awaitWebhooksProcessed() {
        await().atMost(WAIT)
                .alias("webhooks processed")
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM payment_webhook_event WHERE"
                                                        + " status = 'RECEIVED'")
                                        == 0);
    }

    /** Posts a raw webhook body with the given headers to {@code /webhooks/payments/{provider}}. */
    protected EntityExchangeResult<byte[]> postWebhook(
            String provider, String payload, Map<String, String> headers) {
        RestTestClient.RequestBodySpec spec =
                http.post()
                        .uri("/api/v1/webhooks/payments/" + provider)
                        .contentType(MediaType.APPLICATION_JSON);
        for (Map.Entry<String, String> header : headers.entrySet()) {
            spec = spec.header(header.getKey(), header.getValue());
        }
        return spec.body(payload.getBytes(StandardCharsets.UTF_8))
                .exchange()
                .expectBody()
                .returnResult();
    }

    /** Posts a signed synthetic webhook and returns the parsed answer (status asserted). */
    protected JsonNode postWebhook(SignedWebhook webhook, int expectedStatus) {
        EntityExchangeResult<byte[]> result =
                postWebhook(FakePaymentProvider.ID, webhook.payload(), webhook.headers());
        assertThat(result.getStatus().value())
                .as("webhook -> %s", new String(result.getResponseBody(), StandardCharsets.UTF_8))
                .isEqualTo(expectedStatus);
        return json(result);
    }

    /** Opens a dispute (status asserted). */
    protected JsonNode openDispute(Collector buyer, String tradeId, String reason, int status) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/disputes",
                buyer.uid(),
                Map.of("reason", reason, "description", "Described by " + buyer.handle()),
                status);
    }

    /** Runs {@code POST /internal/jobs/payments-auto-release} with the service token. */
    protected JsonNode runAutoRelease() {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/jobs/payments-auto-release")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result);
    }

    /** Stored payment events of a trade's payment, oldest first. */
    protected List<String> paymentEvents(String tradeId) {
        List<String> events = new ArrayList<>();
        for (Map<String, Object> row :
                testUsers.query(
                        "SELECT e.event FROM payment_event e JOIN payment p ON p.id = e.payment_id"
                                + " WHERE p.trade_id = ?::uuid ORDER BY e.created_at, e.seq",
                        tradeId)) {
            events.add((String) row.get("event"));
        }
        return events;
    }

    /** A notification of {@code type} whose data carries {@code event}. */
    protected JsonNode awaitNotificationEvent(Collector collector, String type, String event) {
        await().atMost(WAIT)
                .alias(type + "/" + event + " for " + collector.handle())
                .until(() -> notificationEvent(collector, type, event) != null);
        JsonNode found = notificationEvent(collector, type, event);
        assertThat(found).isNotNull();
        return found;
    }

    private @Nullable JsonNode notificationEvent(Collector collector, String type, String event) {
        for (JsonNode notification : notificationsOfType(collector, type)) {
            if (event.equals(notification.path("data").path("event").asString())) {
                return notification;
            }
        }
        return null;
    }
}
