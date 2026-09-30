package com.orenjitrade.api.delisting.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.delisting.domain.ListingPauseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/users/{id}/pause-listings|resume-listings|listing-status}: pause and resume
 * a collector's public listings (ADMIN, SUPER_ADMIN; audited). Nothing is ever deleted.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/users/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-delisting", description = "Auto-delist rules (admin console)")
public class AdminListingPauseController {

    private final ListingPauseService pauses;

    public AdminListingPauseController(ListingPauseService pauses) {
        this.pauses = pauses;
    }

    @GetMapping("/listing-status")
    @Operation(
            operationId = "getUserListingStatus",
            summary = "A collector's listing pause and strikes (ADMIN)")
    @ApiResponse(responseCode = "200", description = "The listing status")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown account",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = MyListingsController.PROBLEM_REF)))
    public ListingStatusResponse status(@PathVariable UUID id) {
        return ListingStatusResponse.forAdmin(pauses.adminStatus(id));
    }

    @PostMapping(path = "/pause-listings", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "pauseUserListings",
            summary = "Pause a collector's public listings (ADMIN)",
            description =
                    "The listings stay in the collector's inventory; nobody else sees them until an"
                        + " admin resumes them or `until` passes. 409 when already paused. Audited"
                        + " (`listings.pause`); the collector is notified without the reason.")
    @ApiResponse(responseCode = "200", description = "The new status")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: already paused",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = MyListingsController.PROBLEM_REF)))
    public ListingStatusResponse pause(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody PauseListingsRequest body) {
        return ListingStatusResponse.forAdmin(
                pauses.adminPause(actor, id, body.reason().trim(), body.until()));
    }

    @PostMapping(path = "/resume-listings")
    @Operation(
            operationId = "resumeUserListings",
            summary = "Resume a collector's public listings (ADMIN)",
            description =
                    "Lifts any pause (job, report threshold, moderation or admin). 409 when"
                            + " nothing is paused. Audited (`listings.resume`).")
    @ApiResponse(responseCode = "200", description = "The new status")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: not paused",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = MyListingsController.PROBLEM_REF)))
    public ListingStatusResponse resume(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable ResumeListingsRequest body) {
        return ListingStatusResponse.forAdmin(
                pauses.adminResume(actor, id, body == null ? null : body.note()));
    }

    /** Body of {@code POST /admin/users/{id}/pause-listings}. */
    @Schema(name = "PauseListingsRequest")
    public record PauseListingsRequest(
            @Schema(description = "Why (audited; never shown to the collector)", maxLength = 500)
                    @NotBlank
                    @Size(max = 500)
                    String reason,
            @Schema(nullable = true, description = "Optional end of the pause (future)")
                    @Nullable Instant until) {}

    /** Optional body of {@code POST /admin/users/{id}/resume-listings}. */
    @Schema(name = "ResumeListingsRequest")
    public record ResumeListingsRequest(
            @Schema(nullable = true, maxLength = 500) @Size(max = 500) @Nullable String note) {}
}
