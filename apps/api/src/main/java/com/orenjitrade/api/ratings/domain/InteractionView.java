package com.orenjitrade.api.ratings.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * A stored interaction between two collectors.
 *
 * @param id interaction id
 * @param kind what happened
 * @param userA the participant with the lower id
 * @param userB the participant with the higher id
 * @param subjectType what {@code subjectId} identifies
 * @param subjectId trade, offer or conversation id
 * @param occurredAt when
 */
public record InteractionView(
        UUID id,
        InteractionKind kind,
        UUID userA,
        UUID userB,
        InteractionSubjectType subjectType,
        UUID subjectId,
        Instant occurredAt) {

    /** Whether {@code userId} took part. */
    public boolean involves(UUID userId) {
        return userA.equals(userId) || userB.equals(userId);
    }

    /** The other participant of {@code userId} (who must take part). */
    public UUID otherThan(UUID userId) {
        return userA.equals(userId) ? userB : userA;
    }
}
