package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 9 protected trade flow with the fake provider: the seller onboards, the buyer pays through
 * the fake checkout (a signed synthetic webhook secures the payment), the seller ships, the buyer
 * confirms receipt, the payout is released and the trade COMPLETED. Also: failed payments can be
 * retried, a payment secured after the trade was cancelled is refunded at once.
 */
class ProtectedPaymentFlowIT extends AbstractPaymentsIT {

    @Test
    void payShipConfirmReleasesThePayoutAndCompletesTheTrade() {
        Collector seller = member("pp-seller");
        Collector buyer = member("pp-buyer");
        String tradeId = protectedTrade(seller, buyer, "60.00");
        String itemId = itemOf(tradeId);
        JsonNode awaiting = trade(buyer, tradeId, 200);
        assertThat(awaiting.path("allowedOperations").toString()).contains("PAY");
        assertThat(awaiting.path("payment").isNull()).isTrue();

        // The seller has no payout account yet.
        JsonNode notReady =
                callJson(HttpMethod.GET, "/api/v1/me/seller-account", seller.uid(), null, 200);
        assertThat(notReady.path("status").asString()).isEqualTo("NOT_STARTED");
        assertThat(notReady.path("provider").asString()).isEqualTo("fake");
        assertThat(pay(buyer, tradeId, 409).path("errorCode").asString())
                .isEqualTo("SELLER_NOT_ONBOARDED");
        awaitNotificationEvent(seller, "PAYMENT_UPDATE", "SELLER_ONBOARDING_NEEDED");
        callJson(
                HttpMethod.POST,
                "/api/v1/me/seller-account/onboarding",
                seller.uid(),
                Map.of("returnUrl", "https://evil.example/steal"),
                400);
        JsonNode onboarding = onboard(seller);
        assertThat(onboarding.path("url").asString())
                .isEqualTo("/settings/payouts?onboarding=complete");
        JsonNode ready =
                callJson(HttpMethod.GET, "/api/v1/me/seller-account", seller.uid(), null, 200);
        assertThat(ready.path("ready").asBoolean()).isTrue();
        assertThat(ready.toString()).doesNotContain("fake_acct_");

        // Roles: the seller cannot pay, the buyer cannot ship.
        assertThat(pay(seller, tradeId, 403).path("errorCode").asString()).isEqualTo("FORBIDDEN");
        JsonNode payment = pay(buyer, tradeId, 200);
        assertThat(payment.path("status").asString()).isEqualTo("REQUIRES_ACTION");
        assertThat(payment.path("provider").asString()).isEqualTo("fake");
        assertThat(payment.path("amount").decimalValue()).isEqualByComparingTo("60.00");
        assertThat(payment.path("platformFee").decimalValue()).isEqualByComparingTo("3.00");
        assertThat(payment.path("sellerAmount").decimalValue()).isEqualByComparingTo("57.00");
        assertThat(payment.path("clientSecret").isNull()).isTrue();
        String ref = refOf(payment);
        assertThat(pay(buyer, tradeId, 200).path("paymentId").asString())
                .as("an open checkout is answered again")
                .isEqualTo(payment.path("paymentId").asString());

        JsonNode checkout =
                callJson(HttpMethod.GET, "/api/v1/payments/fake/" + ref, buyer.uid(), null, 200);
        assertThat(checkout.path("summary").asString()).contains("60.00 CAD");
        callJson(HttpMethod.GET, "/api/v1/payments/fake/" + ref, seller.uid(), null, 404);
        JsonNode buyerView = trade(buyer, tradeId, 200);
        assertThat(buyerView.path("payment").path("checkoutUrl").asString())
                .isEqualTo("/checkout/fake/" + ref);
        assertThat(trade(seller, tradeId, 200).path("payment").path("checkoutUrl").isNull())
                .as("only the buyer sees the checkout")
                .isTrue();

        JsonNode receipt = confirmCheckout(buyer, ref, null);
        assertThat(receipt.path("type").asString()).isEqualTo("payment.secured");
        assertThat(receipt.path("duplicate").asBoolean()).isFalse();
        JsonNode paid = awaitTradeStatus(seller, tradeId, "PAID");
        assertThat(paid.path("payment").path("status").asString()).isEqualTo("SECURED");
        assertThat(paid.path("nextAction").path("action").asString()).isEqualTo("SHIP");
        assertThat(paid.path("allowedOperations").toString()).contains("SHIP");
        JsonNode shipNow = awaitNotificationEvent(seller, "PAYMENT_UPDATE", "SECURED");
        assertThat(shipNow.path("title").asString()).startsWith("Payment secured: ship");
        callJson(
                HttpMethod.POST,
                "/api/v1/payments/fake/" + ref + "/confirm",
                buyer.uid(),
                null,
                409);

        ship(buyer, tradeId, 403);
        tradeAction(buyer, tradeId, "confirm-receipt", 409);
        JsonNode shipped = ship(seller, tradeId, 200);
        assertThat(shipped.path("status").asString()).isEqualTo("SHIPPED");
        assertThat(shipped.path("shipment").path("carrier").asString()).isEqualTo("Postal service");
        Instant windowEnds =
                Instant.parse(shipped.path("payment").path("disputeWindowEndsAt").asString());
        assertThat(Duration.between(Instant.now(), windowEnds).toDays()).isBetween(6L, 7L);
        ship(seller, tradeId, 409);
        JsonNode buyerShipped = trade(buyer, tradeId, 200);
        assertThat(buyerShipped.path("nextAction").path("action").asString())
                .isEqualTo("CONFIRM_RECEIPT");
        assertThat(buyerShipped.path("allowedOperations").toString())
                .contains("CONFIRM_RECEIPT")
                .contains("OPEN_DISPUTE");
        awaitNotificationEvent(buyer, "SHIPMENT_STATUS", "SHIPPED");

        tradeAction(seller, tradeId, "confirm-receipt", 403);
        JsonNode completed = tradeAction(buyer, tradeId, "confirm-receipt", 200);
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(completed.path("payment").path("status").asString()).isEqualTo("PAID_OUT");
        assertThat(completed.path("payment").path("payoutAmount").decimalValue())
                .isEqualByComparingTo("57.00");
        assertThat(completed.path("payment").path("payoutFrozen").asBoolean()).isFalse();
        assertThat(completed.path("shipment").path("deliveredAt").isNull()).isFalse();
        assertThat(timeline(completed))
                .containsSubsequence(
                        "CREATED",
                        "PAYMENT_STARTED",
                        "PAYMENT_SECURED",
                        "SHIPPED",
                        "RECEIPT_CONFIRMED",
                        "PAYOUT_RELEASED",
                        "COMPLETED");
        assertThat(paymentEvents(tradeId))
                .containsExactly("CREATED", "SECURED", "SHIPPED", "PAYOUT_RELEASED");
        assertThat(quantityOf(itemId)).isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE kind = 'TRADE' AND"
                                        + " subject_id = ?::uuid",
                                tradeId))
                .isEqualTo(1);
        assertThat(fakeProvider.calls()).anyMatch(call -> call.contains("57.00 CAD"));
        tradeAction(buyer, tradeId, "confirm-receipt", 409);
        awaitNotificationEvent(seller, "PAYMENT_UPDATE", "PAYOUT_RELEASED");
        assertThat(completed.toString()).doesNotContain("fake_pi_").doesNotContain("fake_tr_");
    }

    @Test
    void aFailedPaymentCanBeRetried() {
        Collector seller = member("pp2-seller");
        Collector buyer = member("pp2-buyer");
        String tradeId = protectedTrade(seller, buyer, "25.50");
        onboard(seller);
        String first = refOf(pay(buyer, tradeId, 200));
        confirmCheckout(buyer, first, "FAILED");
        awaitPaymentStatus(tradeId, "FAILED");
        JsonNode failed = trade(buyer, tradeId, 200);
        assertThat(failed.path("status").asString()).isEqualTo("AWAITING_PAYMENT");
        assertThat(failed.path("payment").path("status").asString()).isEqualTo("FAILED");
        assertThat(timeline(failed)).contains("PAYMENT_FAILED");
        awaitNotificationEvent(buyer, "PAYMENT_UPDATE", "FAILED");

        JsonNode retry = pay(buyer, tradeId, 200);
        String second = refOf(retry);
        assertThat(second).isNotEqualTo(first);
        assertThat(retry.path("status").asString()).isEqualTo("REQUIRES_ACTION");
        callJson(HttpMethod.GET, "/api/v1/payments/fake/" + first, buyer.uid(), null, 404);
        confirmCheckout(buyer, second, "SUCCEEDED");
        awaitTradeStatus(buyer, tradeId, "PAID");
        assertThat(paymentEvents(tradeId))
                .containsExactly("CREATED", "FAILED", "CHECKOUT_RESTARTED", "SECURED");
    }

    @Test
    void aPaymentSecuredAfterTheTradeWasCancelledIsRefundedAtOnce() {
        Collector seller = member("pp3-seller");
        Collector buyer = member("pp3-buyer");
        String tradeId = protectedTrade(seller, buyer, "30.00");
        onboard(seller);
        String ref = refOf(pay(buyer, tradeId, 200));
        callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/cancel",
                seller.uid(),
                Map.of("reason", "Sold elsewhere"),
                200);
        awaitPaymentStatus(tradeId, "CANCELLED");
        assertThat(timeline(trade(buyer, tradeId, 200))).contains("PAYMENT_CANCELLED");

        // The buyer had already paid at the provider: the late webhook refunds at once.
        JsonNode receipt =
                postWebhook(
                        fakeProvider.syntheticEvent("payment.secured", Map.of("paymentRef", ref)),
                        200);
        assertThat(receipt.path("duplicate").asBoolean()).isFalse();
        awaitPaymentStatus(tradeId, "REFUNDED");
        JsonNode cancelled = trade(buyer, tradeId, 200);
        assertThat(cancelled.path("status").asString()).isEqualTo("CANCELLED");
        assertThat(cancelled.path("payment").path("refundedAmount").decimalValue())
                .isEqualByComparingTo("30.00");
        assertThat(paymentEvents(tradeId)).contains("SECURED", "REFUNDED", "AUTO_REFUNDED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM payment_refund r JOIN payment p ON p.id ="
                                        + " r.payment_id WHERE p.trade_id = ?::uuid AND r.source ="
                                        + " 'SYSTEM' AND r.status = 'SUCCEEDED'",
                                tradeId))
                .isEqualTo(1);
        awaitNotificationEvent(buyer, "PAYMENT_UPDATE", "REFUNDED");
    }
}
