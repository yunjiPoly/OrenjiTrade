package com.orenjitrade.api.ratings.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.ratings.api.RatingResponses.EligibilityResponse;
import com.orenjitrade.api.ratings.api.RatingResponses.RatingResponse;
import com.orenjitrade.api.ratings.api.RatingResponses.ReferenceResponse;
import com.orenjitrade.api.ratings.domain.RatingScores;
import com.orenjitrade.api.ratings.domain.RatingService;
import com.orenjitrade.api.ratings.domain.ReferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/ratings} and {@code /api/v1/references}: rating eligibility, writing and editing
 * ratings, writing references (Phase 7). The actor is always the caller.
 */
@RestController
@Validated
@Tag(name = "ratings", description = "Ratings and references between collectors")
public class RatingController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final RatingService ratingService;
    private final ReferenceService referenceService;

    public RatingController(RatingService ratingService, ReferenceService referenceService) {
        this.ratingService = ratingService;
        this.referenceService = referenceService;
    }

    @GetMapping(path = "/api/v1/ratings/eligibility", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getRatingEligibility",
            summary = "Whether the caller can rate a collector",
            description =
                    "The caller's interactions with the collector (completed trades, accepted"
                        + " offers, conversations with at least 3 messages from each side), each"
                        + " with alreadyRated. eligible = at least one interaction is not rated"
                        + " yet. 400 for oneself.")
    public EligibilityResponse eligibility(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "The collector to rate", required = true) @RequestParam
                    UUID userId) {
        return EligibilityResponse.from(ratingService.eligibility(principal.userId(), userId));
    }

    @PostMapping(
            path = "/api/v1/ratings",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createRating",
            summary = "Rate the other party of an interaction",
            description =
                    "overall 1-5 is required, the breakdown scores are optional (1-5), the comment"
                        + " at most 600 characters (banned terms refused). 403 RATING_NOT_ELIGIBLE"
                        + " when the interaction does not exist or is not the caller's; 409"
                        + " ALREADY_RATED (extension ratingId) for a second rating of the same"
                        + " interaction. The collector gets a RATING_RECEIVED notification. The"
                        + " rating stays editable for 14 days (PUT /ratings/{id}).")
    @ApiResponse(responseCode = "201", description = "The new rating")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "403",
            description = "RATING_NOT_ELIGIBLE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "ALREADY_RATED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<RatingResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CreateRatingRequest body) {
        RatingResponse created =
                RatingResponse.from(
                        ratingService.submit(
                                principal.userId(),
                                body.interactionId(),
                                body.scores(),
                                body.comment()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/ratings/" + created.id()))
                .body(created);
    }

    @PutMapping(
            path = "/api/v1/ratings/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateRating",
            summary = "Edit one of the caller's ratings (within 14 days)",
            description =
                    "Replaces the scores and the comment. 404 for other users' ratings, 409"
                            + " RATING_EDIT_WINDOW_CLOSED (extension editableUntil) after 14"
                            + " days.")
    @ApiResponse(responseCode = "200", description = "The edited rating")
    @ApiResponse(
            responseCode = "409",
            description = "RATING_EDIT_WINDOW_CLOSED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public RatingResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateRatingRequest body) {
        return RatingResponse.from(
                ratingService.update(principal.userId(), id, body.scores(), body.comment()));
    }

    @PostMapping(
            path = "/api/v1/references",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createReference",
            summary = "Write a public reference for a collector",
            description =
                    "One per author and collector, at most 400 characters (banned terms refused),"
                            + " after at least one interaction (403 RATING_NOT_ELIGIBLE"
                            + " otherwise); 409 CONFLICT for a second reference.")
    @ApiResponse(responseCode = "201", description = "The new reference")
    @ApiResponse(
            responseCode = "403",
            description = "RATING_NOT_ELIGIBLE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: already written",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<ReferenceResponse> createReference(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CreateReferenceRequest body) {
        ReferenceResponse created =
                ReferenceResponse.from(
                        referenceService.create(principal.userId(), body.subjectId(), body.body()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/references/" + created.id()))
                .body(created);
    }

    /** Body of {@code POST /ratings}. */
    @Schema(name = "CreateRatingRequest")
    public record CreateRatingRequest(
            @NotNull UUID interactionId,
            @NotNull @Min(1) @Max(5) @Schema(example = "5") Integer overall,
            @Min(1) @Max(5) @Nullable Integer communication,
            @Min(1) @Max(5) @Nullable Integer conditionAccuracy,
            @Min(1) @Max(5) @Nullable Integer shipping,
            @Min(1) @Max(5) @Nullable Integer meetupReliability,
            @Size(max = 600) @Nullable String comment) {

        RatingScores scores() {
            return new RatingScores(
                    overall, communication, conditionAccuracy, shipping, meetupReliability);
        }
    }

    /** Body of {@code PUT /ratings/{id}}. */
    @Schema(name = "UpdateRatingRequest")
    public record UpdateRatingRequest(
            @NotNull @Min(1) @Max(5) @Schema(example = "4") Integer overall,
            @Min(1) @Max(5) @Nullable Integer communication,
            @Min(1) @Max(5) @Nullable Integer conditionAccuracy,
            @Min(1) @Max(5) @Nullable Integer shipping,
            @Min(1) @Max(5) @Nullable Integer meetupReliability,
            @Size(max = 600) @Nullable String comment) {

        RatingScores scores() {
            return new RatingScores(
                    overall, communication, conditionAccuracy, shipping, meetupReliability);
        }
    }

    /** Body of {@code POST /references}. */
    @Schema(name = "CreateReferenceRequest")
    public record CreateReferenceRequest(
            @NotNull UUID subjectId,
            @NotBlank @Size(max = 400) @Schema(maxLength = 400) String body) {}
}
