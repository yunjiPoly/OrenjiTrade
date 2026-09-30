package com.orenjitrade.api.admin.infra;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Read-only counters over other modules' tables for the admin dashboard and system health (the
 * admin module is the top of the dependency graph and only ever reads here; counts only, never
 * personal data or coordinates).
 */
@Repository
public class AdminDashboardRepository {

    private final JdbcClient jdbc;

    public AdminDashboardRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The dashboard counters at {@code now} (see the keys of the returned map). */
    public Map<String, Long> counters(Instant now) {
        Map<String, Long> counters = new LinkedHashMap<>();
        jdbc.sql(
                        """
                        SELECT
                          (SELECT count(*) FROM user_account WHERE status <> 'DELETED') AS users_total,
                          (SELECT count(*) FROM user_account WHERE status = 'ACTIVE') AS users_active,
                          (SELECT count(*) FROM user_account WHERE status = 'SUSPENDED'
                              AND (suspended_until IS NULL OR suspended_until > :now)) AS users_suspended,
                          (SELECT count(*) FROM user_account WHERE status <> 'DELETED'
                              AND created_at >= :week) AS users_new_7d,
                          (SELECT count(*) FROM user_account WHERE status = 'ACTIVE'
                              AND last_active_at >= :week) AS active_collectors_7d,
                          (SELECT count(*) FROM inventory_item WHERE publicly_listed
                              AND deleted_at IS NULL) AS public_items,
                          (SELECT count(*) FROM binder WHERE publicly_listed) AS public_binders,
                          (SELECT count(*) FROM collector_report
                              WHERE status IN ('OPEN', 'UNDER_REVIEW')) AS open_reports,
                          (SELECT count(*) FROM collector_report
                              WHERE status = 'OPEN' AND assigned_to IS NULL) AS unassigned_reports,
                          (SELECT count(*) FROM moderation_flag WHERE resolved_at IS NULL)
                              AS open_moderation_flags,
                          (SELECT count(*) FROM inventory_item WHERE deleted_at IS NULL
                              AND visibility <> 'PRIVATE' AND freshness_state = 'STALE') AS stale_items,
                          (SELECT count(*) FROM inventory_item WHERE deleted_at IS NULL
                              AND visibility <> 'PRIVATE' AND freshness_state = 'HIDDEN') AS hidden_items,
                          (SELECT count(*) FROM user_responsiveness WHERE paused_at IS NOT NULL
                              AND (paused_until IS NULL OR paused_until > :now)) AS paused_owners,
                          (SELECT count(*) FROM notification WHERE created_at >= :day
                              AND (channel_state ->> 'push' = 'FAILED'
                                   OR channel_state ->> 'email' = 'FAILED')) AS notifications_failed_24h,
                          (SELECT count(*) FROM dispute
                              WHERE status IN ('OPEN', 'UNDER_REVIEW', 'FROZEN')) AS open_disputes,
                          (SELECT count(*) FROM payment_webhook_event WHERE received_at >= :day
                              AND (status = 'FAILED' OR NOT signature_valid)) AS webhook_failures_24h
                        """)
                .param("now", Timestamp.from(now))
                .param("week", Timestamp.from(now.minus(Duration.ofDays(7))))
                .param("day", Timestamp.from(now.minus(Duration.ofHours(24))))
                .query(
                        rs -> {
                            for (String key :
                                    new String[] {
                                        "users_total",
                                        "users_active",
                                        "users_suspended",
                                        "users_new_7d",
                                        "active_collectors_7d",
                                        "public_items",
                                        "public_binders",
                                        "open_reports",
                                        "unassigned_reports",
                                        "open_moderation_flags",
                                        "stale_items",
                                        "hidden_items",
                                        "paused_owners",
                                        "notifications_failed_24h",
                                        "open_disputes",
                                        "webhook_failures_24h"
                                    }) {
                                counters.put(key, rs.getLong(key));
                            }
                        });
        return counters;
    }

    /** Event publications not completed yet (the transactional outbox backlog). */
    public Outbox outbox() {
        return jdbc.sql(
                        "SELECT count(*) AS incomplete, min(publication_date) AS oldest,"
                                + " count(*) FILTER (WHERE status = 'FAILED') AS failed FROM"
                                + " event_publication WHERE completion_date IS NULL")
                .query(
                        (rs, rowNum) -> {
                            Timestamp oldest = rs.getTimestamp("oldest");
                            return new Outbox(
                                    rs.getLong("incomplete"),
                                    oldest == null ? null : oldest.toInstant(),
                                    rs.getLong("failed"));
                        })
                .single();
    }

    /** Notifications with a channel still waiting for the dispatcher. */
    public long notificationsPendingDispatch() {
        return jdbc.sql(
                        "SELECT count(*) FROM notification WHERE channel_state ->> 'realtime' ="
                                + " 'PENDING' OR channel_state ->> 'push' = 'PENDING' OR"
                                + " channel_state ->> 'email' = 'PENDING'")
                .query(Long.class)
                .single();
    }

    /**
     * The outbox backlog.
     *
     * @param incomplete publications not completed
     * @param oldestPublishedAt publication time of the oldest one
     * @param failed publications marked FAILED
     */
    public record Outbox(long incomplete, @Nullable Instant oldestPublishedAt, long failed) {}
}
