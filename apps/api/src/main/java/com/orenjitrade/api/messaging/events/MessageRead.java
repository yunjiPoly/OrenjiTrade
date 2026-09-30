package com.orenjitrade.api.messaging.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a participant moves their read marker forward (notification clean-up, Phase 6;
 * responsiveness signals, Phase 7).
 *
 * @param conversationId the conversation
 * @param readerId who read
 * @param senderId the other participant (whose messages were read)
 * @param lastReadMessageId the newest message read
 * @param occurredAt when
 */
public record MessageRead(
        UUID conversationId,
        UUID readerId,
        UUID senderId,
        UUID lastReadMessageId,
        Instant occurredAt) {}
