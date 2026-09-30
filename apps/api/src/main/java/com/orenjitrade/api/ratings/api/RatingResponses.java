package com.orenjitrade.api.ratings.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.RatingModerationState;
import com.orenjitrade.api.ratings.domain.RatingRow;
import com.orenjitrade.api.ratings.domain.RatingService.CollectorRatings;
import com.orenjitrade.api.ratings.domain.RatingService.Eligibility;
import com.orenjitrade.api.ratings.domain.RatingService.EligibleInteraction;
import com.orenjitrade.api.ratings.domain.RatingService.RatingSummaryView;
import com.orenjitrade.api.ratings.domain.RatingService.RatingView;
import com.orenjitrade.api.ratings.domain.ReferenceRow;
import com.orenjitrade.api.ratings.domain.ReferenceService.ReferenceView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response documents of the ratings and references endpoints. */
public final class RatingResponses {

    private RatingResponses() {}

    /** Public identity of a rater or reference author (never a location). */
    @Schema(name = "RatingAuthor")
    public record AuthorResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl) {

        static AuthorResponse of(@Nullable MemberCard card) {
            if (card == null) {
                return new AuthorResponse("deleted", "Deleted collector", null);
            }
            return new AuthorResponse(card.handle(), card.displayName(), card.avatarUrl());
        }
    }

    /** The detailed scores of a rating (each 1-5, optional). */
    @Schema(name = "RatingBreakdown")
    public record BreakdownResponse(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Integer communication,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Integer conditionAccuracy,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Integer shipping,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Integer meetupReliability) {}

    /** A rating as shown on a collector's profile. */
    @Schema(name = "RatingResponse", description = "A rating of a collector")
    public record RatingResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) AuthorResponse rater,
            @Schema(requiredMode = RequiredMode.REQUIRED, minimum = "1", maximum = "5") int overall,
            @Schema(requiredMode = RequiredMode.REQUIRED) BreakdownResponse breakdown,
            @Schema(nullable = true, maxLength = 600) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String comment,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) InteractionKind interactionKind,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "End of the author's 14-day edit window")
                    Instant editableUntil) {

        static RatingResponse from(RatingView view) {
            RatingRow row = view.row();
            return new RatingResponse(
                    row.id(),
                    AuthorResponse.of(view.rater()),
                    row.scores().overall(),
                    new BreakdownResponse(
                            row.scores().communication(),
                            row.scores().conditionAccuracy(),
                            row.scores().shipping(),
                            row.scores().meetupReliability()),
                    row.comment(),
                    row.createdAt(),
                    row.updatedAt(),
                    row.interactionKind(),
                    view.editableUntil());
        }
    }

    /** Averages of a collector's visible ratings (one decimal). */
    @Schema(name = "RatingSummaryResponse")
    public record RatingSummaryResponse(
            @Schema(nullable = true, example = "4.7") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double average,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "12") int count,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double communication,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double conditionAccuracy,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double shipping,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double meetupReliability) {

        static RatingSummaryResponse from(RatingSummaryView view) {
            return new RatingSummaryResponse(
                    view.average(),
                    view.count(),
                    view.communication(),
                    view.conditionAccuracy(),
                    view.shipping(),
                    view.meetupReliability());
        }
    }

    /** {@code GET /collectors/{handle}/ratings}: a cursor page plus the summary. */
    @Schema(name = "CollectorRatingsPage")
    public record CollectorRatingsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) List<RatingResponse> items,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String nextCursor,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean hasMore,
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingSummaryResponse summary) {

        static CollectorRatingsResponse from(CollectorRatings ratings) {
            return new CollectorRatingsResponse(
                    ratings.page().items().stream().map(RatingResponse::from).toList(),
                    ratings.page().nextCursor(),
                    ratings.page().hasMore(),
                    RatingSummaryResponse.from(ratings.summary()));
        }
    }

    /** One interaction of the eligibility answer. */
    @Schema(name = "RatingEligibilityInteraction")
    public record EligibleInteractionResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) InteractionKind kind,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant occurredAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean alreadyRated) {

        static EligibleInteractionResponse from(EligibleInteraction interaction) {
            return new EligibleInteractionResponse(
                    interaction.id(),
                    interaction.kind(),
                    interaction.occurredAt(),
                    interaction.alreadyRated());
        }
    }

    /** {@code GET /ratings/eligibility}. */
    @Schema(name = "RatingEligibility")
    public record EligibilityResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "At least one interaction is not rated yet")
                    boolean eligible,
            @Schema(requiredMode = RequiredMode.REQUIRED)
                    List<EligibleInteractionResponse> interactions) {

        static EligibilityResponse from(Eligibility eligibility) {
            return new EligibilityResponse(
                    eligibility.eligible(),
                    eligibility.interactions().stream()
                            .map(EligibleInteractionResponse::from)
                            .toList());
        }
    }

    /** A rating in the moderator console (includes the ratee and the moderation state). */
    @Schema(name = "AdminRating")
    public record AdminRatingResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingResponse rating,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID raterId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID rateeId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID interactionId,
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingModerationState moderationState,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String hiddenReason,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID hiddenBy,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant hiddenAt) {

        static AdminRatingResponse from(RatingView view) {
            RatingRow row = view.row();
            return new AdminRatingResponse(
                    RatingResponse.from(view),
                    row.raterId(),
                    row.rateeId(),
                    row.interactionId(),
                    row.moderationState(),
                    row.hiddenReason(),
                    row.hiddenBy(),
                    row.hiddenAt());
        }
    }

    /** A reference as shown on a collector's profile. */
    @Schema(name = "ReferenceResponse", description = "A public reference about a collector")
    public record ReferenceResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) AuthorResponse author,
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 400) String body,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static ReferenceResponse from(ReferenceView view) {
            ReferenceRow row = view.row();
            return new ReferenceResponse(
                    row.id(), AuthorResponse.of(view.author()), row.body(), row.createdAt());
        }
    }

    /** A reference in the moderator console. */
    @Schema(name = "AdminReference")
    public record AdminReferenceResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) ReferenceResponse reference,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID authorId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID subjectId,
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingModerationState moderationState,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String hiddenReason) {

        static AdminReferenceResponse from(ReferenceView view) {
            ReferenceRow row = view.row();
            return new AdminReferenceResponse(
                    ReferenceResponse.from(view),
                    row.authorId(),
                    row.subjectId(),
                    row.moderationState(),
                    row.hiddenReason());
        }
    }
}
