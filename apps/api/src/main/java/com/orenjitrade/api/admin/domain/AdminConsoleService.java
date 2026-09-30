package com.orenjitrade.api.admin.domain;

import com.orenjitrade.api.admin.infra.AdminDashboardRepository;
import com.orenjitrade.api.admin.infra.AdminDashboardRepository.Outbox;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.jobs.domain.JobRunSummaries;
import com.orenjitrade.api.jobs.domain.JobRunSummaries.JobSummary;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.health.actuate.endpoint.CompositeHealthDescriptor;
import org.springframework.boot.health.actuate.endpoint.HealthDescriptor;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin console "Dashboard" and "System Health" (Phase 7 contract): counters across the platform
 * and the technical state (actuator health with component statuses only, the event outbox backlog,
 * notifications waiting for dispatch and the last run of every job). Phase 9: open disputes (OPEN,
 * UNDER_REVIEW, FROZEN) and payment webhooks that failed or had an invalid signature in 24 h.
 */
@Service
public class AdminConsoleService {

    private final AdminDashboardRepository repository;
    private final JobRunSummaries jobs;
    private final ObjectProvider<HealthEndpoint> health;
    private final TimeProvider timeProvider;

    public AdminConsoleService(
            AdminDashboardRepository repository,
            JobRunSummaries jobs,
            ObjectProvider<HealthEndpoint> health,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.jobs = jobs;
        this.health = health;
        this.timeProvider = timeProvider;
    }

    /** {@code GET /admin/dashboard}. */
    @Transactional(readOnly = true)
    public Dashboard dashboard() {
        Instant now = timeProvider.now();
        Map<String, Long> counters = repository.counters(now);
        return new Dashboard(
                now,
                counters.get("users_total"),
                counters.get("users_active"),
                counters.get("users_suspended"),
                counters.get("users_new_7d"),
                counters.get("active_collectors_7d"),
                counters.get("public_items"),
                counters.get("public_binders"),
                counters.get("open_reports"),
                counters.get("unassigned_reports"),
                counters.get("open_moderation_flags"),
                counters.get("stale_items"),
                counters.get("hidden_items"),
                counters.get("paused_owners"),
                counters.get("open_disputes"),
                counters.get("notifications_failed_24h"),
                counters.get("webhook_failures_24h"));
    }

    /** {@code GET /admin/system/health}. */
    @Transactional(readOnly = true)
    public SystemHealth systemHealth() {
        Instant now = timeProvider.now();
        String status = "UNKNOWN";
        Map<String, String> components = new LinkedHashMap<>();
        @Nullable HealthEndpoint endpoint = health.getIfAvailable();
        if (endpoint != null) {
            HealthDescriptor descriptor = endpoint.health();
            status = descriptor.getStatus().getCode();
            if (descriptor instanceof CompositeHealthDescriptor composite
                    && composite.getComponents() != null) {
                composite
                        .getComponents()
                        .forEach(
                                (name, component) ->
                                        components.put(name, component.getStatus().getCode()));
            }
        }
        return new SystemHealth(
                now,
                status,
                components,
                repository.outbox(),
                repository.notificationsPendingDispatch(),
                jobs.latest(now.minus(Duration.ofHours(24))));
    }

    /** Dashboard counters. */
    public record Dashboard(
            Instant generatedAt,
            long usersTotal,
            long usersActive,
            long usersSuspended,
            long usersNew7d,
            long activeCollectors7d,
            long publicItems,
            long publicBinders,
            long openReports,
            long unassignedReports,
            long openModerationFlags,
            long staleItems,
            long hiddenItems,
            long ownersWithPausedListings,
            long openDisputes,
            long notificationsFailed24h,
            long webhookFailures24h) {}

    /** The technical state. */
    public record SystemHealth(
            Instant checkedAt,
            String status,
            Map<String, String> components,
            Outbox outbox,
            long notificationsPendingDispatch,
            List<JobSummary> jobs) {}
}
