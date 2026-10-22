package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * V134 ({@code community_rooms_per_game}, stage R11) on databases that already hold community data.
 * Flyway builds two scratch databases up to V133: in the first, a collector's post in "general", an
 * admin's channel and the publicChat flag switched off without an admin (as a migration default
 * would); in the second, an admin switched publicChat off. Then V134 runs. Covers: the 15 rooms
 * (slug, name, description, game, region, order), every other channel archived with its posts kept,
 * the flag on by default and an admin's choice kept, the COMMUNITY upload kind and the photo table.
 *
 * <p>The scratch databases live in the shared Testcontainers PostGIS server (never a developer
 * database) and are dropped afterwards. No Spring context is needed.
 */
class CommunityRoomsMigrationIT {

    private static final String DATABASE = "v134_populated_check";
    private static final String ADMIN_CHOICE = "v134_admin_choice_check";

    private static final UUID COLLECTOR = UUID.fromString("00000000-0000-4000-ab34-000000000001");
    private static final UUID ADMIN = UUID.fromString("00000000-0000-4000-ab34-000000000002");
    private static final UUID POST = UUID.fromString("00000000-0000-4000-ab34-000000000101");

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;
    private static JdbcTemplate adminChoice;

    @BeforeAll
    static void migrateV133Databases() {
        admin = new JdbcTemplate(dataSource("postgres"));
        for (String name : List.of(DATABASE, ADMIN_CHOICE)) {
            admin.execute("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
            admin.execute("CREATE DATABASE " + name);
        }

        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);
        migrate(scratch, "133");
        db.update(
                "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, ?, ?)",
                COLLECTOR,
                "v134check-1",
                "v134check1");
        db.update(
                "INSERT INTO community_post (id, channel_id, author_id, body, body_hash)"
                        + " SELECT ?, id, ?, 'Hello general', repeat('a', 64)"
                        + " FROM community_channel WHERE slug = 'general'",
                POST,
                COLLECTOR);
        db.update(
                "INSERT INTO community_channel (slug, name, kind, game_slug, region_label)"
                        + " VALUES ('quebec-pokemon', 'Québec / Pokémon', 'REGION', 'pokemon',"
                        + " 'americas-north')");
        db.update("UPDATE feature_flag SET enabled = false WHERE key = 'publicChat'");
        migrate(scratch, "134");

        DataSource choice = dataSource(ADMIN_CHOICE);
        adminChoice = new JdbcTemplate(choice);
        migrate(choice, "133");
        adminChoice.update(
                "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, ?, ?)",
                ADMIN,
                "v134check-2",
                "v134check2");
        adminChoice.update(
                "UPDATE feature_flag SET enabled = false, updated_by = ? WHERE key = 'publicChat'",
                ADMIN);
        migrate(choice, "134");
    }

    @AfterAll
    static void dropScratchDatabases() {
        if (admin != null) {
            for (String name : List.of(DATABASE, ADMIN_CHOICE)) {
                admin.execute("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
            }
        }
    }

    @Test
    void createsOneRoomPerPlatformRegionAndGame() {
        List<Map<String, Object>> rooms =
                db.queryForList(
                        "SELECT slug, name, kind, game_slug, region_label, description,"
                                + " post_rate_limit_per_hour FROM community_channel"
                                + " WHERE status = 'ACTIVE' ORDER BY sort_order, name, slug");
        assertThat(rooms)
                .extracting(row -> row.get("slug"))
                .containsExactly(
                        "americas-north-yugioh",
                        "americas-north-pokemon",
                        "americas-north-mtg",
                        "americas-north-onepiece",
                        "americas-north-riftbound",
                        "americas-south-yugioh",
                        "americas-south-pokemon",
                        "americas-south-mtg",
                        "americas-south-onepiece",
                        "americas-south-riftbound",
                        "europe-yugioh",
                        "europe-pokemon",
                        "europe-mtg",
                        "europe-onepiece",
                        "europe-riftbound");
        for (Map<String, Object> room : rooms) {
            String slug = (String) room.get("slug");
            String region = (String) room.get("region_label");
            String game = (String) room.get("game_slug");
            assertThat(slug).isEqualTo(region + "-" + game);
            assertThat(room.get("kind")).isEqualTo("REGION");
            assertThat(room.get("post_rate_limit_per_hour")).isEqualTo(10);
            assertThat((String) room.get("description"))
                    .isEqualTo(
                            room.get("name")
                                    + " collectors in "
                                    + switch (region) {
                                        case "americas-north" -> "Americas (North)";
                                        case "americas-south" -> "Americas (South)";
                                        default -> "Europe";
                                    }
                                    + ": trades and sales by mail.");
        }
        assertThat(rooms)
                .extracting(row -> row.get("name"))
                .startsWith(
                        "Yu-Gi-Oh!", "Pokémon", "Magic: The Gathering", "One Piece", "Riftbound");
    }

    @Test
    void archivesEveryOtherChannelAndKeepsItsPosts() {
        assertThat(
                        db.queryForList(
                                "SELECT slug FROM community_channel WHERE status = 'ARCHIVED'",
                                String.class))
                .contains(
                        "americas-north",
                        "americas-south",
                        "europe",
                        "looking-for",
                        "new-listings",
                        "trades",
                        "general",
                        "montreal-yugioh",
                        "quebec-pokemon");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM community_channel WHERE status = 'ACTIVE'",
                                Integer.class))
                .isEqualTo(15);
        assertThat(
                        db.queryForObject(
                                "SELECT body FROM community_post WHERE id = ?", String.class, POST))
                .isEqualTo("Hello general");
    }

    @Test
    void switchesThePublicChatFlagOnUnlessAnAdminChose() {
        assertThat(
                        db.queryForObject(
                                "SELECT enabled FROM feature_flag WHERE key = 'publicChat'",
                                Boolean.class))
                .isTrue();
        assertThat(
                        adminChoice.queryForObject(
                                "SELECT enabled FROM feature_flag WHERE key = 'publicChat'",
                                Boolean.class))
                .isFalse();
    }

    @Test
    void acceptsCommunityUploadsAndPostPhotos() {
        UUID upload = UUID.randomUUID();
        db.update(
                "INSERT INTO image_upload (id, owner_id, kind, storage_key, width, height, bytes)"
                        + " VALUES (?, ?, 'COMMUNITY', ?, 10, 10, 100)",
                upload,
                COLLECTOR,
                "uploads/v134/" + upload + ".jpg");
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO image_upload (owner_id, kind, storage_key,"
                                                + " width, height, bytes) VALUES (?, 'VIDEO',"
                                                + " 'uploads/v134/video', 10, 10, 100)",
                                        COLLECTOR))
                .isInstanceOf(DataIntegrityViolationException.class);
        UUID post = UUID.randomUUID();
        db.update(
                "INSERT INTO community_post (id, channel_id, author_id, body, body_hash)"
                        + " SELECT ?, id, ?, 'Photo post', repeat('b', 64)"
                        + " FROM community_channel WHERE slug = 'europe-yugioh'",
                post,
                COLLECTOR);
        db.update(
                "INSERT INTO community_post_photo (post_id, storage_key, width, height, bytes,"
                        + " position) VALUES (?, 'uploads/v134/photo.jpg', 10, 10, 100, 0)",
                post);
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO community_post_photo (post_id, storage_key,"
                                                + " width, height, bytes, position) VALUES (?,"
                                                + " 'uploads/v134/other.jpg', 10, 10, 100, 0)",
                                        post))
                .as("one photo per position")
                .isInstanceOf(DataIntegrityViolationException.class);
        db.update("DELETE FROM community_post WHERE id = ?", post);
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM community_post_photo WHERE post_id = ?",
                                Integer.class,
                                post))
                .isZero();
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
