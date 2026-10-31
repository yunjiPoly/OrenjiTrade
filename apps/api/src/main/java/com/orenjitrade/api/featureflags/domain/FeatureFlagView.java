package com.orenjitrade.api.featureflags.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
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
 * @param updatedByHandle the last editor's handle (admin console, spec 15.8; {@code null} for
 *     defaults or a gone account; filled by the admin controller, never cached)
 * @param updatedByName the last editor's display name ({@code null} when none)
 */
@Schema(name = "FeatureFlag", description = "Feature flag (admin view)")
public record FeatureFlagView(
        @Schema(example = "publicChat") String key,
        boolean enabled,
        @Schema(example = "100", minimum = "0", maximum = "100") int rolloutPercent,
        String description,
        @Nullable UUID updatedBy,
        Instant updatedAt,
        @Schema(nullable = true, description = "The last editor's handle (admin console)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String updatedByHandle,
        @Schema(nullable = true, description = "The last editor's display name (admin console)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String updatedByName) {

    /** A flag as stored, without its editor's name. */
    public FeatureFlagView(
            String key,
            boolean enabled,
            int rolloutPercent,
            String description,
            @Nullable UUID updatedBy,
            Instant updatedAt) {
        this(key, enabled, rolloutPercent, description, updatedBy, updatedAt, null, null);
    }

    /** The same flag with its last editor named (admin console). */
    public FeatureFlagView withEditor(@Nullable String handle, @Nullable String name) {
        return new FeatureFlagView(
                key, enabled, rolloutPercent, description, updatedBy, updatedAt, handle, name);
    }

    /** Whether the flag applies to everybody (enabled and rolled out to 100 %). */
    public boolean enabledForEveryone() {
        return enabled && rolloutPercent >= 100;
    }
}
