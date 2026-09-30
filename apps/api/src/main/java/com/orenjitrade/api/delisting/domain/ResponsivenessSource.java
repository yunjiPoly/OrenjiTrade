package com.orenjitrade.api.delisting.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Extension point of the nightly delist job: conversations waiting for a collector's answer.
 * Implemented by the messaging module (which depends on this one), so the dependency only points
 * from messaging to delisting. Without an implementation nobody gets strikes.
 */
public interface ResponsivenessSource {

    /**
     * Conversations whose latest message was sent by the other participant between {@code from}
     * (inclusive) and {@code to} (exclusive) and has not been answered since; one entry per waiting
     * participant. Conversations blocked in either direction are excluded.
     */
    List<UnansweredConversation> unansweredBetween(Instant from, Instant to);

    /**
     * One conversation waiting for {@code userId}'s answer.
     *
     * @param userId the participant who has not answered
     * @param conversationId the conversation
     * @param waitingSince when the unanswered message was sent
     */
    record UnansweredConversation(UUID userId, UUID conversationId, Instant waitingSince) {}
}
