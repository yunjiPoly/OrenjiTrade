package com.orenjitrade.api.moderation.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored flag (admin views).
 *
 * @param id flag id
 * @param subjectType what is flagged
 * @param subjectId id of the flagged row or account
 * @param ruleId the rule that fired, when still present
 * @param reason why
 * @param authorId author of the content (or the account itself)
 * @param createdAt when
 * @param resolvedAt resolution time, {@code null} while open
 * @param resolvedBy resolving moderator
 * @param resolutionNote note of the resolving moderator
 */
public record ModerationFlagView(
        UUID id,
        FlagSubjectType subjectType,
        UUID subjectId,
        @Nullable UUID ruleId,
        FlagReason reason,
        @Nullable UUID authorId,
        Instant createdAt,
        @Nullable Instant resolvedAt,
        @Nullable UUID resolvedBy,
        @Nullable String resolutionNote) {

    public boolean open() {
        return resolvedAt == null;
    }
}
