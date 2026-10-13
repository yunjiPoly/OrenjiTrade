package com.orenjitrade.api.location.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Body of {@code PUT /api/v1/me/location} (ADR 0017). Self-declared text and codes only; the codes
 * are trimmed and upper-cased by the service, then checked against the region catalog (400 when
 * unknown).
 */
@Schema(name = "UpdateLocationRequest")
public record UpdateLocationRequest(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "CA",
                        description =
                                "ISO 3166-1 alpha-2 code of an active country of GET /regions")
                @NotBlank
                @Size(max = 16)
                String countryCode,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "CA-QC",
                        description = "A subdivision code of that country (GET /regions)")
                @NotBlank
                @Size(max = 16)
                String subdivisionCode,
        @Schema(
                        nullable = true,
                        example = "Montréal",
                        description =
                                "Optional city, at most 80 characters after trimming; never"
                                        + " geocoded. Null or blank clears it")
                @Size(max = 200)
                @Nullable String city,
        @Schema(nullable = true, description = "Show the city on the public profile (default true)")
                @Nullable Boolean showCity) {}
