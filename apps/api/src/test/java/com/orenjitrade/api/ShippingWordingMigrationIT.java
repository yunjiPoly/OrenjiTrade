package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

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
 * V115 ({@code hide_local_meetups_tag}) and V116 ({@code region_channels_ship_by_mail}) on a
 * database that already holds collectors (stage R1 of the phone redesign, ADR 0018: deals ship by
 * mail, collectors don't meet). Flyway builds a scratch database up to V114, a fictional collector
 * carrying the "Local Meetups" tag and an admin's edit of one channel description are inserted,
 * then V115 and V116 run. Covers: the tag is hidden and the collector keeps the link (until they
 * next save their tags); the descriptions of V041 and V110 lose "meetups, locals" while an edited
 * one is kept.
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class ShippingWordingMigrationIT {

    private static final String DATABASE = "v116_populated_check";

    private static final UUID COLLECTOR = UUID.fromString("00000000-0000-4000-ab10-000000000001");

    /** What an admin wrote for the Europe channel through /admin/community/channels. */
    private static final String EDITED_EUROPE =
            "Europe: trades, meetups, locals. Edited by the moderation team.";

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;

    @BeforeAll
    static void migrateAPopulatedV114Database() {
        admin = new JdbcTemplate(dataSource("postgres"));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        admin.execute("CREATE DATABASE " + DATABASE);
        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);

        migrate(scratch, "114");
        db.update(
                "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, ?, ?)",
                COLLECTOR,
                "v116check-1",
                "v116check1");
        db.update(
                "INSERT INTO profile (user_id, display_name) VALUES (?, 'V116 Check')", COLLECTOR);
        db.update(
                "INSERT INTO profile_tag (profile_user_id, tag_id)"
                        + " SELECT ?, id FROM tag WHERE slug IN ('local-meetups', 'trader')",
                COLLECTOR);
        db.update(
                "UPDATE tag SET usage_count = usage_count + 1"
                        + " WHERE slug IN ('local-meetups', 'trader')");
        db.update(
                "UPDATE community_channel SET description = ? WHERE slug = 'europe'",
                EDITED_EUROPE);
        migrate(scratch, "116");
    }

    @AfterAll
    static void dropScratchDatabase() {
        if (admin != null) {
            admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        }
    }

    @Test
    void hidesTheMeetupTagAndKeepsItOnProfilesUntilTheirNextSave() {
        assertThat(status("local-meetups")).isEqualTo("HIDDEN");
        assertThat(status("shipping")).isEqualTo("ACTIVE");
        assertThat(status("trader")).isEqualTo("ACTIVE");
        assertThat(
                        db.queryForList(
                                "SELECT t.slug FROM profile_tag pt JOIN tag t ON t.id = pt.tag_id"
                                        + " WHERE pt.profile_user_id = ? ORDER BY t.slug",
                                String.class,
                                COLLECTOR))
                .containsExactly("local-meetups", "trader");
    }

    @Test
    void rewritesTheRegionChannelsThatPromisedMeetupsAndKeepsAnAdminEdit() {
        assertThat(description("americas-north"))
                .isEqualTo(
                        "Canada, the United States, Mexico, Central America and the Caribbean:"
                                + " trades and sales by mail.");
        assertThat(description("americas-south"))
                .isEqualTo("South American collectors and players: trades and sales by mail.");
        assertThat(description("montreal-yugioh"))
                .isEqualTo(
                        "Yu-Gi-Oh! collectors and players around Montréal: trades and sales by"
                                + " mail.");
        assertThat(description("europe")).isEqualTo(EDITED_EUROPE);
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM community_channel WHERE slug <> 'europe'"
                                        + " AND description ~* '(meetup|locals)'",
                                Integer.class))
                .isZero();
    }

    private static String status(String slug) {
        return db.queryForObject("SELECT status FROM tag WHERE slug = ?", String.class, slug);
    }

    private static String description(String slug) {
        return db.queryForObject(
                "SELECT description FROM community_channel WHERE slug = ?", String.class, slug);
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
