package com.orenjitrade.api.delisting.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.delisting.domain.ListingPauseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/me/listings}: the caller's listing pause and strikes. */
@RestController
@RequestMapping(path = "/api/v1/me/listings", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "listing-health", description = "Pause of the caller's public listings and strikes")
public class MyListingsController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ListingPauseService pauses;

    public MyListingsController(ListingPauseService pauses) {
        this.pauses = pauses;
    }

    @GetMapping("/status")
    @Operation(
            operationId = "getMyListingStatus",
            summary = "Whether the caller's public listings are paused",
            description =
                    "Paused listings stay in the inventory but nobody else sees them. `canResume`"
                        + " is true for pauses of the nightly job (unanswered conversations reached"
                        + " maxStrikes): POST /me/listings/resume lifts them. Moderation pauses are"
                        + " lifted by the moderation team.")
    public ListingStatusResponse status(@AuthenticationPrincipal AuthenticatedUser principal) {
        return ListingStatusResponse.forOwner(pauses.status(principal.userId()));
    }

    @PostMapping("/resume")
    @Operation(
            operationId = "resumeMyListings",
            summary = "Confirm responsiveness and resume the public listings",
            description =
                    "Lifts a pause of the nightly job (source UNRESPONSIVE) and restarts the"
                            + " strikes from zero. 409 when nothing is paused or when the pause"
                            + " is pending a moderation review. Audited (`listings.resume`).")
    @ApiResponse(responseCode = "200", description = "The new status")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: not paused, or paused by the moderation team",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ListingStatusResponse resume(@AuthenticationPrincipal AuthenticatedUser principal) {
        return ListingStatusResponse.forOwner(pauses.resumeByOwner(principal.userId()));
    }
}
