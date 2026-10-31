package com.orenjitrade.api.audit.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** One audit-log row as returned by {@code GET /api/v1/admin/audit-logs}. */
@Schema(name = "AuditLogEntry", description = "Audit-log entry")
public record AuditLogEntry(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant occurredAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) AuditActor actor,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "user.suspend") String action,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "USER") String targetType,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String targetId,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description =
                                "Structured details; never contains coordinates, and an archived"
                                        + " channel named after a city reads"
                                        + " \"archived-channel\" (web stage WH2)")
                Map<String, Object> details,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String requestId,
        @Schema(
                        nullable = true,
                        description =
                                "A readable name of the target (web stage WH2, spec 15.8):"
                                    + " \"@handle\", \"Report #1047\", a card's or a room's name, a"
                                    + " setting key; null when it is gone or has no name",
                        example = "Report #1047")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String targetLabel) {}
