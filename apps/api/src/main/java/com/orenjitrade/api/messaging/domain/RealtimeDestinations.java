package com.orenjitrade.api.messaging.domain;

import java.util.List;

/**
 * STOMP destinations of the realtime channel (Phase 5 contract "Realtime"). Clients subscribe to
 * {@code /user/queue/<name>} (their own queues only, enforced by the server) and send to {@code
 * /app/typing}.
 */
public final class RealtimeDestinations {

    /** New {@code MessageResponse}s of the caller's conversations (both directions). */
    public static final String MESSAGES = "/queue/messages";

    /** Read receipts {@code {conversationId, userId, lastReadMessageId, readAt}}. */
    public static final String RECEIPTS = "/queue/receipts";

    /** Typing notices {@code {conversationId, userId}}. */
    public static final String TYPING = "/queue/typing";

    /** Presence changes of conversation partners who show their online status. */
    public static final String PRESENCE = "/queue/presence";

    /** Reserved for Phase 6 notifications. */
    public static final String NOTIFICATIONS = "/queue/notifications";

    /** Errors of client frames that were accepted but could not be processed. */
    public static final String ERRORS = "/queue/errors";

    /** Every destination a server-side publisher may target. */
    public static final List<String> ALL =
            List.of(MESSAGES, RECEIPTS, TYPING, PRESENCE, NOTIFICATIONS, ERRORS);

    /** User destination prefix of subscriptions ({@code /user/queue/messages}). */
    public static final String USER_PREFIX = "/user";

    /** Application prefix of client SEND frames. */
    public static final String APP_PREFIX = "/app";

    /** The typing endpoint ({@code SEND /app/typing {conversationId}}). */
    public static final String APP_TYPING = APP_PREFIX + "/typing";

    private RealtimeDestinations() {}
}
