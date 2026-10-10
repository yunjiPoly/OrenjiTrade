package com.orenjitrade.api.profiles.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.profiles.domain.CollectorProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/collectors/{handle}}: public collector profile. */
@RestController
@Tag(name = "collectors", description = "Public collector profiles")
public class CollectorController {

    private final CollectorProfileService collectorProfileService;

    public CollectorController(CollectorProfileService collectorProfileService) {
        this.collectorProfileService = collectorProfileService;
    }

    @GetMapping(path = "/api/v1/collectors/{handle}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getCollector",
            summary = "Public profile of a collector",
            description =
                    "Handle lookup is case-insensitive. 404 when the account does not exist, is"
                        + " suspended, pending deletion or deleted, or when the profile is PRIVATE"
                        + " (for everyone but its owner). `location` (state/province + country) is"
                        + " null unless the collector is discoverable and set a location; its"
                        + " `city` is the collector's own optional city, present only while they"
                        + " show it on their profile. The only response with another collector's"
                        + " city; no coordinates or distances anywhere (ADR 0017).")
    @ApiResponse(responseCode = "200", description = "Public profile as seen by the caller")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown, hidden or private collector",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = MyProfileController.PROBLEM_REF)))
    public CollectorProfileResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String handle) {
        return CollectorProfileResponse.from(
                collectorProfileService.view(principal.userId(), handle));
    }
}
