package com.orenjitrade.api.analytics.infra;

import com.orenjitrade.api.analytics.domain.AnalyticsAggregate;
import com.orenjitrade.api.analytics.domain.AnalyticsEvent;
import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * {@link AnalyticsAggregate} on the {@code analytics_daily_count} table (V063): an upsert per event
 * (auto-commit, outside any request transaction).
 */
public class JdbcAnalyticsAggregate implements AnalyticsAggregate {

    private final JdbcClient jdbc;

    public JdbcAnalyticsAggregate(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void record(AnalyticsEvent event) {
        LocalDate day = LocalDate.ofInstant(event.occurredAt(), ZoneOffset.UTC);
        jdbc.sql(
                        """
                        INSERT INTO analytics_daily_count (day, event_type, count, updated_at)
                        VALUES (:day, :type, 1, now())
                        ON CONFLICT (day, event_type)
                        DO UPDATE SET count = analytics_daily_count.count + 1, updated_at = now()
                        """)
                .param("day", Date.valueOf(day))
                .param("type", event.type())
                .update();
    }

    @Override
    public List<DailyCount> between(LocalDate from, LocalDate to) {
        return jdbc.sql(
                        "SELECT day, event_type, count FROM analytics_daily_count WHERE day BETWEEN"
                                + " :from AND :to ORDER BY day, event_type")
                .param("from", Date.valueOf(from))
                .param("to", Date.valueOf(to))
                .query(
                        (rs, rowNum) ->
                                new DailyCount(
                                        rs.getDate("day").toLocalDate(),
                                        rs.getString("event_type"),
                                        rs.getLong("count")))
                .list();
    }
}
