package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 9 authorization: only the two parties reach a protected trade's steps and its dispute (404
 * for anybody else, 403 for the wrong party), anonymous callers get 401, internal routes need the
 * service token, admins manage payments and disputes, refunds need a SUPER_ADMIN (or an ADMIN under
 * the refund policy) and the payment settings a SUPER_ADMIN; every admin write is audited.
 */
class PaymentsAuthorizationIT extends AbstractPaymentsIT {

    @Test
    void onlyThePartiesReachATradesPaymentStepsAndDispute() {
        Collector seller = member("pa-seller");
        Collector buyer = member("pa-buyer");
        Collector stranger = member("pa-stranger");
        String tradeId = protectedTrade(seller, buyer, "40.00");
        String ref = paid(seller, buyer, tradeId);

        for (String action : new String[] {"pay", "ship", "confirm-receipt"}) {
            assertThat(tradeAction(stranger, tradeId, action, 404).path("errorCode").asString())
                    .isEqualTo("NOT_FOUND");
            assertThat(
                            call(
                                            HttpMethod.POST,
                                            "/api/v1/trades/" + tradeId + "/" + action,
                                            null,
                                            null)
                                    .getStatus()
                                    .value())
                    .isEqualTo(401);
        }
        openDispute(stranger, tradeId, "OTHER", 404);
        callJson(HttpMethod.GET, "/api/v1/payments/fake/" + ref, stranger.uid(), null, 404);
        callJson(
                HttpMethod.POST,
                "/api/v1/payments/fake/" + ref + "/confirm",
                seller.uid(),
                null,
                404);
        assertThat(
                        call(HttpMethod.GET, "/api/v1/me/seller-account", null, null)
                                .getStatus()
                                .value())
                .isEqualTo(401);
        // Internal routes need the service token (a member token is not enough).
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/internal/fake-payments/" + ref + "/succeed",
                                        buyer.uid(),
                                        null)
                                .getStatus()
                                .value())
                .isEqualTo(401);
        assertThat(
                        call(HttpMethod.POST, "/internal/jobs/payments-auto-release", null, null)
                                .getStatus()
                                .value())
                .isEqualTo(401);

        ship(buyer, tradeId, 403);
        String disputeId = openDispute(buyer, tradeId, "NOT_RECEIVED", 201).path("id").asString();
        callJson(HttpMethod.GET, "/api/v1/disputes/" + disputeId, seller.uid(), null, 200);
        callJson(HttpMethod.GET, "/api/v1/disputes/" + disputeId, stranger.uid(), null, 404);
        assertThat(
                        call(HttpMethod.GET, "/api/v1/disputes/" + disputeId, null, null)
                                .getStatus()
                                .value())
                .isEqualTo(401);
        callJson(
                HttpMethod.GET,
                "/api/v1/disputes/" + disputeId + "/evidence/" + UUID.randomUUID() + "/file",
                stranger.uid(),
                null,
                404);
        String moderator = staff("pa-mod", Role.MODERATOR);
        callJson(HttpMethod.GET, "/api/v1/disputes/" + disputeId, moderator, null, 404);
        callJson(HttpMethod.GET, "/api/v1/admin/disputes/" + disputeId, moderator, null, 403);
        callJson(HttpMethod.GET, "/api/v1/admin/disputes/" + disputeId, buyer.uid(), null, 403);
    }

    @Test
    void refundsFollowThePolicyAndSettingsNeedASuperAdmin() {
        Collector seller = member("pa2-seller");
        Collector buyer = member("pa2-buyer");
        String tradeId = protectedTrade(seller, buyer, "40.00");
        paid(seller, buyer, tradeId);
        String paymentId = trade(buyer, tradeId, 200).path("payment").path("id").asString();
        String admin = staff("pa2-admin", Role.ADMIN);
        UUID adminId = testUsers.idOf(admin);
        String superAdmin = staff("pa2-super", Role.SUPER_ADMIN);
        Map<String, Object> refund = new LinkedHashMap<>();
        refund.put("amount", new BigDecimal("5.00"));
        refund.put("reason", "Goodwill after a late shipment");

        JsonNode detail =
                callJson(HttpMethod.GET, "/api/v1/admin/payments/" + paymentId, admin, null, 200);
        assertThat(detail.path("refundAllowed").asBoolean()).isFalse();
        assertThat(detail.path("transaction").path("tradeStatus").asString()).isEqualTo("PAID");
        assertThat(detail.path("events").toString()).contains("SECURED");
        assertThat(detail.toString()).doesNotContain("fake_acct_");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/payments/" + paymentId + "/refund",
                admin,
                refund,
                403);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/payments/" + paymentId + "/refund",
                buyer.uid(),
                refund,
                403);
        Map<String, Object> tooMuch = new LinkedHashMap<>(refund);
        tooMuch.put("amount", new BigDecimal("40.01"));
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/payments/" + paymentId + "/refund",
                superAdmin,
                tooMuch,
                400);
        JsonNode refunded =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/payments/" + paymentId + "/refund",
                        superAdmin,
                        refund,
                        200);
        assertThat(refunded.path("transaction").path("refundedAmount").decimalValue())
                .isEqualByComparingTo("5.00");
        assertThat(refunded.path("transaction").path("paymentStatus").asString())
                .as("a partial refund before the payout keeps the payment secured")
                .isEqualTo("SECURED");
        assertThat(refunded.path("refunds").get(0).path("source").asString()).isEqualTo("ADMIN");
        assertThat(auditActions("PAYMENT", paymentId)).containsExactly("payment.refund");

        // Settings: ADMIN reads, SUPER_ADMIN writes (audited); the policy then lets ADMIN refund.
        JsonNode settings =
                callJson(HttpMethod.GET, "/api/v1/admin/payments/settings", admin, null, 200);
        assertThat(settings.path("disputeWindowDays").asInt()).isEqualTo(7);
        assertThat(settings.path("adminRefundsEnabled").asBoolean()).isFalse();
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/payments/settings",
                admin,
                Map.of("adminRefundsEnabled", true),
                403);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/payments/settings",
                superAdmin,
                Map.of("disputeWindowDays", 0),
                400);
        try {
            JsonNode changed =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/admin/payments/settings",
                            superAdmin,
                            Map.of("adminRefundsEnabled", true),
                            200);
            assertThat(changed.path("adminRefundsEnabled").asBoolean()).isTrue();
            assertThat(changed.path("disputeWindowDays").asInt()).isEqualTo(7);
            JsonNode byAdmin =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/admin/payments/" + paymentId + "/refund",
                            admin,
                            refund,
                            200);
            assertThat(byAdmin.path("transaction").path("refundedAmount").decimalValue())
                    .isEqualByComparingTo("10.00");
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM audit_log WHERE action ="
                                            + " 'payment.refund' AND target_id = ? AND"
                                            + " actor_user_id = ?",
                                    paymentId,
                                    adminId))
                    .isEqualTo(1);
        } finally {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/payments/settings",
                    superAdmin,
                    Map.of("adminRefundsEnabled", false),
                    200);
        }
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action ="
                                        + " 'payments.settings.update' AND occurred_at > now() -"
                                        + " interval '1 minute'"))
                .isGreaterThanOrEqualTo(2);

        // Admin lists.
        JsonNode pending =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/transactions/pending-shipment?size=100",
                        admin,
                        null,
                        200);
        assertThat(pending.toString()).contains(tradeId);
        JsonNode all =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/transactions?status=SECURED&size=100",
                        admin,
                        null,
                        200);
        assertThat(all.toString()).contains(paymentId);
        ship(seller, tradeId, 200);
        JsonNode confirmation =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/transactions/pending-confirmation?size=100",
                        admin,
                        null,
                        200);
        assertThat(confirmation.toString()).contains(tradeId);
        // The payout after the refunds: (40.00 - 10.00) - 5 % = 28.50.
        JsonNode completed = tradeAction(buyer, tradeId, "confirm-receipt", 200);
        assertThat(completed.path("payment").path("payoutAmount").decimalValue())
                .isEqualByComparingTo("28.50");
        assertThat(completed.path("payment").path("status").asString())
                .isEqualTo("PARTIALLY_REFUNDED");
    }
}
