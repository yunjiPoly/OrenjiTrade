package com.orenjitrade.api.ratings.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.ratings.api.RatingResponses.CollectorRatingsResponse;
import com.orenjitrade.api.ratings.api.RatingResponses.ReferenceResponse;
import com.orenjitrade.api.ratings.domain.RatingService;
import com.orenjitrade.api.ratings.domain.ReferenceService;
import com.orenjitrade.api.ratings.domain.ReferenceService.ReferenceView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/collectors/{handle}/ratings|references}: a collector's visible ratings (with
 * the summary) and references, under the same visibility rules as the profile.
 */
@RestController
@Validated
@Tag(name = "ratings", description = "Ratings and references between collectors")
public class CollectorRatingsController {

    private final RatingService ratingService;
    private final ReferenceService referenceService;

    public CollectorRatingsController(
            RatingService ratingService, ReferenceService referenceService) {
        this.ratingService = ratingService;
        this.referenceService = referenceService;
    }

    @GetMapping(
            path = "/api/v1/collectors/{handle}/ratings",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listCollectorRatings",
            summary = "A collector's ratings and rating summary",
            description =
                    "Visible ratings, newest first (cursor pages), with the averages of the"
                            + " breakdown (one decimal). Hidden ratings are neither listed nor"
                            + " counted. 404 when the profile is not visible to the caller.")
    @ApiResponse(responseCode = "200", description = "Ratings and summary")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown collector or profile not visible",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = RatingController.PROBLEM_REF)))
    public CollectorRatingsResponse ratings(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String handle,
            @RequestParam(required = false) @Size(max = 200) @Nullable String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(RatingService.MAX_LIMIT) int limit) {
        return CollectorRatingsResponse.from(
                ratingService.ratingsOf(principal.userId(), handle, cursor, limit));
    }

    @GetMapping(
            path = "/api/v1/collectors/{handle}/references",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listCollectorReferences",
            summary = "A collector's references",
            description =
                    "Visible references, newest first (cursor pages). 404 when the profile is not"
                            + " visible to the caller.")
    @ApiResponse(responseCode = "200", description = "References")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown collector or profile not visible",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = RatingController.PROBLEM_REF)))
    public CursorPage<ReferenceResponse> references(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String handle,
            @RequestParam(required = false) @Size(max = 200) @Nullable String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(RatingService.MAX_LIMIT) int limit) {
        CursorPage<ReferenceView> page =
                referenceService.referencesOf(principal.userId(), handle, cursor, limit);
        return new CursorPage<>(
                page.items().stream().map(ReferenceResponse::from).toList(),
                page.nextCursor(),
                page.hasMore());
    }
}
