package com.orenjitrade.api.delisting.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;

/**
 * Freshness of a binder or an item as shown to clients.
 *
 * @param state derived state (the freshness job keeps it current)
 * @param confirmedAt last owner confirmation
 * @param updatedAt last owner edit
 * @param label human label of the confirmation age, e.g. "Updated 3 hours ago"
 */
@Schema(name = "Freshness", description = "Freshness of a listing")
public record FreshnessInfo(
        @Schema(requiredMode = RequiredMode.REQUIRED) FreshnessState state,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant confirmedAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Updated 3 hours ago")
                String label) {

    public static FreshnessInfo of(
            FreshnessState state, Instant confirmedAt, Instant updatedAt, Instant now) {
        return new FreshnessInfo(
                state, confirmedAt, updatedAt, FreshnessLabels.label(confirmedAt, now));
    }
}
