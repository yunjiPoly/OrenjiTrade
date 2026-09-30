package com.orenjitrade.api.ratings.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.common.ProblemFieldError;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Pure rating rules: the 14-day edit window, score validation, rounding and qualification. */
class RatingRulesTest {

    static final Instant CREATED = Instant.parse("2026-09-01T10:00:00Z");

    @Test
    void ratingsAreEditableForFourteenDays() {
        assertThat(RatingRules.editableUntil(CREATED)).isEqualTo(CREATED.plus(Duration.ofDays(14)));
        assertThat(RatingRules.isEditable(CREATED, CREATED)).isTrue();
        assertThat(
                        RatingRules.isEditable(
                                CREATED, CREATED.plus(Duration.ofDays(14)).minusSeconds(1)))
                .isTrue();
        assertThat(RatingRules.isEditable(CREATED, CREATED.plus(Duration.ofDays(14)))).isFalse();
        assertThat(RatingRules.isEditable(CREATED, CREATED.plus(Duration.ofDays(30)))).isFalse();
    }

    @Test
    void scoresAreOneToFiveAndOverallIsRequired() {
        assertThat(RatingRules.validate(5, null, null, null, null, null)).isEmpty();
        assertThat(RatingRules.validate(1, 1, 5, 3, 2, "Fine")).isEmpty();
        assertThat(RatingRules.validate(null, null, null, null, null, null))
                .extracting(ProblemFieldError::field)
                .containsExactly("overall");
        assertThat(RatingRules.validate(0, 6, null, -1, 9, null))
                .extracting(ProblemFieldError::field)
                .containsExactly("overall", "communication", "shipping", "meetupReliability");
        assertThat(RatingRules.validate(4, null, null, null, null, "x".repeat(601)))
                .extracting(ProblemFieldError::field)
                .containsExactly("comment");
        assertThat(RatingRules.validate(4, null, null, null, null, "x".repeat(600))).isEmpty();
    }

    @Test
    void commentsAreTrimmedAndAveragesRounded() {
        assertThat(RatingRules.cleanComment("  great trade  ")).isEqualTo("great trade");
        assertThat(RatingRules.cleanComment("   ")).isNull();
        assertThat(RatingRules.cleanComment(null)).isNull();
        assertThat(RatingRules.oneDecimal(new BigDecimal("4.67"))).isEqualTo(4.7);
        assertThat(RatingRules.oneDecimal(new BigDecimal("4.25"))).isEqualTo(4.3);
        assertThat(RatingRules.oneDecimal(null)).isNull();
    }

    @Test
    void conversationsQualifyWithThreeMessagesFromEachSide() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        assertThat(InteractionService.qualifies(Map.of(a, 3L, b, 3L), a, b)).isTrue();
        assertThat(InteractionService.qualifies(Map.of(a, 10L, b, 2L), a, b)).isFalse();
        assertThat(InteractionService.qualifies(Map.of(a, 3L), a, b)).isFalse();
        assertThat(InteractionService.qualifies(Map.of(), a, b)).isFalse();
    }

    @Test
    void interactionKindsPointAtTheirSubjects() {
        assertThat(InteractionKind.TRADE.subjectType()).isEqualTo(InteractionSubjectType.TRADE);
        assertThat(InteractionKind.OFFER_ACCEPTED.subjectType())
                .isEqualTo(InteractionSubjectType.OFFER);
        assertThat(InteractionKind.CONVERSATION_QUALIFIED.subjectType())
                .isEqualTo(InteractionSubjectType.CONVERSATION);
    }
}
