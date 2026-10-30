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

    /**
     * WE review R2-2: handles can be changed and taken again. A collector who once held the deleted
     * account's handle keeps the names of their sale and rating (found by the account's id since
     * stage WF), and so does an older row without an id written before the deleted account existed;
     * the deleted account's own rows, and its older row without an id, say "Deleted collector".
     */
    @Test
    void aReusedHandleRenamesOnlyTheDeletedAccountsRows() {
        Collector former = collector("dd-former");
        Collector buyer = collector("dd-rbuyer");
        String handle = former.handle();

        String formerItem = card(former, 1, "PUBLIC", "$5");
        String formerChat = chatAbout(buyer, former, formerItem);
        String formerSale = markSold(former, formerChat, 1, null, 201).path("id").asString();
        String formerRating = rate(former, buyer, 3);
        JsonNode formerRow =
                byData(notifications(buyer, "RATING_RECEIVED"), "ratingId", formerRating);
        assertThat(formerRow.path("data").path("raterId").asString())
                .isEqualTo(former.id().toString());
        assertThat(
                        byData(notifications(buyer, "SALE_RECORDED"), "saleId", formerSale)
                                .path("data")
                                .path("sellerId")
                                .asString())
                .isEqualTo(former.id().toString());
        // A row from before stage WF (no id) by the former holder, written a day earlier.
        UUID olderRow =
                legacyRating(buyer, handle, "Collector " + handle, "now() - interval '1 day'");

        // The former holder takes another handle; a new account takes theirs.
        testUsers.update(
                "UPDATE user_account SET handle = ? WHERE id = ?", handle + "_x", former.id());
        Collector leaving = collector("dd-rleaving");
        testUsers.update("UPDATE user_account SET handle = ? WHERE id = ?", handle, leaving.id());
        Collector seller = new Collector(leaving.uid(), leaving.id(), handle);

        String leavingItem = card(seller, 1, "PUBLIC", "$6");
        String leavingChat = chatAbout(buyer, seller, leavingItem);
        String leavingSale = markSold(seller, leavingChat, 1, null, 201).path("id").asString();
        String leavingRating = rate(seller, buyer, 5);
        // An older row without an id from the leaving account (written once it existed).
        UUID leavingOlderRow = legacyRating(buyer, handle, "Collector " + handle, "now()");

        deleteThroughTheJob(seller);

        JsonNode keptRating =
                byData(notifications(buyer, "RATING_RECEIVED"), "ratingId", formerRating);
        assertThat(keptRating.path("data").path("raterHandle").asString()).isEqualTo(handle);
        assertThat(keptRating.path("title").asString())
                .isEqualTo(formerRow.path("title").asString());
        JsonNode keptSale = byData(notifications(buyer, "SALE_RECORDED"), "saleId", formerSale);
        assertThat(keptSale.path("data").path("sellerHandle").asString()).isEqualTo(handle);
        assertThat(keptSale.path("title").asString()).startsWith(handle + " marked ");
        assertThat(storedTitle(olderRow))
                .as("an older row written before the deleted account existed keeps its name")
                .isEqualTo("New rating from Collector " + handle);

        JsonNode goneRating =
                byData(notifications(buyer, "RATING_RECEIVED"), "ratingId", leavingRating);
        assertThat(goneRating.path("title").asString())
                .isEqualTo("New rating from Deleted collector");
        assertThat(goneRating.path("data").path("raterHandle").asString())
                .isEqualTo("Deleted collector");
        JsonNode goneSale = byData(notifications(buyer, "SALE_RECORDED"), "saleId", leavingSale);
        assertThat(goneSale.path("title").asString()).startsWith("Deleted collector marked ");
        assertThat(goneSale.path("data").path("sellerHandle").asString())
                .isEqualTo("Deleted collector");
        assertThat(storedTitle(leavingOlderRow))
                .as("an older row without an id, written once the account existed")
                .isEqualTo("New rating from Deleted collector");
    }

    /** A RATING_RECEIVED row as written before stage WF: the rater's handle, no rater id. */
    private UUID legacyRating(Collector ratee, String raterHandle, String raterName, String at) {
        UUID id = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO notification (id, user_id, type, title, body, data, dedup_key,"
                        + " created_at) VALUES (?, ?, 'RATING_RECEIVED', ?, ?,"
                        + " jsonb_build_object('ratingId',"
                        + " gen_random_uuid()::text, 'overall', 4, 'raterHandle', ?::text),"
                        + " 'legacy:' || gen_random_uuid(), "
                        + at
                        + ")",
                id,
                ratee.id(),
                "New rating from " + raterName,
                raterName + " rated you 4/5.",
                raterHandle);
        return id;
    }

    private String storedTitle(UUID notificationId) {
        return String.valueOf(
                testUsers
                        .query("SELECT title FROM notification WHERE id = ?", notificationId)
                        .get(0)
                        .get("title"));
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
