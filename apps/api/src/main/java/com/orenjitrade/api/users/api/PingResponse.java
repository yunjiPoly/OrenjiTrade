package com.orenjitrade.api.users.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;

/** Response of {@code GET /api/v1/me/ping}. */
@Schema(name = "PingResponse", description = "Authenticated connectivity check")
public record PingResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean ok,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant serverTime) {}
