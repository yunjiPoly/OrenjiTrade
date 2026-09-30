package com.orenjitrade.api.reports.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds one OPEN collector report for the admin review flow ({@code docs/development/seed-data.md}
 * "Interactions"; fictional, local/dev only, stable id {@code 00000000-0000-4000-9e00-...}):
 * collector4 reports collector6 for SPAM from the profile. Inserted once; no event (the report
 * threshold is not reached by one report anyway).
 */
@Component
public class ReportSeedContributor implements SeedContributor {

    static final UUID REPORT = UUID.fromString("00000000-0000-4000-9e00-000000000001");
    static final UUID COLLECTOR4 = UUID.fromString("00000000-0000-4000-8000-000000000004");
    static final UUID COLLECTOR6 = UUID.fromString("00000000-0000-4000-8000-000000000006");

    private final JdbcClient jdbc;
    private final TimeProvider timeProvider;

    public ReportSeedContributor(JdbcClient jdbc, TimeProvider timeProvider) {
        this.jdbc = jdbc;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "reports";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 50;
    }

    @Override
    @Transactional
    public void seed() {
        if (!isActive(COLLECTOR4) || !isActive(COLLECTOR6)) {
            return;
        }
        Instant at = timeProvider.now().minus(Duration.ofHours(30)).truncatedTo(ChronoUnit.SECONDS);
        jdbc.sql(
                        """
                        INSERT INTO collector_report (id, reporter_id, reported_user_id, reason,
                            details, context, status, created_at, updated_at)
                        VALUES (:id, :reporter, :reported, 'SPAM', :details,
                            '{"source": "PROFILE"}'::jsonb, 'OPEN', :at, :at)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", REPORT)
                .param("reporter", COLLECTOR4)
                .param("reported", COLLECTOR6)
                .param(
                        "details",
                        "Sends the same promotion for an outside shop to everyone who publishes a"
                                + " Riftbound binder.")
                .param("at", Timestamp.from(at))
                .update();
    }

    private boolean isActive(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM user_account WHERE id = :id AND status = 'ACTIVE'")
                        .param("id", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }
}
