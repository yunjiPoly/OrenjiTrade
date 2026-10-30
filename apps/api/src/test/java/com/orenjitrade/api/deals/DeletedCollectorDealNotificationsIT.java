package com.orenjitrade.api.deals;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Account deletion and the sale and rating notifications of the other collectors (WE review P2,
 * after WC's V3-1): these rows name the account by its handle only (a sale's {@code sellerHandle}
 * and title, a rating's {@code raterHandle}, title and body with the display name). Once the
 * account deletion job ran, they say "Deleted collector" as the chat does, while another
 * collector's rows keep their names. The deletion runs through the real path: a deletion request,
 * the grace period moved back, the account deletion job (the identity client is the no-op one in
 * tests).
 */
class DeletedCollectorDealNotificationsIT extends AbstractDealsIT {

    private static final String SERVICE_TOKEN = "local-service-token";

    @Test
    void aDeletedSellersSaleAndRatingNotificationsSayDeletedCollector() {
        Collector seller = collector("dd-seller");
        Collector buyer = collector("dd-buyer");
        Collector staying = collector("dd-staying");

        String sold = card(seller, 2, "PUBLIC", "$9");
        String chat = chatAbout(buyer, seller, sold);
        String saleId = markSold(seller, chat, 1, null, 201).path("id").asString();
        String ratingId = rate(seller, buyer, 5);

        String keptItem = card(staying, 1, "PUBLIC", "$4");
        String keptChat = chatAbout(buyer, staying, keptItem);
        String keptSale = markSold(staying, keptChat, 1, null, 201).path("id").asString();
        String keptRating = rate(staying, buyer, 4);

        JsonNode saleBefore = byData(notifications(buyer, "SALE_RECORDED"), "saleId", saleId);
        assertThat(saleBefore.path("title").asString()).startsWith(seller.handle() + " marked ");
        JsonNode ratingBefore =
                byData(notifications(buyer, "RATING_RECEIVED"), "ratingId", ratingId);
        assertThat(ratingBefore.path("title").asString())
                .isEqualTo("New rating from Collector " + seller.handle());

        deleteThroughTheJob(seller);

        JsonNode sale = byData(notifications(buyer, "SALE_RECORDED"), "saleId", saleId);
        assertThat(sale.path("title").asString())
                .startsWith("Deleted collector marked ")
                .endsWith(" as sold to you");
        assertThat(sale.path("data").path("sellerHandle").asString())
                .isEqualTo("Deleted collector");
        assertThat(sale.path("data").path("conversationId").asString()).isEqualTo(chat);

        JsonNode rating = byData(notifications(buyer, "RATING_RECEIVED"), "ratingId", ratingId);
        assertThat(rating.path("title").asString()).isEqualTo("New rating from Deleted collector");
        assertThat(rating.path("body").asString()).isEqualTo("Deleted collector rated you 5/5.");
        assertThat(rating.path("data").path("raterHandle").asString())
                .isEqualTo("Deleted collector");

        // Another collector's sale and rating keep their names.
        JsonNode otherSale = byData(notifications(buyer, "SALE_RECORDED"), "saleId", keptSale);
        assertThat(otherSale.path("title").asString()).startsWith(staying.handle() + " marked ");
        assertThat(otherSale.path("data").path("sellerHandle").asString())
                .isEqualTo(staying.handle());
        JsonNode otherRating =
                byData(notifications(buyer, "RATING_RECEIVED"), "ratingId", keptRating);
        assertThat(otherRating.path("title").asString())
                .isEqualTo("New rating from Collector " + staying.handle());
        assertThat(otherRating.path("body").asString())
                .isEqualTo("Collector " + staying.handle() + " rated you 4/5.");
        assertThat(otherRating.path("data").path("raterHandle").asString())
                .isEqualTo(staying.handle());

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE title LIKE ? OR body LIKE"
                                        + " ? OR data::text LIKE ?",
                                "%" + seller.handle() + "%",
                                "%" + seller.handle() + "%",
                                "%" + seller.handle() + "%"))
                .as("no stored notification keeps the deleted collector's name or handle")
                .isZero();
    }

    /** {@code rater} rates {@code ratee} for their sale; returns the rating id. */
    private String rate(Collector rater, Collector ratee, int overall) {
        List<String> open = saleInteractions(rater, ratee);
        assertThat(open).isNotEmpty();
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/ratings",
                        rater.uid(),
                        Map.of("interactionId", open.get(0), "overall", overall),
                        201)
                .path("id")
                .asString();
    }

    private static JsonNode byData(List<JsonNode> rows, String key, String value) {
        return rows.stream()
                .filter(row -> value.equals(row.path("data").path(key).asString()))
                .findFirst()
                .orElseThrow();
    }

    /** Requests the deletion, moves its grace period back and runs the account deletion job. */
    private void deleteThroughTheJob(Collector member) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reason", "Leaving");
        body.put("exportFirst", false);
        String requestId =
                callJson(HttpMethod.POST, "/api/v1/me/deletion-requests", member.uid(), body, 201)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE account_deletion_request SET scheduled_for = now() - interval '1 minute'"
                        + " WHERE id = ?",
                UUID.fromString(requestId));
        JsonNode result =
                json(
                        http.post()
                                .uri("/internal/jobs/account-deletion")
                                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                                .exchange()
                                .expectStatus()
                                .isOk()
                                .expectBody()
                                .returnResult());
        assertThat(result.path("failed").asInt()).isZero();
        assertThat(testUsers.row(member.id()).get("status")).isEqualTo("DELETED");
    }
}
