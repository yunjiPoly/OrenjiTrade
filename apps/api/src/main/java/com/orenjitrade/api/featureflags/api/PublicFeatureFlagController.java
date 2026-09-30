package com.orenjitrade.api.featureflags.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/public/feature-flags}: the flags as the caller sees them (no auth needed). */
@RestController
@Tag(name = "feature-flags", description = "Feature flags (ADR 0014)")
public class PublicFeatureFlagController {

    private final FeatureFlags featureFlags;

    public PublicFeatureFlagController(FeatureFlags featureFlags) {
        this.featureFlags = featureFlags;
    }

    @GetMapping(path = "/api/v1/public/feature-flags", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "getFeatureFlags",
            summary = "Client-visible feature flags (public)",
            description =
                    "Map of flag key to effective value. Anonymous callers see flags rolled out to"
                        + " everybody; with a bearer token, partial rollouts are evaluated for the"
                        + " caller. Flags change live through the admin console.")
    @ApiResponse(
            responseCode = "200",
            description = "Flags by key",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema =
                                    @Schema(
                                            type = "object",
                                            additionalPropertiesSchema = Boolean.class,
                                            example =
                                                    "{\"mlScanning\":false,\"publicChat\":true}")))
    public Map<String, Boolean> flags(
            @Parameter(hidden = true) @AuthenticationPrincipal @Nullable AuthenticatedUser user) {
        return featureFlags.evaluateAll(user == null ? null : user.userId());
    }
}
