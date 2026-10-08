package com.orenjitrade.api.admin.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.admin.domain.DeletionRequestSummary;
import com.orenjitrade.api.audit.api.AuditLogEntry;
import com.orenjitrade.api.users.domain.ConsentSummary;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Response of {@code GET /api/v1/admin/users/{id}}: account, roles, consents, the public location
 * label (never coordinates), the pending deletion request, recent audit entries and the ban mark.
 */
@Schema(name = "AdminUserDetail", description = "Account detail for the admin console")
public record AdminUserDetail(
        @Schema(requiredMode = RequiredMode.REQUIRED) AdminUserSummary account,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String suspensionReason,
        @Schema(requiredMode = RequiredMode.REQUIRED, format = "date-time") Instant updatedAt,
        @Schema(nullable = true, format = "date-time") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant deletedAt,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<ConsentSummary> consents,
        @Schema(
                        nullable = true,
                        description = "State/province and country (never the city or a coordinate)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String locationLabel,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable DeletionRequestSummary deletionRequest,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<AuditLogEntry> recentAuditEntries,
        @Schema(
                        nullable = true,
                        format = "date-time",
                        description =
                                "When a report decision banned the account (a suspension without"
                                        + " end); cleared by unsuspend")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Instant bannedAt) {}
