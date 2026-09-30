package com.orenjitrade.api.admin.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** One row of {@code GET /api/v1/admin/users}. Never contains location data. */
@Schema(name = "AdminUserSummary", description = "Account as listed in the admin console")
public record AdminUserSummary(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String displayName,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String email,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean emailVerified,
        @Schema(requiredMode = RequiredMode.REQUIRED) AccountStatus status,
        @Schema(requiredMode = RequiredMode.REQUIRED) Set<Role> roles,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "FREE") String plan,
        @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String avatarUrl,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant createdAt,
        @Schema(nullable = true, format = "date-time") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant lastActiveAt,
        @Schema(nullable = true, format = "date-time") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant suspendedUntil) {}
