package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.notifications.domain.NotificationRequest;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.NotificationType;
import com.orenjitrade.api.notifications.domain.NotifyResult;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The notification centre (Phase 6 contract): idempotent creation per dedup key, cursor pages
 * newest first, unread filter and badge, mark read (idempotent) and read-all, owner-only access,
 * validation; push token registration (idempotent, moves between accounts, never returned).
 */
class NotificationCentreIT extends AbstractIntegrationTest {

    @Autowired private NotificationService notificationService;

    @Test
    void notificationsArePagedNewestFirstAndMarkedRead() {
        String uid = uniqueUid("nc-owner");
        UUID userId = provisionCompliant(uid);
        List<UUID> created = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            NotifyResult result = notificationService.notify(system(userId, "centre-" + i, i));
            assertThat(result.outcome()).isEqualTo(NotifyResult.Outcome.CREATED);
            created.add(result.notificationId());
        }
        // Same dedup key: nothing new.
        NotifyResult duplicate = notificationService.notify(system(userId, "centre-3", 3));
        assertThat(duplicate.outcome()).isEqualTo(NotifyResult.Outcome.DUPLICATE);
        assertThat(duplicate.notificationId()).isEqualTo(created.get(3));

        List<String> seen = new ArrayList<>();
        @Nullable String cursor = null;
        int pages = 0;
        do {
            JsonNode page =
                    callJson(
                            HttpMethod.GET,
                            "/api/v1/notifications?limit=10"
                                    + (cursor == null ? "" : "&cursor=" + cursor),
                            uid,
                            null,
                            200);
            page.path("items").forEach(item -> seen.add(item.path("id").asString()));
            JsonNode next = page.path("nextCursor");
            cursor = next.isString() ? next.asString() : null;
            pages++;
        } while (cursor != null && pages < 10);
        assertThat(pages).isEqualTo(3);
        List<String> expected = new ArrayList<>();
        testUsers
                .query(
                        "SELECT id FROM notification WHERE user_id = ? ORDER BY created_at DESC,"
                                + " id DESC",
                        userId)
                .forEach(row -> expected.add(row.get("id").toString()));
        assertThat(expected).hasSize(25);
        assertThat(seen).as("newest first, no gaps, no repeats").isEqualTo(expected);
        assertThat(seen.get(24)).isEqualTo(created.get(0).toString());

        JsonNode first =
                callJson(HttpMethod.GET, "/api/v1/notifications?limit=1", uid, null, 200)
                        .path("items")
                        .get(0);
        int index = first.path("data").path("index").asInt();
        assertThat(first.path("id").asString()).isEqualTo(created.get(index).toString());
        assertThat(first.path("type").asString()).isEqualTo("SYSTEM");
        assertThat(first.path("title").asString()).isEqualTo("Notice " + index);
        assertThat(first.path("body").asString()).isEqualTo("Body " + index);
        assertThat(first.path("data").path("deepLink").asString()).isEqualTo("/inventory");
        assertThat(first.path("readAt").isNull()).isTrue();
        assertThat(first.path("createdAt").asString()).isNotBlank();

        assertThat(unread(uid)).isEqualTo(25);
        String id = created.get(0).toString();
        JsonNode read =
                callJson(HttpMethod.POST, "/api/v1/notifications/" + id + "/read", uid, null, 200);
        assertThat(read.path("readAt").asString()).isNotBlank();
        JsonNode again =
                callJson(HttpMethod.POST, "/api/v1/notifications/" + id + "/read", uid, null, 200);
        assertThat(again.path("readAt").asString())
                .as("the first read time is kept")
                .isEqualTo(read.path("readAt").asString());
        assertThat(unread(uid)).isEqualTo(24);
        JsonNode unreadOnly =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/notifications?unreadOnly=true&limit=50",
                        uid,
                        null,
                        200);
        assertThat(unreadOnly.path("items")).hasSize(24);
        unreadOnly
                .path("items")
                .forEach(item -> assertThat(item.path("id").asString()).isNotEqualTo(id));

        JsonNode all = callJson(HttpMethod.POST, "/api/v1/notifications/read-all", uid, null, 200);
        assertThat(all.path("updated").asInt()).isEqualTo(24);
        assertThat(unread(uid)).isZero();
        assertThat(
                        callJson(HttpMethod.POST, "/api/v1/notifications/read-all", uid, null, 200)
                                .path("updated")
                                .asInt())
                .isZero();
    }

    @Test
    void notificationsBelongToTheirRecipientOnly() {
        String owner = uniqueUid("nc-mine");
        UUID ownerId = provisionCompliant(owner);
        String other = uniqueUid("nc-theirs");
        provisionCompliant(other);
        UUID id = notificationService.notify(system(ownerId, "private", 1)).notificationId();

        callJson(HttpMethod.POST, "/api/v1/notifications/" + id + "/read", other, null, 404);
        callJson(
                HttpMethod.POST,
                "/api/v1/notifications/" + UUID.randomUUID() + "/read",
                owner,
                null,
                404);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/notifications", other, null, 200)
                                .path("items"))
                .isEmpty();
        assertThat(unread(other)).isZero();
        callJson(HttpMethod.POST, "/api/v1/notifications/read-all", other, null, 200);
        assertThat(unread(owner)).isEqualTo(1);

        callJson(HttpMethod.GET, "/api/v1/notifications", null, null, 401);
        callJson(HttpMethod.GET, "/api/v1/notifications/unread-count", null, null, 401);
        callJson(HttpMethod.POST, "/api/v1/notifications/" + id + "/read", null, null, 401);
        callJson(HttpMethod.POST, "/api/v1/notifications/read-all", null, null, 401);

        callJson(HttpMethod.GET, "/api/v1/notifications?limit=0", owner, null, 400);
        callJson(HttpMethod.GET, "/api/v1/notifications?limit=51", owner, null, 400);
        callJson(HttpMethod.GET, "/api/v1/notifications?cursor=not-a-cursor", owner, null, 400);
        callJson(HttpMethod.POST, "/api/v1/notifications/not-a-uuid/read", owner, null, 400);
    }

    @Test
    void pushTokensAreRegisteredIdempotentlyAndNeverReturned() {
        String first = uniqueUid("nc-device-a");
        UUID firstId = provisionCompliant(first);
        String second = uniqueUid("nc-device-b");
        UUID secondId = provisionCompliant(second);
        String token = "fcm:" + UUID.randomUUID() + ":APA91b-test";

        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("ANDROID", token), 204);
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("ANDROID", token), 204);
        assertThat(tokensOf(firstId)).isEqualTo(1);

        // The same device signs in with another account: the token moves.
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", second, token("IOS", token), 204);
        assertThat(tokensOf(firstId)).isZero();
        assertThat(tokensOf(secondId)).isEqualTo(1);

        // Deleting somebody else's token is a no-op; the owner's delete removes it.
        callJson(HttpMethod.DELETE, "/api/v1/me/push-tokens/" + token, first, null, 204);
        assertThat(tokensOf(secondId)).isEqualTo(1);
        callJson(HttpMethod.DELETE, "/api/v1/me/push-tokens/" + token, second, null, 204);
        assertThat(tokensOf(secondId)).isZero();

        // An invalidated token becomes valid again when registered.
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("WEB", token), 204);
        testUsers.update("UPDATE push_token SET invalid_at = now() WHERE token = ?", token);
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("WEB", token), 204);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM push_token WHERE token = ? AND invalid_at IS"
                                        + " NULL",
                                token))
                .isEqualTo(1);

        // The export lists devices without the token values.
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", first, null, 200);
        JsonNode devices = export.path("sections").path("pushTokens");
        assertThat(devices).hasSize(1);
        assertThat(devices.get(0).path("platform").asString()).isEqualTo("WEB");
        assertThat(export.toString()).doesNotContain(token);

        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("PAGER", token), 400);
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("IOS", ""), 400);
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, token("IOS", "has spaces"), 400);
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", first, Map.of("token", "abc"), 400);
        callJson(
                HttpMethod.POST,
                "/api/v1/me/push-tokens",
                first,
                token("IOS", "x".repeat(4097)),
                400);
        callJson(HttpMethod.POST, "/api/v1/me/push-tokens", null, token("IOS", "abc"), 401);
        callJson(HttpMethod.DELETE, "/api/v1/me/push-tokens/abc", null, null, 401);
    }

    // ---------------------------------------------------------------------------------------

    private long unread(String uid) {
        return callJson(HttpMethod.GET, "/api/v1/notifications/unread-count", uid, null, 200)
                .path("count")
                .asLong();
    }

    private int tokensOf(UUID userId) {
        return testUsers.count(
                "SELECT count(*) FROM push_token WHERE user_id = ? AND invalid_at IS NULL", userId);
    }

    private static Map<String, Object> token(String platform, String token) {
        return Map.of("platform", platform, "token", token);
    }

    private static NotificationRequest system(UUID userId, String key, int index) {
        Map<String, @Nullable Object> data = new LinkedHashMap<>();
        data.put("index", index);
        data.put("deepLink", "/inventory");
        return new NotificationRequest(
                userId,
                NotificationType.SYSTEM,
                "Notice " + index,
                "Body " + index,
                data,
                "test:" + userId + ":" + key);
    }
}
