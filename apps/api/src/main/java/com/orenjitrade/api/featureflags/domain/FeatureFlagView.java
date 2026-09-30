package com.orenjitrade.api.featureflags.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A feature flag as stored in {@code feature_flag}.
 *
 * @param key lowerCamelCase flag name
 * @param enabled master switch
 * @param rolloutPercent share of accounts (0-100) that see the flag while it is enabled
 * @param description what the flag controls
 * @param updatedBy admin account of the last change, {@code null} for defaults
 * @param updatedAt last change
 */
@Schema(name = "FeatureFlag", description = "Feature flag (admin view)")
public record FeatureFlagView(
        @Schema(example = "advertising") String key,
        boolean enabled,
        @Schema(example = "100", minimum = "0", maximum = "100") int rolloutPercent,
        String description,
        @Nullable UUID updatedBy,
        Instant updatedAt) {

    /** Whether the flag applies to everybody (enabled and rolled out to 100 %). */
    public boolean enabledForEveryone() {
        return enabled && rolloutPercent >= 100;
    }
}
