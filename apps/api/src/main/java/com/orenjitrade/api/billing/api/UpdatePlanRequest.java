package com.orenjitrade.api.billing.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/admin/plans/{code}}. Features listed are upserted; features not listed
 * are kept.
 */
@Schema(description = "Plan change")
public record UpdatePlanRequest(
        @NotBlank @Size(max = 80) String name,
        @Size(max = 1000) @Nullable String description,
        @NotNull @DecimalMin("0.00") @DecimalMax("9999.99") @Digits(integer = 4, fraction = 2)
                BigDecimal monthlyPrice,
        @NotNull @Pattern(regexp = "^[A-Z]{3}$", message = "must be an ISO 4217 code")
                String currency,
        @NotNull Boolean active,
        @NotNull @Min(0) @Max(10_000) Integer sortOrder,
        @Size(max = 50) @Nullable List<@Valid FeatureChange> features) {

    /**
     * A feature switch to upsert.
     *
     * @param key feature key, e.g. {@code filters.advanced}
     * @param enabled whether the plan includes it
     * @param value optional parameter
     */
    @Schema(name = "PlanFeatureChange")
    public record FeatureChange(
            @NotBlank
                    @Pattern(
                            regexp = "^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$",
                            message = "must be a dotted lower-case key")
                    @Size(max = 64)
                    String key,
            @NotNull Boolean enabled,
            @Size(max = 200) @Nullable String value) {}
}
