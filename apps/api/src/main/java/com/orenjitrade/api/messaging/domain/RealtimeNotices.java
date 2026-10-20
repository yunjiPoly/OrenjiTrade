package com.orenjitrade.api.messaging.domain;

import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import java.time.Instant;
import java.util.UUID;

/** Payloads of the realtime queues other than {@code /user/queue/messages}. */
public final class RealtimeNotices {

    private RealtimeNotices() {}

    /**
     * {@code /user/queue/receipts}: {@code userId} read the conversation up to {@code
     * lastReadMessageId}.
     */
    public record ReadReceipt(
            UUID conversationId, UUID userId, UUID lastReadMessageId, Instant readAt) {}

    /** {@code /user/queue/typing}: {@code userId} is typing in {@code conversationId}. */
    public record Typing(UUID conversationId, UUID userId) {}

    /** {@code /user/queue/presence}: a conversation partner came online or went offline. */
    public record Presence(UUID userId, OnlineStatus status) {}

    /**
     * {@code /user/queue/conversations} (stage R4): the card or deck core {@code conversationId} is
     * about was pinned (again) by one of its two collectors; nothing else is said, the client reads
     * the conversation.
     */
    public record ConversationChanged(UUID conversationId) {}
}
