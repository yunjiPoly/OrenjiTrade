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
        @Schema(requiredMode = RequiredMode.REQUIRED) ActorType type) {}
