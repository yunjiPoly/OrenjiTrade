package com.orenjitrade.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.messaging.domain.RealtimePublisher;
import com.orenjitrade.api.notifications.domain.EmailProvider;
import com.orenjitrade.api.notifications.domain.NotificationDispatcher;
import com.orenjitrade.api.notifications.domain.NotificationService;
import com.orenjitrade.api.notifications.domain.PushProvider;
import com.orenjitrade.api.notifications.domain.PushTokenService;
import com.orenjitrade.api.notifications.events.NotificationCreated;
import com.orenjitrade.api.notifications.infra.NotificationRepository;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * The dispatcher's push channel with a provider that rejects some devices (as FCM does with
 * UNREGISTERED tokens): rejected tokens are invalidated and never used again, the channel state
 * records the outcome, and a dispatched notification is never delivered twice.
 */
class PushDeliveryIT extends AbstractIntegrationTest {

    @Autowired private NotificationRepository repository;
    @Autowired private NotificationService notificationService;
    @Autowired private PushTokenService pushTokens;
    @Autowired private EmailProvider emailProvider;
    @Autowired private RealtimePublisher realtime;
    @Autowired private UserAccountService accounts;
    @Autowired private TimeProvider timeProvider;

    @Test
    void tokensThePushProviderRejectsAreInvalidated() {
        String uid = uniqueUid("pd-owner");
        UUID userId = provisionCompliant(uid);
        String good = "good-" + UUID.randomUUID();
        String stale = "stale-" + UUID.randomUUID();
        for (String token : List.of(good, stale)) {
            callJson(
                    HttpMethod.POST,
                    "/api/v1/me/push-tokens",
                    uid,
                    Map.of("platform", "ANDROID", "token", token),
                    204);
        }
        List<List<String>> calls = new ArrayList<>();
        PushProvider rejecting =
                new PushProvider() {
                    @Override
                    public String name() {
                        return "stub";
                    }

                    @Override
                    public PushResult send(PushMessage message, List<String> tokens) {
                        calls.add(List.copyOf(tokens));
                        return new PushResult(
                                tokens.contains(good) ? 1 : 0,
                                tokens.contains(stale) ? 1 : 0,
                                tokens.contains(stale) ? List.of(stale) : List.of());
                    }
                };
        NotificationDispatcher dispatcher =
                new NotificationDispatcher(
                        repository,
                        notificationService,
                        pushTokens,
                        rejecting,
                        emailProvider,
                        realtime,
                        accounts,
                        timeProvider);

        UUID first = pendingPush(userId);
        dispatcher.dispatch(new NotificationCreated(first, userId, "SYSTEM", Instant.now()));
        assertThat(calls).hasSize(1);
        assertThat(calls.get(0)).containsExactlyInAnyOrder(good, stale);
        assertThat(state(first))
                .contains("\"push\": \"SENT\"")
                .contains("\"pushProvider\": \"stub\"")
                .contains("\"pushDelivered\": 1")
                .contains("\"pushFailed\": 1")
                .contains("dispatchedAt");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM push_token WHERE token = ? AND invalid_at IS"
                                        + " NOT NULL",
                                stale))
                .isEqualTo(1);
        assertThat(pushTokens.activeTokens(userId)).containsExactly(good);

        // Redelivery of the same event: nothing is sent again.
        dispatcher.dispatch(new NotificationCreated(first, userId, "SYSTEM", Instant.now()));
        assertThat(calls).hasSize(1);

        // The next notification only uses the valid device.
        UUID second = pendingPush(userId);
        dispatcher.dispatch(new NotificationCreated(second, userId, "SYSTEM", Instant.now()));
        assertThat(calls).hasSize(2);
        assertThat(calls.get(1)).containsExactly(good);

        // Every device rejected: FAILED.
        testUsers.update("UPDATE push_token SET invalid_at = now() WHERE user_id = ?", userId);
        callJson(
                HttpMethod.POST,
                "/api/v1/me/push-tokens",
                uid,
                Map.of("platform", "IOS", "token", stale),
                204);
        UUID third = pendingPush(userId);
        dispatcher.dispatch(new NotificationCreated(third, userId, "SYSTEM", Instant.now()));
        assertThat(state(third)).contains("\"push\": \"FAILED\"");
        assertThat(pushTokens.activeTokens(userId)).isEmpty();
    }

    /** A stored notification whose push channel is still pending (no event published). */
    private UUID pendingPush(UUID userId) {
        UUID id = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO notification (id, user_id, type, title, body, data, dedup_key, in_app,"
                        + " channel_state) VALUES (?, ?, 'SYSTEM', 'Test push', 'Body',"
                        + " '{\"deepLink\": \"/inventory\"}'::jsonb, ?, true,"
                        + " '{\"realtime\": \"SENT\", \"push\": \"PENDING\", \"email\":"
                        + " \"SKIPPED\"}'::jsonb)",
                id,
                userId,
                "push-test:" + id);
        return id;
    }

    private String state(UUID id) {
        return (String)
                testUsers
                        .query(
                                "SELECT channel_state::text AS state FROM notification WHERE id ="
                                        + " ?",
                                id)
                        .get(0)
                        .get("state");
    }
}
