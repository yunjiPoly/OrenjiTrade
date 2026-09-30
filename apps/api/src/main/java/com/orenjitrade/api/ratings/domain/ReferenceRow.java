package com.orenjitrade.api.ratings.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored reference.
 *
 * @param id reference id
 * @param authorId author
 * @param subjectId the collector it is about
 * @param body text (at most 400 characters)
 * @param createdAt creation
 * @param updatedAt last change
 * @param moderationState OK or HIDDEN
 * @param hiddenReason moderator reason of a hide
 * @param hiddenBy hiding moderator
 * @param hiddenAt when it was hidden
 */
public record ReferenceRow(
        UUID id,
        UUID authorId,
        UUID subjectId,
        String body,
        Instant createdAt,
        Instant updatedAt,
        RatingModerationState moderationState,
        @Nullable String hiddenReason,
        @Nullable UUID hiddenBy,
        @Nullable Instant hiddenAt) {}
