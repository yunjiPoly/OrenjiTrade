package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

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
 * Notifications made from other modules' domain events (Phase 6): MESSAGE for private messages
 * (never the text; at most one unread notification per conversation and none within 10 minutes of
 * the previous one; none for muted conversations; read with the conversation) and the freshness
 * job's BINDER_STALE_WARNING / BINDER_HIDDEN per binder or unfiled lot (once, dedup-keyed).
 */
class ActivityNotificationsIT extends AbstractWishlistIT {

    @Test
    void privateMessagesNotifyTheRecipientWithAThrottlePerConversation() {
        Place place = americasNorth();
        Collector sender = collector("an-sender", place);
        Collector recipient = collector("an-recipient", place);
        String conversationId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                sender.uid(),
                                Map.of("recipientId", recipient.id().toString()),
                                201)
                        .path("id")
                        .asString();

        String first = send(sender, conversationId, text("Hello, secret meeting place inside"));
        List<JsonNode> notified = notificationsOfType(recipient, "MESSAGE");
        assertThat(notified).hasSize(1);
        JsonNode notification = notified.get(0);
        assertThat(notification.path("title").asString())
                .isEqualTo("New message from Collector " + sender.handle());
        assertThat(notification.path("body").asString())
                .isEqualTo("Collector " + sender.handle() + " sent you a message.");
        JsonNode data = notification.path("data");
        assertThat(data.path("conversationId").asString()).isEqualTo(conversationId);
        assertThat(data.path("messageId").asString()).isEqualTo(first);
        assertThat(data.path("senderId").asString()).isEqualTo(sender.id().toString());
        assertThat(data.path("deepLink").asString()).isEqualTo("/messages/" + conversationId);
        assertThat(notification.toString()).doesNotContain("secret meeting place");
        assertThat(storedNotifications(sender.id(), "MESSAGE")).as("never the sender").isZero();

        // A second message while the first notification is unread: throttled.
        String second = send(sender, conversationId, text("Are you there?"));
        assertThat(storedNotifications(recipient.id(), "MESSAGE")).isEqualTo(1);

        // Reading the conversation reads its notification too.
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/read",
                recipient.uid(),
                Map.of("lastReadMessageId", second),
                204);
        await().atMost(WAIT)
                .until(
                        () ->
                                !notificationsOfType(recipient, "MESSAGE")
                                        .get(0)
                                        .path("readAt")
                                        .isNull());
        assertThat(unreadCount(recipient)).isZero();

        // Within 10 minutes of the previous notification: still throttled.
        send(sender, conversationId, text("Third"));
        assertThat(storedNotifications(recipient.id(), "MESSAGE")).isEqualTo(1);

        // Later on a new notification comes, worded by message kind.
        backdateMessageNotifications(recipient.id());
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("kind", "CARD_LINK");
        card.put("cardPrintingId", printing(AZURE).toString());
        send(sender, conversationId, card);
        assertThat(storedNotifications(recipient.id(), "MESSAGE")).isEqualTo(2);
        assertThat(
                        notificationsOfType(recipient, "MESSAGE").stream()
                                .map(node -> node.path("body").asString())
                                .toList())
                .contains("Collector " + sender.handle() + " shared a card with you.");

        // Muted conversations never notify.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/conversations/" + conversationId,
                recipient.uid(),
                Map.of("muted", true),
                200);
        callJson(HttpMethod.POST, "/api/v1/notifications/read-all", recipient.uid(), null, 200);
        backdateMessageNotifications(recipient.id());
        send(sender, conversationId, text("Muted?"));
        assertThat(storedNotifications(recipient.id(), "MESSAGE")).isEqualTo(2);
    }

    @Test
    void theFreshnessJobWarnsThenReportsHiddenListingsOncePerBinderOrUnfiledLot() {
        Collector owner = collector("an-fresh", americasNorth());
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                Map.of("name", "Warned binder", "visibility", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        UUID azure = printing(AZURE);
        Map<String, Object> inBinder = new LinkedHashMap<>();
        inBinder.put("binderId", binderId);
        String binderItem = publicItem(owner, azure, inBinder);
        String unfiled = publicItem(owner, azure, Map.of());
        confirmedDaysAgo("inventory_item", binderItem, 42);
        confirmedDaysAgo("inventory_item", unfiled, 42);

        runFreshnessJob();
        await().atMost(WAIT)
                .until(() -> storedNotifications(owner.id(), "BINDER_STALE_WARNING") == 2);
        List<JsonNode> warnings = notificationsOfType(owner, "BINDER_STALE_WARNING");
        JsonNode binderWarning = byBinder(warnings, binderId);
        assertThat(binderWarning.path("title").asString())
                .isEqualTo("Confirm your listings are still available");
        assertThat(binderWarning.path("body").asString())
                .startsWith("Your binder \"Warned binder\" will be hidden from the map in ")
                .endsWith("unless you confirm it is still available.");
        assertThat(binderWarning.path("data").path("itemCount").asInt()).isEqualTo(1);
        assertThat(binderWarning.path("data").path("hidesAt").asString()).isNotBlank();
        assertThat(binderWarning.path("data").path("deepLink").asString())
                .isEqualTo("/inventory?binder=" + binderId);
        JsonNode unfiledWarning = byBinder(warnings, null);
        assertThat(unfiledWarning.path("body").asString())
                .startsWith("1 unfiled card will be hidden from the map");
        assertThat(unfiledWarning.path("data").path("deepLink").asString())
                .isEqualTo("/inventory?binder=unfiled");

        // Warned once per confirmation cycle.
        awaitNoPendingActivityEvents(runFreshnessJob());
        assertThat(storedNotifications(owner.id(), "BINDER_STALE_WARNING")).isEqualTo(2);

        // Hidden: one notification per binder (binder and item events share the key) and lot.
        confirmedDaysAgo("inventory_item", binderItem, 50);
        confirmedDaysAgo("inventory_item", unfiled, 50);
        confirmedDaysAgo("binder", binderId, 50);
        java.time.Instant hiddenRun = runFreshnessJob();
        await().atMost(WAIT).until(() -> storedNotifications(owner.id(), "BINDER_HIDDEN") == 2);
        awaitNoPendingActivityEvents(hiddenRun);
        assertThat(storedNotifications(owner.id(), "BINDER_HIDDEN")).isEqualTo(2);
        List<JsonNode> hidden = notificationsOfType(owner, "BINDER_HIDDEN");
        assertThat(byBinder(hidden, binderId).path("body").asString())
                .startsWith("Your binder \"Warned binder\" was hidden from the map");
        assertThat(byBinder(hidden, null).path("body").asString())
                .startsWith("1 unfiled card was hidden from the map");
        assertThat(hidden.get(0).path("title").asString())
                .isEqualTo("Listings hidden from the map");

        awaitNoPendingActivityEvents(runFreshnessJob());
        assertThat(storedNotifications(owner.id(), "BINDER_HIDDEN")).isEqualTo(2);
    }

    // ---------------------------------------------------------------------------------------

    private String send(Collector from, String conversationId, Map<String, Object> body) {
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
        return id;
    }

    private static Map<String, Object> text(String body) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("kind", "TEXT");
        message.put("body", body);
        return message;
    }

    private void backdateMessageNotifications(UUID userId) {
        testUsers.update(
                "UPDATE notification SET created_at = created_at - interval '11 minutes' WHERE"
                        + " user_id = ? AND type = 'MESSAGE'",
                userId);
    }

    private void confirmedDaysAgo(String table, String id, int days) {
        testUsers.update(
                "UPDATE "
                        + table
                        + " SET confirmed_at = now() - make_interval(days => ?) WHERE id = ?",
                days,
                UUID.fromString(id));
    }

    private java.time.Instant runFreshnessJob() {
        java.time.Instant startedAt = java.time.Instant.now().minusSeconds(1);
        http.post()
                .uri("/internal/jobs/freshness")
                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isOk();
        return startedAt;
    }

    /** Waits until the events published since {@code since} were consumed by the listener. */
    private void awaitNoPendingActivityEvents(java.time.Instant since) {
        await().atMost(WAIT)
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM event_publication WHERE"
                                                        + " completion_date IS NULL AND"
                                                        + " listener_id LIKE"
                                                        + " '%ActivityNotificationListener%' AND"
                                                        + " publication_date >= ?",
                                                java.sql.Timestamp.from(since))
                                        == 0);
    }

    private static JsonNode byBinder(List<JsonNode> notifications, String binderId) {
        for (JsonNode node : notifications) {
            JsonNode value = node.path("data").path("binderId");
            boolean unfiled = value.isNull() || value.isMissingNode();
            if (binderId == null ? unfiled : binderId.equals(value.asString())) {
                return node;
            }
        }
        throw new AssertionError("no notification for binder " + binderId + " in " + notifications);
    }
}
