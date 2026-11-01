package com.orenjitrade.api.audit.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.audit.domain.ActorType;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Who performed an audited action. */
@Schema(name = "AuditActor", description = "Actor of an audit-log entry")
public record AuditActor(
        @Schema(description = "Acting account id; absent for SYSTEM actions", nullable = true)
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable UUID id,
        @Schema(description = "Handle of the acting account when it still exists", nullable = true)
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String handle,
        @Schema(requiredMode = RequiredMode.REQUIRED) ActorType type,
        @Schema(
                        description =
                                "Display name of the acting account when it still exists (web"
                                        + " stage WH2)",
                        nullable = true)
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String displayName,
        @Schema(
                        description =
                                "The acting account's highest staff role today (SUPER_ADMIN,"
                                        + " ADMIN, MODERATOR), null for a collector or SYSTEM",
                        nullable = true)
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String role) {}
