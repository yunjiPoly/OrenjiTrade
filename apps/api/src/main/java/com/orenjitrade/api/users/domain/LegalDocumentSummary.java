package com.orenjitrade.api.users.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** Public description of a current legal document ({@code GET /api/v1/public/legal/documents}). */
@Schema(name = "LegalDocument", description = "A published legal document")
public record LegalDocumentSummary(
        @Schema(requiredMode = RequiredMode.REQUIRED) LegalDocumentType documentType,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "2026-09-01") String version,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Terms of Service") String title,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Path on the web app",
                        example = "/legal/terms")
                String url,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean requiredAtRegistration) {}
