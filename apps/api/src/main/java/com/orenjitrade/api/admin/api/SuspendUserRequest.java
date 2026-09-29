package com.orenjitrade.api.admin.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/** Body of {@code POST /api/v1/admin/users/{id}/suspend}. */
@Schema(name = "SuspendUserRequest")
public record SuspendUserRequest(
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Repeated spam reports")
                @NotBlank
                @Size(max = 500)
                String reason,
        @Schema(
                        nullable = true,
                        format = "date-time",
                        description = "End of the suspension; null for indefinite")
                @Future
                @Nullable Instant until) {}
