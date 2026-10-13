package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.wishlist.AbstractWishlistIT;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Notification preferences applied by {@code NotificationService.notify} (Phase 6 contract, stage
 * S2 wishlist alerts switch): the wishlist alerts switch and a disabled category store (and count)
 * nothing, in-app off keeps the notification out of the centre while push still goes out, quiet
 * hours hold push back (in-app unaffected), email goes through the log provider to verified
 * addresses only, with the address masked in the logs; wishlist alerts never use email.
 */
@ExtendWith(OutputCaptureExtension.class)
class NotificationPreferencesIT extends AbstractWishlistIT {

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    @Test
    void theWishlistAlertsSwitchAndADisabledCategoryStoreAndCountNothing() {
        Pair pair = pair("np-off");
        settings(pair.wisher(), false, true, false, null, null);

        publish(pair);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ?",
                                pair.wisher().id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT coalesce(sum(count), 0) FROM usage_counter WHERE user_id"
                                        + " = ? AND limit_key = 'wishlist.alerts.per_day'",
                                pair.wisher().id()))
                .as("suppressed notifications do not count against the daily limit")
                .isZero();

        settings(pair.wisher(), false, true, true, null, null);
        publish(pair);
        assertThat(notificationsOfType(pair.wisher(), "WISHLIST_ALERT")).hasSize(1);

        // A disabled category (messages) stores nothing either.
        settings(pair.wisher(), false, true, true, channels(false, false, false), null);
        message(pair.seller(), pair.wisher(), "Still looking for the dragon?");
        assertThat(storedNotifications(pair.wisher().id(), "MESSAGE")).isZero();
    }

    @Test
    void inAppOffKeepsTheCentreEmptyWhilePushIsDelivered() {
        Pair pair = pair("np-push");
        registerToken(pair.wisher(), "ANDROID", uniqueToken());
        settings(pair.wisher(), false, false, true, null, null);

        publish(pair);
        awaitDispatched(pair.wisher().id());
        assertThat(notifications(pair.wisher()).path("items")).isEmpty();
        assertThat(unreadCount(pair.wisher())).isZero();
        List<Map<String, Object>> rows = rowsOf(pair.wisher().id());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("in_app")).isEqualTo(false);
        String state = (String) rows.get(0).get("state");
        assertThat(state)
                .contains("\"realtime\": \"SKIPPED\"")
                .contains("\"push\": \"SENT\"")
                .contains("\"pushProvider\": \"log\"")
                .contains("\"pushDelivered\": 1")
                .contains("\"email\": \"SKIPPED\"");
    }

    @Test
    void quietHoursHoldPushBackButNotTheInAppNotification() {
        Pair pair = pair("np-quiet");
        registerToken(pair.wisher(), "IOS", uniqueToken());
        LocalTime now = LocalTime.now(ZoneOffset.UTC);
        settings(
                pair.wisher(),
                false,
                true,
                true,
                null,
                quiet(true, now.minusHours(2), now.plusHours(2)));

        publish(pair);
        awaitDispatched(pair.wisher().id());
        List<JsonNode> listed = notificationsOfType(pair.wisher(), "WISHLIST_ALERT");
        assertThat(listed).hasSize(1);
        assertThat(channelState(listed.get(0).path("id").asString()))
                .contains("\"push\": \"SKIPPED\"")
                .contains("\"pushReason\": \"QUIET_HOURS\"")
                .contains("\"realtime\": \"SENT\"");

        // Outside the quiet period the push goes out.
        settings(
                pair.wisher(),
                false,
                true,
                true,
                null,
                quiet(true, now.plusHours(3), now.plusHours(5)));
        String second = publish(pair);
        awaitDispatched(pair.wisher().id());
        String secondNotification =
                notificationsOfType(pair.wisher(), "WISHLIST_ALERT").stream()
                        .filter(
                                node ->
                                        second.equals(
                                                node.path("data")
                                                        .path("inventoryItemId")
                                                        .asString()))
                        .findFirst()
                        .orElseThrow()
                        .path("id")
                        .asString();
        assertThat(channelState(secondNotification))
                .contains("\"push\": \"SENT\"")
                .doesNotContain("QUIET_HOURS");

        // Without any device token push is skipped with NO_TOKENS.
        Pair noDevice = pair("np-nodevice");
        publish(noDevice);
        awaitDispatched(noDevice.wisher().id());
        assertThat(rowsOf(noDevice.wisher().id()).get(0).get("state").toString())
                .contains("\"push\": \"SKIPPED\"")
                .contains("\"pushReason\": \"NO_TOKENS\"");
    }

    @Test
    void emailGoesToVerifiedAddressesThroughTheLogProvider(CapturedOutput output) {
        Pair pair = pair("np-email");
        settings(pair.wisher(), true, true, true, channels(false, true, true), null);

        // Wishlist alerts never use email, even with the email switch on.
        publish(pair);
        awaitDispatched(pair.wisher().id());
        assertThat(rowsOf(pair.wisher().id()).get(0).get("state").toString())
                .contains("\"email\": \"SKIPPED\"");

        String conversation = message(pair.seller(), pair.wisher(), "Do you still want it?");
        awaitDispatched(pair.wisher().id());
        String state = messageState(pair.wisher(), conversation);
        assertThat(state)
                .contains("\"email\": \"SENT\"")
                .contains("\"emailProvider\": \"log\"")
                .contains("\"push\": \"SKIPPED\"");
        String address = pair.wisher().uid().toLowerCase(java.util.Locale.ROOT);
        List<String> emailLines =
                output.getAll()
                        .lines()
                        .filter(line -> line.contains("email (log provider)"))
                        .toList();
        assertThat(emailLines).isNotEmpty();
        assertThat(emailLines)
                .as("the log provider masks the address")
                .noneMatch(line -> line.contains(address + "@"))
                .anyMatch(line -> line.contains(address.charAt(0) + "***@orenjitrade.test"));

        // An unverified address gets nothing.
        testUsers.update(
                "UPDATE user_account SET email_verified = false WHERE id = ?", pair.wisher().id());
        testUsers.update(
                "DELETE FROM notification WHERE user_id = ? AND type = 'MESSAGE'",
                pair.wisher().id());
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversation + "/messages",
                pair.seller().uid(),
                Map.of("kind", "TEXT", "body", "Anyone?"),
                201);
        awaitDispatched(pair.wisher().id());
        assertThat(messageState(pair.wisher(), conversation))
                .contains("\"email\": \"SKIPPED\"")
                .contains("\"emailReason\": \"NO_EMAIL\"");
    }

    // ---------------------------------------------------------------------------------------

    /** A wisher with an active wish for Azure-Eyes and a seller of the same region. */
    private record Pair(Collector wisher, Collector seller, UUID printing, String wishId) {}

    private Pair pair(String prefix) {
        Place place = americasNorth();
        Collector wisher = collector(prefix + "-w", place);
        Collector seller = collector(prefix + "-s", place);
        UUID azure = printing(AZURE);
        String wishId = createWish(wisher, wish(azure, true)).path("id").asString();
        return new Pair(wisher, seller, azure, wishId);
    }

    /** The seller publishes one more fitting item; waits for the wishlist alerts. */
    private String publish(Pair pair) {
        String itemId =
                publicItem(pair.seller(), pair.printing(), offered("NEAR_MINT", "20.00", "SALE"));
        awaitEventsProcessed(itemId);
        return itemId;
    }

    private List<Map<String, Object>> rowsOf(UUID userId) {
        return testUsers.query(
                "SELECT in_app, channel_state::text AS state FROM notification WHERE user_id = ?"
                        + " ORDER BY created_at",
                userId);
    }

    private void registerToken(Collector collector, String platform, String token) {
        callJson(
                HttpMethod.POST,
                "/api/v1/me/push-tokens",
                collector.uid(),
                Map.of("platform", platform, "token", token),
                204);
    }

    private static String uniqueToken() {
        return "test-device-" + UUID.randomUUID();
    }

    private static Map<String, Object> channels(boolean push, boolean email, boolean inApp) {
        return Map.of("push", push, "email", email, "inApp", inApp);
    }

    private static Map<String, Object> quiet(boolean enabled, LocalTime start, LocalTime end) {
        Map<String, Object> quiet = new LinkedHashMap<>();
        quiet.put("enabled", enabled);
        quiet.put("start", start.format(HH_MM));
        quiet.put("end", end.format(HH_MM));
        quiet.put("timezone", "UTC");
        return quiet;
    }

    /** The seller messages the wisher (a MESSAGE notification); returns the conversation id. */
    private String message(Collector from, Collector to, String text) {
        String conversation =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                from.uid(),
                                Map.of("recipientId", to.id().toString()),
                                201)
                        .path("id")
                        .asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversation + "/messages",
                from.uid(),
                Map.of("kind", "TEXT", "body", text),
                201);
        return conversation;
    }

    /** Channel state of the latest MESSAGE notification of a conversation (JSON text). */
    private String messageState(Collector recipient, String conversation) {
        return (String)
                testUsers
                        .query(
                                "SELECT channel_state::text AS state FROM notification WHERE"
                                        + " user_id = ? AND type = 'MESSAGE' AND data ->>"
                                        + " 'conversationId' = ? ORDER BY created_at DESC",
                                recipient.id(),
                                conversation)
                        .get(0)
                        .get("state");
    }

    private void settings(
            Collector collector,
            boolean emailEnabled,
            boolean inAppEnabled,
            boolean wishlistAlerts,
            Map<String, Object> messageChannels,
            Map<String, Object> quietHours) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pushEnabled", true);
        body.put("emailEnabled", emailEnabled);
        body.put("inAppEnabled", inAppEnabled);
        body.put("wishlistAlerts", wishlistAlerts);
        if (messageChannels != null) {
            body.put("categories", Map.of("MESSAGE", messageChannels));
        }
        if (quietHours != null) {
            body.put("quietHours", quietHours);
        }
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", collector.uid(), body, 200);
    }
}
