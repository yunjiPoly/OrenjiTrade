package com.orenjitrade.api.users.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;

/** A recorded consent (admin detail and data export); the hashed IP is never exposed. */
@Schema(name = "ConsentSummary", description = "An accepted legal document version")
public record ConsentSummary(
        @Schema(requiredMode = RequiredMode.REQUIRED) LegalDocumentType documentType,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "2026-09-01") String version,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant acceptedAt) {}
