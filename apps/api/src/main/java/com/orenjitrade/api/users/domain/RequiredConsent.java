package com.orenjitrade.api.users.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/**
 * A legal document version the user still has to accept. Also serialised as the {@code
 * requiredConsents} extension of {@code 428 TERMS_ACCEPTANCE_REQUIRED} problems and in {@code
 * MeResponse}.
 */
@Schema(name = "RequiredConsent", description = "A legal document version that must be accepted")
public record RequiredConsent(
        @Schema(requiredMode = RequiredMode.REQUIRED) LegalDocumentType documentType,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "2026-09-01") String version) {}
