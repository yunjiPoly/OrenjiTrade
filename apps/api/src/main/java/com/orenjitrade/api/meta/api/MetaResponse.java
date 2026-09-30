package com.orenjitrade.api.meta.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;

/** Response of {@code GET /api/v1/meta}. */
@Schema(name = "MetaResponse", description = "Build and environment metadata")
public record MetaResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "OrenjiTrade API") String name,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "0.1.0") String version,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "local") String environment,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant serverTime) {}
