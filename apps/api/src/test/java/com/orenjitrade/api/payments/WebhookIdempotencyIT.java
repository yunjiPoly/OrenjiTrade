package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.payments.infra.FakePaymentProvider;
import com.orenjitrade.api.payments.infra.FakePaymentProvider.SignedWebhook;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/**
 * Phase 9 webhook idempotency: the same provider event delivered twice (or again after it was
 * processed) is stored once and changes the payment once; unknown payments and unhandled types are
 * stored and IGNORED; every event stays in the history.
 */
class WebhookIdempotencyIT extends AbstractPaymentsIT {

    @Test
    void theSameEventTwiceChangesThePaymentOnce() {
        Collector seller = member("wi-seller");
        Collector buyer = member("wi-buyer");
        String tradeId = protectedTrade(seller, buyer, "42.00");
        onboard(seller);
        String ref = refOf(pay(buyer, tradeId, 200));

        SignedWebhook webhook =
                fakeProvider.syntheticEvent(
                        FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", ref));
        String eventId = jsonMapper.readTree(webhook.payload()).path("id").asString();
        JsonNode first = postWebhook(webhook, 200);
        JsonNode second = postWebhook(webhook, 200);
        assertThat(first.path("received").asBoolean()).isTrue();
        assertThat(first.path("duplicate").asBoolean()).isFalse();
        assertThat(first.path("webhookEventId").isNull()).isFalse();
        assertThat(second.path("duplicate").asBoolean()).isTrue();
        assertThat(second.path("webhookEventId").isNull()).isTrue();

        awaitTradeStatus(buyer, tradeId, "PAID");
        awaitWebhooksProcessed();
        // A retry after processing is still a no-op.
        assertThat(
                        postWebhook(fakeProvider.sign(webhook.payload()), 200)
                                .path("duplicate")
                                .asBoolean())
                .isTrue();

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM payment_webhook_event WHERE provider_event_id"
                                        + " = ?",
                                eventId))
                .isEqualTo(1);
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status, payment_id::text AS payment FROM"
                                                + " payment_webhook_event WHERE provider_event_id"
                                                + " = ?",
                                        eventId)
                                .get(0)
                                .get("status"))
                .isEqualTo("PROCESSED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM payment_event WHERE provider_event_id = ?",
                                eventId))
                .isEqualTo(1);
        assertThat(paymentEvents(tradeId)).containsExactly("CREATED", "SECURED");
        assertThat(
                        timeline(trade(buyer, tradeId, 200)).stream()
                                .filter("PAYMENT_SECURED"::equals)
                                .count())
                .isEqualTo(1);

        // A different event for the same payment is stored but changes nothing any more.
        JsonNode again =
                postWebhook(
                        fakeProvider.syntheticEvent(
                                FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", ref)),
                        200);
        assertThat(again.path("duplicate").asBoolean()).isFalse();
        awaitWebhooksProcessed();
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status, error FROM payment_webhook_event WHERE id ="
                                                + " ?::uuid",
                                        again.path("webhookEventId").asString())
                                .get(0))
                .containsEntry("status", "IGNORED")
                .containsEntry("error", "ALREADY_SECURED");
        assertThat(paymentEvents(tradeId)).containsExactly("CREATED", "SECURED");
    }

    @Test
    void unknownPaymentsAndUnhandledTypesAreStoredAndIgnored() {
        JsonNode unknown =
                postWebhook(
                        fakeProvider.syntheticEvent(
                                FakePaymentProvider.PAYMENT_SECURED,
                                Map.of("paymentRef", "fake_pi_does_not_exist")),
                        200);
        JsonNode unhandled =
                postWebhook(fakeProvider.syntheticEvent("charge.dispute.created", Map.of()), 200);
        awaitWebhooksProcessed();
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status, error, signature_valid FROM"
                                                + " payment_webhook_event WHERE id = ?::uuid",
                                        unknown.path("webhookEventId").asString())
                                .get(0))
                .containsEntry("status", "IGNORED")
                .containsEntry("error", "UNKNOWN_PAYMENT")
                .containsEntry("signature_valid", true);
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status, error, type FROM payment_webhook_event"
                                                + " WHERE id = ?::uuid",
                                        unhandled.path("webhookEventId").asString())
                                .get(0))
                .containsEntry("status", "IGNORED")
                .containsEntry("error", "UNHANDLED_TYPE")
                .containsEntry("type", "charge.dispute.created");
    }
}
