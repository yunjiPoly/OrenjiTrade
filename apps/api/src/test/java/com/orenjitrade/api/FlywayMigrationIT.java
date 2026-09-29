package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** Verifies that the Flyway baseline (V001, V002) applies cleanly to PostGIS 17. */
class FlywayMigrationIT extends AbstractIntegrationTest {

    @Autowired private JdbcTemplate jdbc;

    @Test
    void appliesV001AndV002() {
        List<Map<String, Object>> history =
                jdbc.queryForList(
                        "SELECT version, description FROM flyway_schema_history"
                                + " WHERE success ORDER BY installed_rank");

        assertThat(history)
                .extracting(row -> Integer.parseInt(String.valueOf(row.get("version"))))
                .contains(1, 2);
        assertThat(history)
                .extracting(row -> String.valueOf(row.get("description")))
                .contains("extensions", "event publication");
    }

    @Test
    void installsRequiredExtensions() {
        List<String> extensions =
                jdbc.queryForList("SELECT extname FROM pg_extension", String.class);

        assertThat(extensions).contains("postgis", "pg_trgm", "unaccent", "pgcrypto");
    }

    @Test
    void postgisGeographyDistanceWorks() {
        Boolean within =
                jdbc.queryForObject(
                        "SELECT ST_DWithin(ST_MakePoint(-73.57,45.50)::geography,"
                                + " ST_MakePoint(-73.56,45.51)::geography, 2000)",
                        Boolean.class);

        assertThat(within).isTrue();
    }

    @Test
    void unaccentImmutableStripsAccents() {
        String result =
                jdbc.queryForObject("SELECT unaccent_immutable('Pokémon Émilie')", String.class);
        String volatility =
                jdbc.queryForObject(
                        "SELECT provolatile::text FROM pg_proc WHERE proname = 'unaccent_immutable'",
                        String.class);

        assertThat(result).isEqualTo("Pokemon Emilie");
        assertThat(volatility).isEqualTo("i");
    }

    @Test
    void createsModulithEventPublicationTable() {
        Boolean exists =
                jdbc.queryForObject(
                        "SELECT to_regclass('public.event_publication') IS NOT NULL", Boolean.class);
        List<String> columns =
                jdbc.queryForList(
                        "SELECT column_name FROM information_schema.columns"
                                + " WHERE table_name = 'event_publication'",
                        String.class);
        List<String> indexes =
                jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'event_publication'",
                        String.class);

        assertThat(exists).isTrue();
        assertThat(columns)
                .contains(
                        "id",
                        "listener_id",
                        "event_type",
                        "serialized_event",
                        "publication_date",
                        "completion_date",
                        "status",
                        "completion_attempts",
                        "last_resubmission_date");
        assertThat(indexes)
                .contains(
                        "event_publication_serialized_event_hash_idx",
                        "event_publication_by_completion_date_idx");
    }
}
