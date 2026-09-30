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
                        description = "Structured details; never contains coordinates")
                Map<String, Object> details,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String requestId) {}
