package com.orenjitrade.api.notifications.domain;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Push delivery abstraction (Phase 6 contract): {@code LogPushProvider} by default (local and
 * tests, nothing leaves the machine), {@code FcmPushProvider} only with {@code PUSH_PROVIDER=fcm}.
 * Implementations never throw for delivery problems: they report them in the {@link PushResult},
 * including tokens the provider declared unregistered (the dispatcher invalidates them).
 */
public interface PushProvider {

    /** Provider name for logs and channel state ({@code log}, {@code fcm}). */
    String name();

    /**
     * Sends one notification to the given device tokens of one account.
     *
     * @param message what to show
     * @param tokens active device tokens (never empty)
     */
    PushResult send(PushMessage message, List<String> tokens);

    /**
     * A push notification.
     *
     * @param notificationId the stored notification
     * @param userId recipient
     * @param type notification type
     * @param title title
     * @param body body
     * @param data string data for the client (notification id, type, deep link)
     */
    record PushMessage(
            UUID notificationId,
            UUID userId,
            NotificationType type,
            String title,
            String body,
            Map<String, String> data) {

        public PushMessage {
            data = Map.copyOf(data);
        }
    }

    /**
     * Outcome of one send.
     *
     * @param delivered tokens the provider accepted
     * @param failed tokens that failed
     * @param invalidTokens tokens the provider reported as unregistered or invalid (a subset of the
     *     failed ones)
     */
    record PushResult(int delivered, int failed, List<String> invalidTokens) {

        public PushResult {
            invalidTokens = List.copyOf(invalidTokens);
        }
    }
}
