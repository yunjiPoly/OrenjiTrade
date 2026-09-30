package com.orenjitrade.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 9 disputes: the buyer opens one within the window (the payout is frozen, the trade
 * DISPUTED), both parties add typed evidence and messages, an admin reads the full history, freezes
 * the case, adds a note and resolves it for the buyer (refund through the fake provider, trade
 * CANCELLED) or with a split (partial refund and payout, trade COMPLETED). The window closes after
 * its end; the evidence limit holds; everything is audited.
 */
class DisputeFlowIT extends AbstractPaymentsIT {

    @Test
    void openWithinTheWindowFreezeAndResolveForTheBuyerWithARefund() {
        Collector seller = member("df-seller");
        Collector buyer = member("df-buyer");
        Collector stranger = member("df-stranger");
        String admin = staff("df-admin", Role.ADMIN);
        String tradeId = protectedTrade(seller, buyer, "80.00");
        paid(seller, buyer, tradeId);
        ship(seller, tradeId, 200);

        assertThat(openDispute(seller, tradeId, "OTHER", 403).path("errorCode").asString())
                .isEqualTo("FORBIDDEN");
        callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/disputes",
                buyer.uid(),
                Map.of("reason", "NOT_RECEIVED", "description", " "),
                400);
        JsonNode dispute = openDispute(buyer, tradeId, "NOT_AS_DESCRIBED", 201);
        String disputeId = dispute.path("id").asString();
        assertThat(dispute.path("status").asString()).isEqualTo("OPEN");
        assertThat(dispute.path("viewerRole").asString()).isEqualTo("BUYER");
        assertThat(dispute.path("payment").path("payoutFrozen").asBoolean()).isTrue();
        assertThat(dispute.path("seller").path("handle").asString()).isEqualTo(seller.handle());
        assertThat(dispute.path("evidenceLeft").asInt()).isEqualTo(10);
        openDispute(buyer, tradeId, "OTHER", 409);

        JsonNode disputed = trade(buyer, tradeId, 200);
        assertThat(disputed.path("status").asString()).isEqualTo("DISPUTED");
        assertThat(disputed.path("dispute").path("id").asString()).isEqualTo(disputeId);
        assertThat(disputed.path("nextAction").path("action").asString()).isEqualTo("NONE");
        tradeAction(buyer, tradeId, "confirm-receipt", 409);
        awaitNotificationEvent(seller, "DISPUTE_UPDATE", "OPENED");

        // Evidence: TEXT, TRACKING, a photo; VIDEO reserved; bad links and types refused.
        JsonNode text =
                evidence(buyer, disputeId, Map.of("kind", "TEXT", "body", "Never arrived"), 201);
        assertThat(text.path("role").asString()).isEqualTo("BUYER");
        assertThat(text.path("fileUrl").isNull()).isTrue();
        Map<String, Object> tracking = new LinkedHashMap<>();
        tracking.put("kind", "TRACKING");
        tracking.put("body", "LOCAL-123 by postal service");
        tracking.put("url", "https://tracking.example/LOCAL-123");
        evidence(seller, disputeId, tracking, 201);
        tracking.put("url", "http://tracking.example/LOCAL-123");
        evidence(seller, disputeId, tracking, 400);
        assertThat(
                        evidence(buyer, disputeId, Map.of("kind", "VIDEO", "body", "clip"), 400)
                                .toString())
                .contains("VIDEO");
        evidence(buyer, disputeId, Map.of("kind", "TEXT"), 400);
        JsonNode photo =
                upload(
                        buyer,
                        disputeId,
                        "IMAGE",
                        InventoryTestSupport.png(40, 30),
                        "photo.png",
                        201);
        String fileUrl = photo.path("fileUrl").asString();
        assertThat(fileUrl).startsWith("/api/v1/disputes/" + disputeId + "/evidence/");
        assertThat(photo.path("contentType").asString()).isEqualTo("image/jpeg");
        EntityExchangeResult<byte[]> file = call(HttpMethod.GET, fileUrl, seller.uid(), null);
        assertThat(file.getStatus().value()).isEqualTo(200);
        assertThat(file.getResponseHeaders().getContentType()).isEqualTo(MediaType.IMAGE_JPEG);
        assertThat(file.getResponseHeaders().getCacheControl()).contains("no-store");
        assertThat(call(HttpMethod.GET, fileUrl, stranger.uid(), null).getStatus().value())
                .isEqualTo(404);
        upload(
                buyer,
                disputeId,
                "DOCUMENT",
                "not a pdf".getBytes(StandardCharsets.UTF_8),
                "receipt.pdf",
                415);
        JsonNode pdf =
                upload(
                        buyer,
                        disputeId,
                        "DOCUMENT",
                        "%PDF-1.4\n%fake receipt\n".getBytes(StandardCharsets.UTF_8),
                        "receipt.pdf",
                        201);
        assertThat(pdf.path("contentType").asString()).isEqualTo("application/pdf");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/public/media/"
                                                + testUsers
                                                        .query(
                                                                "SELECT storage_key FROM"
                                                                        + " dispute_evidence WHERE"
                                                                        + " id = ?::uuid",
                                                                photo.path("id").asString())
                                                        .get(0)
                                                        .get("storage_key"),
                                        null,
                                        null,
                                        404)
                                .path("errorCode")
                                .asString())
                .as("evidence is never public media")
                .isEqualTo("NOT_FOUND");

        // Thread: both parties; strangers see nothing.
        callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/messages",
                seller.uid(),
                Map.of("body", "I shipped it on time"),
                201);
        callJson(HttpMethod.GET, "/api/v1/disputes/" + disputeId, stranger.uid(), null, 404);
        callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/messages",
                stranger.uid(),
                Map.of("body", "Hello"),
                404);
        JsonNode sellerView =
                callJson(HttpMethod.GET, "/api/v1/disputes/" + disputeId, seller.uid(), null, 200);
        assertThat(sellerView.path("evidence")).hasSize(4);
        assertThat(sellerView.path("messages").get(0).path("authorName").asString())
                .isEqualTo("Collector " + seller.handle());
        assertThat(sellerView.toString())
                .doesNotContain("storageKey")
                .doesNotContain(".jpg")
                .doesNotContain(".pdf");

        // Admin: full history, freeze, note, resolve for the buyer.
        JsonNode adminView =
                callJson(HttpMethod.GET, "/api/v1/admin/disputes/" + disputeId, admin, null, 200);
        assertThat(adminView.path("dispute").path("viewerRole").asString()).isEqualTo("ADMIN");
        assertThat(adminView.path("buyerHistory").path("userId").asString())
                .isEqualTo(buyer.id().toString());
        assertThat(adminView.path("sellerRatings").has("count")).isTrue();
        assertThat(adminView.path("tradeTimeline").toString()).contains("DISPUTE_OPENED");
        assertThat(adminView.path("paymentEvents").toString()).contains("PAYOUT_FROZEN");
        JsonNode queue =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/disputes?status=OPEN&size=100",
                        admin,
                        null,
                        200);
        assertThat(queue.toString()).contains(disputeId);

        JsonNode frozen =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/disputes/" + disputeId + "/freeze",
                        admin,
                        Map.of("reason", "Checking the tracking with the carrier"),
                        200);
        assertThat(frozen.path("dispute").path("status").asString()).isEqualTo("FROZEN");
        assertThat(frozen.path("internalNotes")).hasSize(1);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/disputes/" + disputeId + "/freeze",
                admin,
                null,
                409);
        assertThat(
                        evidence(buyer, disputeId, Map.of("kind", "TEXT", "body", "More"), 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("INVALID_STATE_TRANSITION");
        callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/messages",
                buyer.uid(),
                Map.of("body", "Any news?"),
                409);
        callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/messages",
                admin,
                Map.of("body", "We are looking into it."),
                201);
        JsonNode noted =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/disputes/" + disputeId + "/notes",
                        admin,
                        Map.of("body", "Carrier confirms no scan after pickup."),
                        200);
        assertThat(noted.path("internalNotes")).hasSize(2);
        JsonNode buyerView =
                callJson(HttpMethod.GET, "/api/v1/disputes/" + disputeId, buyer.uid(), null, 200);
        assertThat(buyerView.toString()).doesNotContain("Carrier confirms");
        assertThat(buyerView.path("messages").get(1).path("authorName").asString())
                .isEqualTo("OrenjiTrade support");
        assertThat(buyerView.path("canAddEvidence").asBoolean()).isFalse();

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/disputes/" + disputeId + "/resolve",
                admin,
                resolution("BUYER", "10.00"),
                400);
        JsonNode resolved =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/disputes/" + disputeId + "/resolve",
                        admin,
                        resolution("BUYER", null),
                        200);
        assertThat(resolved.path("dispute").path("status").asString()).isEqualTo("RESOLVED_BUYER");
        assertThat(resolved.path("dispute").path("refundAmount").decimalValue())
                .isEqualByComparingTo("80.00");
        assertThat(resolved.path("dispute").path("payment").path("status").asString())
                .isEqualTo("REFUNDED");
        assertThat(resolved.path("refunds").get(0).path("source").asString()).isEqualTo("DISPUTE");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/disputes/" + disputeId + "/resolve",
                admin,
                resolution("SELLER", null),
                409);
        JsonNode cancelled = trade(buyer, tradeId, 200);
        assertThat(cancelled.path("status").asString()).isEqualTo("CANCELLED");
        assertThat(cancelled.path("payment").path("refundedAmount").decimalValue())
                .isEqualByComparingTo("80.00");
        assertThat(timeline(cancelled)).contains("REFUNDED", "DISPUTE_RESOLVED", "CANCELLED");
        assertThat(fakeProvider.calls())
                .anyMatch(call -> call.startsWith("refund:") && call.endsWith("80.00 CAD"));
        callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/messages",
                buyer.uid(),
                Map.of("body", "Thanks"),
                409);
        awaitNotificationEvent(buyer, "DISPUTE_UPDATE", "RESOLVED");
        awaitNotificationEvent(buyer, "PAYMENT_UPDATE", "REFUNDED");
        assertThat(auditActions("DISPUTE", disputeId))
                .containsExactly("dispute.freeze", "dispute.note", "dispute.resolve");
        assertThat(auditRows("DISPUTE", disputeId).get(2).get("details").toString())
                .contains("BUYER")
                .doesNotContain("Carrier confirms");
    }

    @Test
    void theWindowClosesAndSplitsPayTheRestOut() {
        Collector seller = member("df2-seller");
        Collector buyer = member("df2-buyer");
        String admin = staff("df2-admin", Role.ADMIN);

        String late = protectedTrade(seller, buyer, "30.00");
        paid(seller, buyer, late);
        ship(seller, late, 200);
        testUsers.update(
                "UPDATE payment SET dispute_window_ends_at = now() - interval '1 minute' WHERE"
                        + " trade_id = ?::uuid",
                late);
        JsonNode closed = openDispute(buyer, late, "NOT_RECEIVED", 409);
        assertThat(closed.path("errorCode").asString()).isEqualTo("DISPUTE_WINDOW_CLOSED");
        assertThat(closed.has("disputeWindowEndsAt")).isTrue();
        assertThat(trade(buyer, late, 200).path("allowedOperations").toString())
                .doesNotContain("OPEN_DISPUTE");

        // Disputes are possible before shipment too; SPLIT refunds part and pays the rest out.
        String split = protectedTrade(seller, buyer, "60.00");
        paid(seller, buyer, split);
        assertThat(trade(buyer, split, 200).path("allowedOperations").toString())
                .contains("OPEN_DISPUTE");
        String disputeId = openDispute(buyer, split, "DAMAGED", 201).path("id").asString();
        for (String amount : List.of("0", "60.00", "60.01")) {
            callJson(
                    HttpMethod.POST,
                    "/api/v1/admin/disputes/" + disputeId + "/resolve",
                    admin,
                    resolution("SPLIT", amount),
                    400);
        }
        JsonNode resolved =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/disputes/" + disputeId + "/resolve",
                        admin,
                        resolution("SPLIT", "10.00"),
                        200);
        assertThat(resolved.path("dispute").path("status").asString()).isEqualTo("RESOLVED_SPLIT");
        JsonNode payment = resolved.path("dispute").path("payment");
        assertThat(payment.path("status").asString()).isEqualTo("PARTIALLY_REFUNDED");
        assertThat(payment.path("refundedAmount").decimalValue()).isEqualByComparingTo("10.00");
        assertThat(payment.path("payoutAmount").decimalValue()).isEqualByComparingTo("47.50");
        JsonNode completed = trade(seller, split, 200);
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE kind = 'TRADE' AND"
                                        + " subject_id = ?::uuid",
                                split))
                .isEqualTo(1);
    }

    @Test
    void eachPartyAddsAtMostTenPiecesOfEvidence() {
        Collector seller = member("df3-seller");
        Collector buyer = member("df3-buyer");
        String tradeId = protectedTrade(seller, buyer, "15.00");
        paid(seller, buyer, tradeId);
        String disputeId = openDispute(buyer, tradeId, "OTHER", 201).path("id").asString();
        for (int index = 0; index < 10; index++) {
            evidence(buyer, disputeId, Map.of("kind", "TEXT", "body", "Point " + index), 201);
        }
        JsonNode limit = evidence(buyer, disputeId, Map.of("kind", "TEXT", "body", "More"), 409);
        assertThat(limit.path("errorCode").asString()).isEqualTo("EVIDENCE_LIMIT_REACHED");
        assertThat(limit.path("limit").asInt()).isEqualTo(10);
        evidence(seller, disputeId, Map.of("kind", "TEXT", "body", "My side"), 201);
        String admin = staff("df3-admin", Role.ADMIN);
        callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/evidence",
                admin,
                Map.of("kind", "TEXT", "body", "Admin"),
                403);
        JsonNode resolved =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/disputes/" + disputeId + "/resolve",
                        admin,
                        resolution("SELLER", null),
                        200);
        assertThat(resolved.path("dispute").path("status").asString()).isEqualTo("RESOLVED_SELLER");
        assertThat(resolved.path("dispute").path("payment").path("payoutAmount").decimalValue())
                .isEqualByComparingTo(new BigDecimal("14.25"));
        assertThat(trade(buyer, tradeId, 200).path("status").asString()).isEqualTo("COMPLETED");
    }

    private JsonNode evidence(
            Collector party, String disputeId, Map<String, Object> body, int status) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/disputes/" + disputeId + "/evidence",
                party.uid(),
                body,
                status);
    }

    private JsonNode upload(
            Collector party,
            String disputeId,
            String kind,
            byte[] content,
            String filename,
            int status) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                "file",
                new ByteArrayResource(content) {
                    @Override
                    public String getFilename() {
                        return filename;
                    }
                });
        builder.part("kind", kind);
        builder.part("body", "Caption of " + party.handle());
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/disputes/" + disputeId + "/evidence")
                        .header(HttpHeaders.AUTHORIZATION, bearer(party.uid()))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        byte[] bytes = result.getResponseBody();
        assertThat(result.getStatus().value())
                .as("upload -> %s", bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8))
                .isEqualTo(status);
        return json(result);
    }

    private static Map<String, Object> resolution(String outcome, @Nullable String refund) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outcome", outcome);
        if (refund != null) {
            body.put("refundAmount", new BigDecimal(refund));
        }
        body.put("note", "Decision after reviewing the evidence");
        return body;
    }
}
