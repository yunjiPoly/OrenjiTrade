package com.orenjitrade.api.admin.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.UUID;

/** The pending deletion request of an account, as shown to admins. */
@Schema(name = "DeletionRequestSummary", description = "Pending account deletion request")
public record DeletionRequestSummary(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "PENDING") String status,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant requestedAt,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant scheduledFor) {}
