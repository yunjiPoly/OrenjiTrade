package com.orenjitrade.api.ratings.domain;

import com.orenjitrade.api.common.ProblemFieldError;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** Pure rules of ratings and references (Phase 7 contract). */
public final class RatingRules {

    /** A rating can be edited by its author for this long after its creation. */
    public static final Duration EDIT_WINDOW = Duration.ofDays(14);

    public static final int COMMENT_MAX = 600;
    public static final int REFERENCE_MAX = 400;

    private RatingRules() {}

    /** Until when a rating created at {@code createdAt} can be edited. */
    public static Instant editableUntil(Instant createdAt) {
        return createdAt.plus(EDIT_WINDOW);
    }

    /** Whether a rating created at {@code createdAt} can still be edited at {@code now}. */
    public static boolean isEditable(Instant createdAt, Instant now) {
        return now.isBefore(editableUntil(createdAt));
    }

    /** Field errors of a set of scores (1-5, overall required) and a comment. */
    public static List<ProblemFieldError> validate(
            @Nullable Integer overall,
            @Nullable Integer communication,
            @Nullable Integer conditionAccuracy,
            @Nullable Integer shipping,
            @Nullable Integer meetupReliability,
            @Nullable String comment) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (overall == null) {
            errors.add(new ProblemFieldError("overall", "is required"));
        } else {
            score("overall", overall, errors);
        }
        score("communication", communication, errors);
        score("conditionAccuracy", conditionAccuracy, errors);
        score("shipping", shipping, errors);
        score("meetupReliability", meetupReliability, errors);
        if (comment != null && comment.strip().length() > COMMENT_MAX) {
            errors.add(
                    new ProblemFieldError(
                            "comment", "must be at most " + COMMENT_MAX + " characters"));
        }
        return errors;
    }

    /** A trimmed comment, {@code null} when blank. */
    public static @Nullable String cleanComment(@Nullable String comment) {
        if (comment == null || comment.isBlank()) {
            return null;
        }
        return comment.strip();
    }

    /** An average rounded to one decimal for public documents ({@code null} stays null). */
    public static @Nullable Double oneDecimal(@Nullable BigDecimal average) {
        return average == null ? null : average.setScale(1, RoundingMode.HALF_UP).doubleValue();
    }

    private static void score(
            String field, @Nullable Integer value, List<ProblemFieldError> errors) {
        if (value != null && (value < 1 || value > 5)) {
            errors.add(new ProblemFieldError(field, "must be between 1 and 5"));
        }
    }
}
