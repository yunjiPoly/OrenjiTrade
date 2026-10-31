package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * V135 ({@code collector_report_numbers}, web stage WH1) on a database that already holds reports
 * (review fix 1, finding F9: the integration tests start on an empty table). Flyway builds a
 * scratch database up to V134, three fictional collectors file four reports (two in the same
 * instant), then V135 runs. Covers: existing reports are numbered from 1001 by filing date, then
 * id; the next report takes the number after the last; numbers are unique.
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class ReportNumberMigrationIT {

    private static final String DATABASE = "v135_populated_check";

    private static final UUID ANNA = UUID.fromString("00000000-0000-4000-ab35-000000000001");
    private static final UUID BRUNO = UUID.fromString("00000000-0000-4000-ab35-000000000002");
    private static final UUID CLEO = UUID.fromString("00000000-0000-4000-ab35-000000000003");

    /** The reports in the order they were filed (two at the same instant: by id then). */
    private static final UUID FIRST = UUID.fromString("00000000-0000-4000-ab35-0000000000a4");

    private static final UUID TIED_LOW = UUID.fromString("00000000-0000-4000-ab35-0000000000a1");
    private static final UUID TIED_HIGH = UUID.fromString("00000000-0000-4000-ab35-0000000000a2");
    private static final UUID LAST = UUID.fromString("00000000-0000-4000-ab35-0000000000a0");

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;

    @BeforeAll
    static void migrateAPopulatedV134Database() {
        admin = new JdbcTemplate(dataSource("postgres"));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        admin.execute("CREATE DATABASE " + DATABASE);
        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);

        migrate(scratch, "134");
        int index = 1;
        for (UUID id : List.of(ANNA, BRUNO, CLEO)) {
            db.update(
                    "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, ?, ?)",
                    id,
                    "v135check-" + index,
                    "v135check" + index);
            index++;
        }
        report(LAST, ANNA, BRUNO, "2026-10-03T10:00:00Z", "DISMISSED");
        report(FIRST, BRUNO, CLEO, "2026-10-01T10:00:00Z", "OPEN");
        report(TIED_HIGH, CLEO, ANNA, "2026-10-02T10:00:00Z", "OPEN");
        report(TIED_LOW, ANNA, CLEO, "2026-10-02T10:00:00Z", "UNDER_REVIEW");
        migrate(scratch, "135");
    }

    @AfterAll
    static void dropScratchDatabase() {
        if (admin != null) {
            admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        }
    }

    @Test
    void existingReportsAreNumberedByFilingDateThenIdFrom1001() {
        assertThat(number(FIRST)).isEqualTo(1001);
        assertThat(number(TIED_LOW)).isEqualTo(1002);
        assertThat(number(TIED_HIGH)).isEqualTo(1003);
        assertThat(number(LAST)).isEqualTo(1004);
    }

    @Test
    void theNextReportTakesTheNumberAfterTheLast() {
        UUID next = UUID.fromString("00000000-0000-4000-ab35-0000000000b1");
        report(next, BRUNO, ANNA, "2026-10-04T10:00:00Z", "OPEN");
        assertThat(number(next)).isEqualTo(1005);
        assertThat(
                        db.queryForObject(
                                "SELECT count(DISTINCT report_number) = count(*) FROM"
                                        + " collector_report",
                                Boolean.class))
                .isTrue();
    }

    private static void report(UUID id, UUID reporter, UUID reported, String at, String status) {
        boolean decided = status.equals("DISMISSED");
        db.update(
                "INSERT INTO collector_report (id, reporter_id, reported_user_id, reason, status,"
                        + " created_at, updated_at, resolved_at, resolution_action) VALUES (?, ?,"
                        + " ?, 'SPAM', ?, ?::timestamptz, ?::timestamptz, ?::timestamptz, ?)",
                id,
                reporter,
                reported,
                status,
                at,
                at,
                decided ? at : null,
                decided ? "NONE" : null);
    }

    private static long number(UUID id) {
        Long number =
                db.queryForObject(
                        "SELECT report_number FROM collector_report WHERE id = ?", Long.class, id);
        return number == null ? -1 : number;
    }

    private static DataSource dataSource(String database) {
        var postgres = TestcontainersConfiguration.POSTGRES;
        return new DriverManagerDataSource(
                "jdbc:postgresql://"
                        + postgres.getHost()
                        + ":"
                        + postgres.getMappedPort(5432)
                        + "/"
                        + database,
                postgres.getUsername(),
                postgres.getPassword());
    }

    private static void migrate(DataSource dataSource, String target) {
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .validateMigrationNaming(true)
                .target(target)
                .load()
                .migrate();
    }
}
