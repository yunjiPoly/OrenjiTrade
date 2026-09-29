package com.orenjitrade.api.featureflags.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.featureflags.domain.FeatureFlagView;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/v1/admin/feature-flags}: read (ADMIN, SUPER_ADMIN) and change (SUPER_ADMIN). */
@RestController
@RequestMapping(path = "/api/v1/admin/feature-flags", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-feature-flags", description = "Feature flags (admin console)")
@Validated
public class AdminFeatureFlagController {

    private final FeatureFlags featureFlags;

    public AdminFeatureFlagController(FeatureFlags featureFlags) {
        this.featureFlags = featureFlags;
    }

    @GetMapping
    @Operation(
            operationId = "listFeatureFlags",
            summary = "List feature flags (ADMIN, SUPER_ADMIN)",
            description = "Every flag with its rollout, description and last editor, by key.")
    public List<FeatureFlagView> list() {
        return featureFlags.all();
    }

    @PutMapping(path = "/{key}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateFeatureFlag",
            summary = "Change a feature flag (SUPER_ADMIN)",
            description =
                    "Flags are created by migrations; unknown keys are 404. Takes effect on every"
                            + " instance at once (cache evicted). Audited (`feature_flag.update`).")
    public FeatureFlagView update(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable String key,
            @Valid @RequestBody UpdateFeatureFlagRequest body) {
        return featureFlags.update(
                actor, key, body.enabled(), body.rolloutPercent(), body.description());
    }
}
