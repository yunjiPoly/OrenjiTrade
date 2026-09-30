package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.auth.domain.Role;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Admin console counters and technical views (Phase 7): the dashboard reflects new reports, stale
 * listings and paused owners; notification statistics count by type and channel; the analytics
 * summary reads the local aggregate; the system health shows the actuator status, the outbox
 * backlog and the last job runs. Counts only: no personal data or coordinates.
 */
class DashboardIT extends AbstractPhase7IT {

    @Test
    void dashboardCountsFollowTheData() {
        String admin = staff("db-admin", Role.ADMIN);
        JsonNode before = callJson(HttpMethod.GET, "/api/v1/admin/dashboard", admin, null, 200);
        assertThat(before.path("users").path("total").asLong()).isPositive();
        assertThat(before.path("openDisputes").asLong()).isZero();
        assertThat(before.path("webhookFailures24h").asLong()).isZero();

        Collector reporter = member("db-reporter");
        Collector reported = member("db-reported");
        report(reporter, reported, "OTHER", null, 201);
        String itemId = publicItem(reported, printing(AZURE), Map.of());
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE' WHERE id = ?::uuid", itemId);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + reported.id() + "/pause-listings",
                admin,
                Map.of("reason", "Dashboard check"),
                200);

        JsonNode after = callJson(HttpMethod.GET, "/api/v1/admin/dashboard", admin, null, 200);
        assertThat(after.path("users").path("total").asLong())
                .isGreaterThanOrEqualTo(before.path("users").path("total").asLong() + 2);
        assertThat(after.path("activeCollectors7d").asLong()).isPositive();
        assertThat(after.path("openReports").asLong())
                .isEqualTo(before.path("openReports").asLong() + 1);
        assertThat(after.path("unassignedReports").asLong())
                .isEqualTo(before.path("unassignedReports").asLong() + 1);
        assertThat(after.path("staleItems").asLong())
                .isEqualTo(before.path("staleItems").asLong() + 1);
        assertThat(after.path("ownersWithPausedListings").asLong())
                .isEqualTo(before.path("ownersWithPausedListings").asLong() + 1);
        assertThat(after.toString()).doesNotContain(reported.handle());
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + reported.id() + "/resume-listings",
                admin,
                null,
                200);
    }

    @Test
    void notificationStatsAnalyticsSummaryAndSystemHealth() {
        String admin = staff("db-stats-admin", Role.ADMIN);
        Collector reporter = member("db-an-reporter");
        Collector reported = member("db-an-reported");
        String reportId = report(reporter, reported, "SPAM", null, 201).path("id").asString();
        awaitEventsProcessed(reportId);

        // Analytics: the local aggregate counts collector_reported events.
        await().atMost(WAIT)
                .until(
                        () ->
                                callJson(
                                                        HttpMethod.GET,
                                                        "/api/v1/admin/analytics/summary?days=1",
                                                        admin,
                                                        null,
                                                        200)
                                                .path("totals")
                                                .path("collector_reported")
                                                .asLong()
                                        > 0);
        JsonNode summary =
                callJson(
                        HttpMethod.GET, "/api/v1/admin/analytics/summary?days=7", admin, null, 200);
        assertThat(summary.path("source").asString()).isEqualTo("local-aggregate");
        assertThat(summary.path("transport").asString()).isEqualTo("log");
        assertThat(summary.path("daily")).isNotEmpty();
        assertThat(summary.path("total").asLong()).isPositive();
        callJson(HttpMethod.GET, "/api/v1/admin/analytics/summary?days=0", admin, null, 400);

        // Notifications: a decision notifies the reporter; the statistics count it.
        String moderator = staff("db-mod", Role.MODERATOR);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + reportId + "/resolve",
                moderator,
                Map.of(
                        "status",
                        "DISMISSED",
                        "action",
                        "NONE",
                        "note",
                        "Nothing found",
                        "notifyReporter",
                        true),
                200);
        JsonNode stats =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/notifications/stats?days=1",
                        admin,
                        null,
                        200);
        assertThat(stats.path("byType").path("REPORT_DECISION").asLong()).isPositive();
        assertThat(stats.path("total").asLong()).isPositive();
        assertThat(stats.path("channels").has("push")).isTrue();
        assertThat(stats.path("channels").has("email")).isTrue();
        assertThat(stats.path("pushTokens").has("active")).isTrue();
        assertThat(stats.toString()).doesNotContain("Nothing found");

        // System health: actuator status, outbox backlog and the last job runs.
        runDelistJob();
        JsonNode health = callJson(HttpMethod.GET, "/api/v1/admin/system/health", admin, null, 200);
        assertThat(health.path("status").asString()).isEqualTo("UP");
        assertThat(health.path("components").path("db").asString()).isEqualTo("UP");
        assertThat(health.path("outbox").has("incomplete")).isTrue();
        assertThat(health.path("notificationsPendingDispatch").isNumber()).isTrue();
        boolean sawDelist = false;
        for (JsonNode job : health.path("jobs")) {
            if ("delist".equals(job.path("name").asString())) {
                sawDelist = true;
                assertThat(job.path("lastStatus").asString()).isEqualTo("SUCCEEDED");
                assertThat(job.path("lastSucceededAt").asString()).isNotBlank();
            }
        }
        assertThat(sawDelist).isTrue();
        callJson(HttpMethod.GET, "/api/v1/admin/system/health", moderator, null, 403);
    }
}
