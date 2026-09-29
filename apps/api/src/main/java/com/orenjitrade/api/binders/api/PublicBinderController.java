package com.orenjitrade.api.binders.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.api.PublicBinderResponses.PublicBinderResponse;
import com.orenjitrade.api.binders.api.PublicBinderResponses.PublicBinderSummaryResponse;
import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.common.TimeProvider;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public binder views (permitAll GET, privacy enforced): {@code GET /collectors/{handle}/binders}
 * and {@code GET /public/binders/{id}}. A bearer token is optional; with one, distance buckets and
 * the daily binder-view limit apply.
 */
@RestController
@Tag(name = "public-binders", description = "Public binders of collectors (no auth required)")
public class PublicBinderController {

    private final PublicBinderService publicBinderService;
    private final TimeProvider timeProvider;

    public PublicBinderController(
            PublicBinderService publicBinderService, TimeProvider timeProvider) {
        this.publicBinderService = publicBinderService;
        this.timeProvider = timeProvider;
    }

    @GetMapping(
            path = "/api/v1/collectors/{handle}/binders",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listCollectorBinders",
            summary = "Public binders of a collector (auth optional)",
            description =
                    "Only binders that are public right now and hold at least one public item, in"
                        + " the owner's order. 404 when the collector is suspended, pending"
                        + " deletion, deleted, has a PRIVATE profile or a block exists. Empty when"
                        + " the collector is neither discoverable nor has a PUBLIC profile.")
    @ApiResponse(responseCode = "200", description = "Public binders")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown or hidden collector",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = BinderController.PROBLEM_REF)))
    public List<PublicBinderSummaryResponse> collectorBinders(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable String handle) {
        Instant now = timeProvider.now();
        return publicBinderService.bindersOf(viewer(principal), handle).stream()
                .map(summary -> PublicBinderSummaryResponse.from(summary, now))
                .toList();
    }

    @GetMapping(path = "/api/v1/public/binders/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "getPublicBinder",
            summary = "A public binder (auth optional)",
            description =
                    "404 unless the binder is public right now (visibility, expiry, freshness, the"
                        + " owner's account state and privacy settings). The owner block carries a"
                        + " region label and, for signed-in callers with a trading area, a distance"
                        + " bucket; never coordinates. Signed-in callers other than the owner"
                        + " consume `binder.views.per_day` once per binder and UTC day (429"
                        + " LIMIT_REACHED beyond the plan limit).")
    @ApiResponse(responseCode = "200", description = "The binder")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown or non-public binder",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = BinderController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (`binder.views.per_day`) or RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = BinderController.PROBLEM_REF)))
    public PublicBinderResponse publicBinder(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal, @PathVariable UUID id) {
        return PublicBinderResponse.from(
                publicBinderService.binder(viewer(principal), id), timeProvider.now());
    }

    static @Nullable UUID viewer(@Nullable AuthenticatedUser principal) {
        return principal == null ? null : principal.userId();
    }
}
