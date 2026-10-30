package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.wishlist.AbstractWishlistIT;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Account deletion and the other collectors' notifications (WC review V3-1): once the account
 * deletion job ran, a message notification says "New message from Deleted collector" as the chat
 * does, and a wishlist alert about the deleted collector's listing names "Deleted collector"
 * instead of the handle; the deleted account's own notifications are gone and other senders' rows
 * keep their names. The deletion runs through the real path: a deletion request, the grace period
 * moved back, the account deletion job (the identity client is the no-op one in tests).
 */
class DeletedCollectorNotificationsIT extends AbstractWishlistIT {

    private static final String SERVICE_TOKEN = "local-service-token";

    @Test
    void theOtherCollectorsNotificationsNameADeletedCollectorAsTheChatDoes() {
        Place place = americasNorth();
        Collector leaving = collector("dn-leaving", place);
        Collector recipient = collector("dn-recipient", place);
        Collector wisher = collector("dn-wisher", place);
        Collector staying = collector("dn-staying", place);

        String fromLeaving = conversation(leaving, recipient);
        send(leaving, fromLeaving, Map.of("kind", "TEXT", "body", "Still have the Azure?"));
        String fromStaying = conversation(staying, recipient);
        send(staying, fromStaying, Map.of("kind", "TEXT", "body", "Hello"));
        // The deleted account also received a message: its own row goes with it.
        send(recipient, fromLeaving, Map.of("kind", "TEXT", "body", "Hi"));

        UUID azure = printing(AZURE);
        createWish(wisher, wish(azure, true));
        String itemId = publicItem(leaving, azure, offered("NEAR_MINT", "12.00", "SALE"));
        awaitEventsProcessed(itemId);

        String oldName = "Collector " + leaving.handle();
        assertThat(notifications(recipient).toString()).contains(oldName);
        assertThat(notificationsOfType(wisher, "WISHLIST_ALERT")).hasSize(1);
        assertThat(storedNotifications(leaving.id(), "MESSAGE")).isEqualTo(1);

        deleteThroughTheJob(leaving);

        List<JsonNode> messages = notificationsOfType(recipient, "MESSAGE");
        JsonNode renamed = byConversation(messages, fromLeaving);
        assertThat(renamed.path("title").asString())
                .isEqualTo("New message from Deleted collector");
        assertThat(renamed.path("body").asString())
                .isEqualTo("Deleted collector sent you a message.");
        assertThat(renamed.path("data").path("conversationId").asString()).isEqualTo(fromLeaving);
        JsonNode kept = byConversation(messages, fromStaying);
        assertThat(kept.path("title").asString())
                .as("another sender's row keeps its name")
                .isEqualTo("New message from Collector " + staying.handle());
        assertThat(notifications(recipient).toString())
                .doesNotContain(oldName)
                .doesNotContain(leaving.handle());

        JsonNode alert = notificationsOfType(wisher, "WISHLIST_ALERT").get(0);
        assertThat(alert.path("body").asString())
                .contains("was just listed by Deleted collector in Quebec, Canada.")
                .doesNotContain(leaving.handle());
        assertThat(alert.path("data").path("collectorHandle").asString())
                .isEqualTo("Deleted collector");
        assertThat(notifications(wisher).toString()).doesNotContain(leaving.handle());

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ?",
                                leaving.id()))
                .as("the deleted account's own notifications are gone")
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE title LIKE ? OR body LIKE"
                                        + " ? OR data::text LIKE ?",
                                "%" + leaving.handle() + "%",
                                "%" + leaving.handle() + "%",
                                "%" + leaving.handle() + "%"))
                .as("no stored notification keeps the deleted collector's name or handle")
                .isZero();
    }

    private String conversation(Collector from, Collector to) {
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        from.uid(),
                        Map.of("recipientId", to.id().toString()),
                        201)
                .path("id")
                .asString();
    }

    private void send(Collector from, String conversationId, Map<String, Object> body) {
        String id =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations/" + conversationId + "/messages",
                                from.uid(),
                                body,
                                201)
                        .path("id")
                        .asString();
        awaitEventsProcessed(id);
    }

    private static JsonNode byConversation(List<JsonNode> rows, String conversationId) {
        return rows.stream()
                .filter(
                        row ->
                                conversationId.equals(
                                        row.path("data").path("conversationId").asString()))
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
