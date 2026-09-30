package com.orenjitrade.api.featureflags.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/admin/feature-flags/{key}}.
 *
 * @param enabled new master switch (required)
 * @param rolloutPercent share of accounts (0-100); unchanged when omitted
 * @param description new description; unchanged when omitted
 */
@Schema(description = "Feature flag change")
public record UpdateFeatureFlagRequest(
        @NotNull Boolean enabled,
        @Schema(minimum = "0", maximum = "100", example = "100") @Min(0) @Max(100)
                @Nullable Integer rolloutPercent,
        @Size(max = 500) @Nullable String description) {}
