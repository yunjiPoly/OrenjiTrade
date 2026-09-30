package com.orenjitrade.api.notifications.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Aggregates of {@code notification} and {@code push_token} for the admin console (counts only:
 * never titles, bodies, data, tokens or recipients).
 */
@Repository
public class NotificationStatsRepository {

    private final JdbcClient jdbc;

    public NotificationStatsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Notifications created since {@code from}, by type (types with none are absent). */
    public Map<String, Long> countByType(Instant from) {
        Map<String, Long> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT type, count(*) AS total FROM notification WHERE created_at >= :from"
                                + " GROUP BY type ORDER BY type")
                .param("from", Timestamp.from(from))
                .query(
                        rs -> {
                            result.put(rs.getString("type"), rs.getLong("total"));
                        });
        return result;
    }

    /** Unread in-app notifications created since {@code from}. */
    public long unread(Instant from) {
        return jdbc.sql(
                        "SELECT count(*) FROM notification WHERE created_at >= :from AND in_app AND"
                                + " read_at IS NULL")
                .param("from", Timestamp.from(from))
                .query(Long.class)
                .single();
    }

    /**
     * Delivery states of one channel ({@code realtime}, {@code push} or {@code email}) of the
     * notifications created since {@code from}: state name to count.
     */
    public Map<String, Long> channelStates(String channel, Instant from) {
        if (!channel.equals("realtime") && !channel.equals("push") && !channel.equals("email")) {
            throw new IllegalArgumentException("Unknown channel " + channel);
        }
        Map<String, Long> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT COALESCE(channel_state ->> '"
                                + channel
                                + "', 'UNKNOWN') AS state, count(*) AS total FROM notification"
                                + " WHERE created_at >= :from GROUP BY 1 ORDER BY 1")
                .param("from", Timestamp.from(from))
                .query(
                        rs -> {
                            result.put(rs.getString("state"), rs.getLong("total"));
                        });
        return result;
    }

    /** Notifications created since {@code from} whose push or email delivery failed. */
    public long failed(Instant from) {
        return jdbc.sql(
                        "SELECT count(*) FROM notification WHERE created_at >= :from AND"
                                + " (channel_state ->> 'push' = 'FAILED' OR channel_state ->>"
                                + " 'email' = 'FAILED')")
                .param("from", Timestamp.from(from))
                .query(Long.class)
                .single();
    }

    /** Push tokens: {@code active} and {@code invalid}. */
    public Map<String, Long> pushTokens() {
        Map<String, Long> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT count(*) FILTER (WHERE invalid_at IS NULL) AS active, count(*)"
                                + " FILTER (WHERE invalid_at IS NOT NULL) AS invalid FROM"
                                + " push_token")
                .query(
                        rs -> {
                            result.put("active", rs.getLong("active"));
                            result.put("invalid", rs.getLong("invalid"));
                        });
        return result;
    }
}
