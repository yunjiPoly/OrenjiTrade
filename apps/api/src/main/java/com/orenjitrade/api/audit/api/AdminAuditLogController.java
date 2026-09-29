package com.orenjitrade.api.audit.api;

import com.orenjitrade.api.audit.domain.AuditLogFilter;
import com.orenjitrade.api.audit.domain.AuditQueryService;
import com.orenjitrade.api.common.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/admin/audit-logs}: paginated, filterable audit log (ADMIN, SUPER_ADMIN). */
@RestController
@RequestMapping(path = "/api/v1/admin/audit-logs", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-audit", description = "Audit log (admin console)")
@Validated
public class AdminAuditLogController {

    private final AuditQueryService auditQueryService;

    public AdminAuditLogController(AuditQueryService auditQueryService) {
        this.auditQueryService = auditQueryService;
    }

    @GetMapping
    @Operation(
            operationId = "listAuditLogs",
            summary = "List audit-log entries (ADMIN, SUPER_ADMIN)",
            description =
                    "Newest first. Every filter is optional; `from` is inclusive, `to` exclusive.")
    public PageResponse<AuditLogEntry> list(
            @Parameter(description = "Acting account id") @RequestParam(required = false)
                    @Nullable UUID actorId,
            @Parameter(description = "Target type, e.g. USER") @RequestParam(required = false)
                    @Nullable String targetType,
            @Parameter(description = "Target id") @RequestParam(required = false)
                    @Nullable String targetId,
            @Parameter(description = "Exact action name, e.g. user.suspend")
                    @RequestParam(required = false)
                    @Nullable String action,
            @Parameter(description = "Lower bound of occurredAt (inclusive)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                    @Nullable Instant from,
            @Parameter(description = "Upper bound of occurredAt (exclusive)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
                    @Nullable Instant to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        AuditLogFilter filter = new AuditLogFilter(actorId, targetType, targetId, action, from, to);
        return PageResponse.from(auditQueryService.search(filter, page, size));
    }
}
