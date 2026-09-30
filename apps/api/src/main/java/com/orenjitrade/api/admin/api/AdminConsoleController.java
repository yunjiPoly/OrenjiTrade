package com.orenjitrade.api.admin.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.admin.domain.AdminConsoleService;
import com.orenjitrade.api.admin.domain.AdminConsoleService.Dashboard;
import com.orenjitrade.api.admin.domain.AdminConsoleService.SystemHealth;
import com.orenjitrade.api.jobs.domain.JobRunStatus;
import com.orenjitrade.api.jobs.domain.JobRunSummaries.JobSummary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/admin/dashboard} and {@code GET /api/v1/admin/system/health} (ADMIN,
 * SUPER_ADMIN): counters and technical state of the platform. Counts and statuses only.
 */
@RestController
@RequestMapping(path = "/api/v1/admin", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-console", description = "Dashboard and system health (admin console)")
public class AdminConsoleController {

    private final AdminConsoleService console;

    public AdminConsoleController(AdminConsoleService console) {
        this.console = console;
    }

    @GetMapping("/dashboard")
    @Operation(
            operationId = "getAdminDashboard",
            summary = "Dashboard counters (ADMIN)",
            description =
                    "Accounts, active collectors of the last 7 days, public items and binders, open"
                        + " and unassigned reports, open moderation flags, stale and hidden"
                        + " listings, owners with paused listings, open disputes and webhook"
                        + " failures (0 until Phase 9) and notifications whose push or email failed"
                        + " in the last 24 hours.")
    public AdminDashboardResponse dashboard() {
        return AdminDashboardResponse.from(console.dashboard());
    }

    @GetMapping("/system/health")
    @Operation(
            operationId = "getSystemHealth",
            summary = "System health (ADMIN)",
            description =
                    "Actuator health (overall and per component, statuses only), the event outbox"
                            + " backlog (incomplete publications and the oldest one), notifications"
                            + " waiting for dispatch and the last run of every job (job_run).")
    public SystemHealthResponse systemHealth() {
        return SystemHealthResponse.from(console.systemHealth());
    }

    /** Dashboard counters. */
    @Schema(name = "AdminDashboard")
    public record AdminDashboardResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant generatedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) UserCounts users,
            @Schema(requiredMode = RequiredMode.REQUIRED) long activeCollectors7d,
            @Schema(requiredMode = RequiredMode.REQUIRED) long publicItems,
            @Schema(requiredMode = RequiredMode.REQUIRED) long publicBinders,
            @Schema(requiredMode = RequiredMode.REQUIRED) long openReports,
            @Schema(requiredMode = RequiredMode.REQUIRED) long unassignedReports,
            @Schema(requiredMode = RequiredMode.REQUIRED) long openModerationFlags,
            @Schema(requiredMode = RequiredMode.REQUIRED) long staleItems,
            @Schema(requiredMode = RequiredMode.REQUIRED) long hiddenItems,
            @Schema(requiredMode = RequiredMode.REQUIRED) long ownersWithPausedListings,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "0 until Phase 9")
                    long openDisputes,
            @Schema(requiredMode = RequiredMode.REQUIRED) long notificationsFailed24h,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "0 until Phase 9")
                    long webhookFailures24h) {

        static AdminDashboardResponse from(Dashboard dashboard) {
            return new AdminDashboardResponse(
                    dashboard.generatedAt(),
                    new UserCounts(
                            dashboard.usersTotal(),
                            dashboard.usersActive(),
                            dashboard.usersSuspended(),
                            dashboard.usersNew7d()),
                    dashboard.activeCollectors7d(),
                    dashboard.publicItems(),
                    dashboard.publicBinders(),
                    dashboard.openReports(),
                    dashboard.unassignedReports(),
                    dashboard.openModerationFlags(),
                    dashboard.staleItems(),
                    dashboard.hiddenItems(),
                    dashboard.ownersWithPausedListings(),
                    dashboard.openDisputes(),
                    dashboard.notificationsFailed24h(),
                    dashboard.webhookFailures24h());
        }
    }

    /** Account counters. */
    @Schema(name = "AdminUserCounts")
    public record UserCounts(
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Not deleted") long total,
            @Schema(requiredMode = RequiredMode.REQUIRED) long active,
            @Schema(requiredMode = RequiredMode.REQUIRED) long suspended,
            @Schema(requiredMode = RequiredMode.REQUIRED) long new7d) {}

    /** The event outbox backlog. */
    @Schema(name = "OutboxBacklog")
    public record OutboxResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) long incomplete,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant oldestPublishedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) long failed) {}

    /** The last run of a job. */
    @Schema(name = "JobStatus")
    public record JobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "freshness") String name,
            @Schema(requiredMode = RequiredMode.REQUIRED) JobRunStatus lastStatus,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant lastStartedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant lastFinishedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant lastSucceededAt,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Failed runs in 24 h")
                    int failuresLast24h) {

        static JobResponse from(JobSummary job) {
            return new JobResponse(
                    job.name(),
                    job.lastStatus(),
                    job.lastStartedAt(),
                    job.lastFinishedAt(),
                    job.lastSucceededAt(),
                    job.recentFailures());
        }
    }

    /** {@code GET /admin/system/health}. */
    @Schema(name = "SystemHealth")
    public record SystemHealthResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant checkedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "UP") String status,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Component to status")
                    Map<String, String> components,
            @Schema(requiredMode = RequiredMode.REQUIRED) OutboxResponse outbox,
            @Schema(requiredMode = RequiredMode.REQUIRED) long notificationsPendingDispatch,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<JobResponse> jobs) {

        static SystemHealthResponse from(SystemHealth health) {
            return new SystemHealthResponse(
                    health.checkedAt(),
                    health.status(),
                    health.components(),
                    new OutboxResponse(
                            health.outbox().incomplete(),
                            health.outbox().oldestPublishedAt(),
                            health.outbox().failed()),
                    health.notificationsPendingDispatch(),
                    health.jobs().stream().map(JobResponse::from).toList());
        }
    }
}
