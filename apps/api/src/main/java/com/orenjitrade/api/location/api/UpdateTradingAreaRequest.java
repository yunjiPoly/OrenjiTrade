package com.orenjitrade.api.location.api;

import com.orenjitrade.api.location.domain.TradingAreaSource;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.Nullable;

/** Body of {@code PUT /api/v1/me/location/trading-area}. */
@Schema(name = "UpdateTradingAreaRequest")
public record UpdateTradingAreaRequest(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "45.52",
                        description = "Centre latitude (stored rounded to 3 decimals)")
                @NotNull
                @DecimalMin("-85.0")
                @DecimalMax("85.0")
                Double lat,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "-73.58",
                        description = "Centre longitude (stored rounded to 3 decimals)")
                @NotNull
                @DecimalMin("-180.0")
                @DecimalMax("180.0")
                Double lng,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "5", minimum = "1", maximum = "50")
                @NotNull
                @Min(1)
                @Max(50)
                Integer radiusKm,
        @Schema(
                        nullable = true,
                        description =
                                "MANUAL (default) or DEVICE; DEVICE only records where the centre"
                                        + " came from, the server still snaps it")
                @Nullable TradingAreaSource source) {}
