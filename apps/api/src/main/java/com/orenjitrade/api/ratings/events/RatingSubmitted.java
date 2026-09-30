package com.orenjitrade.api.ratings.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction that stored or edited a rating (analytics). Carries no comment
 * text.
 *
 * @param ratingId the rating
 * @param raterId author
 * @param rateeId rated collector
 * @param interactionKind kind of the rated interaction
 * @param overall overall score
 * @param hasComment whether a comment was written
 * @param edited whether this is an edit of an existing rating
 * @param occurredAt when
 */
public record RatingSubmitted(
        UUID ratingId,
        UUID raterId,
        UUID rateeId,
        String interactionKind,
        int overall,
        boolean hasComment,
        boolean edited,
        Instant occurredAt) {}
