package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Verifies that the Flyway migrations apply cleanly to PostGIS 17, and that the schema they build
 * stores no coordinate (ADR 0017).
 */
class FlywayMigrationIT extends AbstractIntegrationTest {

    @Autowired private JdbcTemplate jdbc;

    @Test
    void appliesV001ToV003() {
        List<Map<String, Object>> history =
                jdbc.queryForList(
                        "SELECT version, description FROM flyway_schema_history"
                                + " WHERE success ORDER BY installed_rank");

        assertThat(history)
                .extracting(row -> Integer.parseInt(String.valueOf(row.get("version"))))
                .contains(1, 2, 3);
        assertThat(history)
                .extracting(row -> String.valueOf(row.get("description")))
                .contains("extensions", "event publication", "users");
    }

    /**
     * Stage F1 ("free for all", V120 to V123) on a database migrated from scratch: no table, flag,
     * setting, column or role of Premium, credits, donations or ads is left, and one usage limit
     * per key holds today's numbers for everyone. {@link PaidFeaturesRemovalMigrationIT} covers a
     * database that held their data.
     */
    @Test
    void thePaidFeaturesLeftTheSchema() {
        for (String relation :
                List.of(
                        "plan",
                        "plan_feature",
                        "entitlement",
                        "subscription",
                        "subscription_event",
                        "billing_webhook_event",
                        "credit_ledger_entry",
                        "credit_balance",
                        "credit_product",
                        "referral_code",
                        "referral_redemption",
                        "advertiser",
                        "ad_placement",
                        "ad_campaign",
                        "ad_creative",
                        "ad_targeting_rule",
                        "ad_impression",
                        "ad_click",
                        "ad_conversion",
                        "ad_campaign_daily",
                        "donation",
                        "donation_webhook_event")) {
            assertThat(
                            jdbc.queryForObject(
                                    "SELECT to_regclass(?) IS NULL", Boolean.class, relation))
                    .as(relation)
                    .isTrue();
        }
        assertThat(
                        jdbc.queryForList(
                                "SELECT column_name FROM information_schema.columns WHERE"
                                        + " (table_name = 'user_account' AND column_name ="
                                        + " 'plan_code') OR (table_name = 'usage_limit' AND"
                                        + " column_name = 'plan_id')",
                                String.class))
                .isEmpty();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM feature_flag WHERE key IN ('premiumPlans',"
                                        + " 'credits', 'donations', 'advertising')",
                                Integer.class))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM platform_settings WHERE key LIKE 'credits.%'"
                                        + " OR key LIKE 'donations.%'",
                                Integer.class))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) = count(DISTINCT limit_key) AND count(*) = 6 FROM"
                                        + " usage_limit WHERE limit_key NOT LIKE 'test.%'",
                                Boolean.class))
                .as("one usage limit per key")
                .isTrue();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname"
                                        + " = 'ck_user_role_role'",
                                String.class))
                .doesNotContain("PREMIUM_USER")
                .contains("SUPER_ADMIN");
    }

    @Test
    void installsRequiredExtensions() {
        List<String> extensions =
                jdbc.queryForList("SELECT extname FROM pg_extension", String.class);

        assertThat(extensions).contains("postgis", "pg_trgm", "unaccent", "pgcrypto");
    }

    /**
     * PostGIS stays installed (a CLAUDE.md stack decision) although location no longer uses it (ADR
     * 0017): the extension answers, without any coordinate.
     */
    @Test
    void postgisStaysInstalled() {
        String version = jdbc.queryForObject("SELECT postgis_lib_version()", String.class);

        assertThat(version).isNotBlank();
    }

    /**
     * ADR 0017: no coordinate is stored anywhere. Outside PostGIS's own catalogue tables, no column
     * has a spatial type or a coordinate, radius, grid or distance name, and no GiST index remains.
     */
    @Test
    void schemaStoresNoCoordinateRadiusOrDistance() {
        List<String> columns =
                jdbc.queryForList(
                        "SELECT table_name || '.' || column_name || ' ' || udt_name"
                                + " FROM information_schema.columns WHERE table_schema = 'public'"
                                + " AND table_name NOT IN"
                                + " ('spatial_ref_sys', 'geography_columns', 'geometry_columns')"
                                + " AND (udt_name IN"
                                + " ('geometry', 'geography', 'point', 'box', 'circle', 'polygon')"
                                + " OR column_name ~ '(^|_)(point|points|lat|lng|lon|latitude"
                                + "|longitude|radius|grid|cell|distance|centre|center|geo|gps"
                                + "|coord|coordinates)(_|$)')",
                        String.class);
        List<String> gistIndexes =
                jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"
                                + " AND indexdef ~* 'using gist'",
                        String.class);

        assertThat(columns).isEmpty();
        assertThat(gistIndexes).isEmpty();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM information_schema.columns"
                                        + " WHERE table_schema = 'public' AND table_name ="
                                        + " 'user_location'",
                                Integer.class))
                .isPositive();
    }

    /** The database comments describe the region model, not the coordinate one (V108–V111). */
    @Test
    void databaseCommentsNoLongerDescribeCoordinatesOrNearby() {
        List<String> stale =
                jdbc.queryForList(
                        "SELECT c.relname || coalesce('.' || a.attname, '')"
                                + " FROM pg_description d JOIN pg_class c ON c.oid = d.objoid"
                                + " JOIN pg_namespace n ON n.oid = c.relnamespace"
                                + " LEFT JOIN pg_attribute a ON a.attrelid = c.oid"
                                + " AND a.attnum = d.objsubid AND d.objsubid > 0"
                                + " WHERE n.nspname = 'public' AND d.description ~*"
                                + " '(nearby|near me|approximate|public.point|jitter|grid cell"
                                + "|trading.area|radius|ADR 0004)'",
                        String.class);

        assertThat(stale).isEmpty();
    }

    @Test
    void unaccentImmutableStripsAccents() {
        String result =
                jdbc.queryForObject("SELECT unaccent_immutable('Pokémon Émilie')", String.class);
        String volatility =
                jdbc.queryForObject(
                        "SELECT provolatile::text FROM pg_proc WHERE proname ="
                                + " 'unaccent_immutable'",
                        String.class);

        assertThat(result).isEqualTo("Pokemon Emilie");
        assertThat(volatility).isEqualTo("i");
    }

    @Test
    void createsModulithEventPublicationTable() {
        Boolean exists =
                jdbc.queryForObject(
                        "SELECT to_regclass('public.event_publication') IS NOT NULL",
                        Boolean.class);
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

    @Test
    void createsUserTablesWithConstraintsAndSeedDocuments() {
        List<String> tables =
                jdbc.queryForList(
                        "SELECT table_name FROM information_schema.tables"
                                + " WHERE table_schema = 'public'",
                        String.class);
        assertThat(tables)
                .contains(
                        "user_account",
                        "user_role",
                        "legal_document",
                        "user_consent",
                        "audit_log",
                        "job_run");

        List<String> userIndexes =
                jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'user_account'",
                        String.class);
        assertThat(userIndexes).contains("uq_user_account_handle_lower");

        List<String> auditIndexes =
                jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'audit_log'",
                        String.class);
        assertThat(auditIndexes)
                .contains("ix_audit_log_target", "ix_audit_log_actor", "ix_audit_log_occurred_at");

        Integer documents =
                jdbc.queryForObject(
                        "SELECT count(*) FROM legal_document WHERE current", Integer.class);
        Integer required =
                jdbc.queryForObject(
                        "SELECT count(*) FROM legal_document WHERE current AND"
                                + " required_at_registration",
                        Integer.class);
        assertThat(documents)
                .as("8 legal texts + the AGE_CONFIRMATION attestation (V103)")
                .isEqualTo(9);
        assertThat(required)
                .as("the 18+ attestation is never required_at_registration")
                .isEqualTo(4);
    }
}
