package com.orenjitrade.api.billing.api;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.orenjitrade.api.billing.domain.LimitWindow;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/admin/usage-limits/{id}}.
 *
 * @param unlimited {@code true} removes the limit ({@code maxValue} must then be absent)
 * @param maxValue the new limit when not unlimited (0 blocks the action entirely)
 * @param window new counting window (counters only; caps always use TOTAL); unchanged when absent
 * @param description new description; unchanged when absent
 */
@Schema(description = "Usage limit change (takes effect at once on every instance)")
public record UpdateUsageLimitRequest(
        @NotNull Boolean unlimited,
        @Min(0) @Max(1_000_000) @Nullable Integer maxValue,
        @Nullable LimitWindow window,
        @Size(max = 500) @Nullable String description) {

    @AssertTrue(
            message = "maxValue is required unless unlimited, and must be absent when unlimited")
    @Schema(hidden = true)
    @JsonIgnore
    public boolean isMaxValueConsistent() {
        if (unlimited == null) {
            return true;
        }
        return unlimited ? maxValue == null : maxValue != null;
    }
}
