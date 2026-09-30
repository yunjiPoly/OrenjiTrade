package com.orenjitrade.api.ratings.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.ratings.api.RatingResponses.AdminRatingResponse;
import com.orenjitrade.api.ratings.api.RatingResponses.AdminReferenceResponse;
import com.orenjitrade.api.ratings.domain.RatingModerationState;
import com.orenjitrade.api.ratings.domain.RatingService;
import com.orenjitrade.api.ratings.domain.RatingService.RatingView;
import com.orenjitrade.api.ratings.domain.ReferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/ratings} and {@code /api/v1/admin/references}: moderation of ratings and
 * references (MODERATOR, ADMIN, SUPER_ADMIN; hides and unhides audited).
 */
@RestController
@Validated
@Tag(name = "admin-ratings", description = "Rating and reference moderation (moderator console)")
public class AdminRatingController {

    private final RatingService ratingService;
    private final ReferenceService referenceService;

    public AdminRatingController(RatingService ratingService, ReferenceService referenceService) {
        this.ratingService = ratingService;
        this.referenceService = referenceService;
    }

    @GetMapping(path = "/api/v1/admin/ratings", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listAdminRatings",
            summary = "List ratings (MODERATOR+)",
            description = "Newest first; filter by rated collector, author or moderation state.")
    public PageResponse<AdminRatingResponse> list(
            @RequestParam(required = false) @Nullable UUID rateeId,
            @RequestParam(required = false) @Nullable UUID raterId,
            @RequestParam(required = false) @Nullable RatingModerationState state,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<RatingView> result =
                ratingService.adminList(rateeId, raterId, state, page, size);
        return new PageResponse<>(
                result.items().stream().map(AdminRatingResponse::from).toList(),
                result.page(),
                result.size(),
                result.totalItems(),
                result.totalPages());
    }

    @PostMapping(
            path = "/api/v1/admin/ratings/{id}/hide",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "hideRating",
            summary = "Hide a rating (MODERATOR+)",
            description =
                    "Hidden ratings disappear from the profile and the summary. 409 when already"
                            + " hidden. Audited (`rating.hide`).")
    @ApiResponse(responseCode = "200", description = "The hidden rating")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: already hidden",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = RatingController.PROBLEM_REF)))
    public AdminRatingResponse hide(
            @AuthenticationPrincipal AuthenticatedUser moderator,
            @PathVariable UUID id,
            @Valid @RequestBody HideRequest body) {
        return AdminRatingResponse.from(ratingService.hide(moderator, id, body.reason()));
    }

    @PostMapping(
            path = "/api/v1/admin/ratings/{id}/unhide",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "unhideRating",
            summary = "Show a hidden rating again (MODERATOR+)",
            description = "409 when not hidden. Audited (`rating.unhide`).")
    public AdminRatingResponse unhide(
            @AuthenticationPrincipal AuthenticatedUser moderator, @PathVariable UUID id) {
        return AdminRatingResponse.from(ratingService.unhide(moderator, id));
    }

    @PostMapping(
            path = "/api/v1/admin/references/{id}/hide",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "hideReference",
            summary = "Hide a reference (MODERATOR+)",
            description = "409 when already hidden. Audited (`reference.hide`).")
    public AdminReferenceResponse hideReference(
            @AuthenticationPrincipal AuthenticatedUser moderator,
            @PathVariable UUID id,
            @Valid @RequestBody HideRequest body) {
        return AdminReferenceResponse.from(referenceService.hide(moderator, id, body.reason()));
    }

    @PostMapping(
            path = "/api/v1/admin/references/{id}/unhide",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "unhideReference",
            summary = "Show a hidden reference again (MODERATOR+)",
            description = "409 when not hidden. Audited (`reference.unhide`).")
    public AdminReferenceResponse unhideReference(
            @AuthenticationPrincipal AuthenticatedUser moderator, @PathVariable UUID id) {
        return AdminReferenceResponse.from(referenceService.unhide(moderator, id));
    }

    /** Body of the hide endpoints. */
    @Schema(name = "HideRatingRequest")
    public record HideRequest(
            @Schema(description = "Why (audited; never shown to members)", maxLength = 500)
                    @NotBlank
                    @Size(max = 500)
                    String reason) {}
}
