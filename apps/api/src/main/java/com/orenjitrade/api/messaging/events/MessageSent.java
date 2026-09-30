package com.orenjitrade.api.messaging.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that stored a private message (Spring Modulith registry). For
 * Phase 6 notifications (muted conversations excluded there) and Phase 7 rating eligibility.
 * Carries ids and the kind only, never the text.
 *
 * @param messageId the message
 * @param conversationId its conversation
 * @param senderId sender
 * @param recipientId the other participant
 * @param kind message kind name
 * @param occurredAt creation time of the message
 */
public record MessageSent(
        UUID messageId,
        UUID conversationId,
        UUID senderId,
        UUID recipientId,
        String kind,
        Instant occurredAt) {}
