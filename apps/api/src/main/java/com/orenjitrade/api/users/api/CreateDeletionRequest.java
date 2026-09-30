package com.orenjitrade.api.users.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** Body of {@code POST /api/v1/me/deletion-requests}. */
@Schema(name = "CreateDeletionRequest")
public record CreateDeletionRequest(
        @Schema(
                        nullable = true,
                        description = "Optional free text; never copied into the audit log",
                        example = "Taking a break from collecting")
                @Size(max = 1000)
                @Nullable String reason,
        @Schema(
                        nullable = true,
                        description =
                                "The owner wants their export first; GET /me/export stays"
                                        + " available while the deletion is pending",
                        defaultValue = "false")
                @Nullable Boolean exportFirst) {}
