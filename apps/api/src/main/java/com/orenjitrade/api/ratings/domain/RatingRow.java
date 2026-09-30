package com.orenjitrade.api.ratings.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored rating with the kind of its interaction.
 *
 * @param id rating id
 * @param interactionId the rated interaction
 * @param interactionKind its kind
 * @param raterId author
 * @param rateeId rated collector
 * @param scores the scores
 * @param comment public comment
 * @param createdAt creation (starts the 14-day edit window)
 * @param updatedAt last edit
 * @param moderationState OK or HIDDEN
 * @param hiddenReason moderator reason of a hide
 * @param hiddenBy hiding moderator
 * @param hiddenAt when it was hidden
 */
public record RatingRow(
        UUID id,
        UUID interactionId,
        InteractionKind interactionKind,
        UUID raterId,
        UUID rateeId,
        RatingScores scores,
        @Nullable String comment,
        Instant createdAt,
        Instant updatedAt,
        RatingModerationState moderationState,
        @Nullable String hiddenReason,
        @Nullable UUID hiddenBy,
        @Nullable Instant hiddenAt) {}
