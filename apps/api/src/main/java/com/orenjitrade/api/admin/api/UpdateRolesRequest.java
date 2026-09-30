package com.orenjitrade.api.admin.api;

import com.orenjitrade.api.auth.domain.Role;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.NotNull;
import java.util.Set;

/** Body of {@code PUT /api/v1/admin/users/{id}/roles}. */
@Schema(name = "UpdateRolesRequest")
public record UpdateRolesRequest(
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        description = "Complete role set; USER is always kept",
                        example = "[\"USER\", \"MODERATOR\"]")
                @NotNull
                Set<Role> roles) {}
