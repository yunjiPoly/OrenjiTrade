package com.orenjitrade.api.featureflags.api;

import com.orenjitrade.api.auth.domain.AccountNames;
import com.orenjitrade.api.auth.domain.AccountNames.AccountName;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.featureflags.domain.FeatureFlagView;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
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
    private final AccountNames accountNames;

    public AdminFeatureFlagController(FeatureFlags featureFlags, AccountNames accountNames) {
        this.featureFlags = featureFlags;
        this.accountNames = accountNames;
    }

    @GetMapping
    @Operation(
            operationId = "listFeatureFlags",
            summary = "List feature flags (ADMIN, SUPER_ADMIN)",
            description = "Every flag with its rollout, description and last editor, by key.")
    public List<FeatureFlagView> list() {
        List<FeatureFlagView> flags = featureFlags.all();
        Map<UUID, AccountName> editors =
                accountNames.namesOf(
                        flags.stream()
                                .map(FeatureFlagView::updatedBy)
                                .filter(Objects::nonNull)
                                .collect(Collectors.toSet()));
        return flags.stream()
                .map(
                        flag ->
                                named(
                                        flag,
                                        flag.updatedBy() == null
                                                ? null
                                                : editors.get(flag.updatedBy())))
                .toList();
    }

    private static FeatureFlagView named(FeatureFlagView flag, @Nullable AccountName editor) {
        return editor == null ? flag : flag.withEditor(editor.handle(), editor.displayName());
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
        FeatureFlagView flag =
                featureFlags.update(
                        actor, key, body.enabled(), body.rolloutPercent(), body.description());
        return named(flag, accountNames.nameOf(flag.updatedBy()).orElse(null));
    }
}
