package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
 * V132 ({@code binder_cover_game_and_defaults}, review fix 1 of stage G) on a database that V131
 * left with covers of another game: Flyway builds a scratch database up to V131, fictional binders
 * with covers are inserted, then V132 runs. A binder that has its game loses a cover of another
 * game (F7) and keeps one of its own game; a binder made without a game keeps any cover. The app
 * version before stage G inserts binders without a game: the column defaults give such a binder
 * Yu-Gi-Oh! and let it follow its cards (F8).
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class BinderCoverGameMigrationIT {

    private static final String DATABASE = "v132_cover_check";

    private static final UUID OWNER = id("ac01", 1);
    private static final UUID COVER_OF_ANOTHER_GAME = id("ac02", 1);
    private static final UUID COVER_OF_ITS_GAME = id("ac02", 2);
    private static final UUID FOLLOWS_ITS_CARDS = id("ac02", 3);
    private static final UUID NO_COVER = id("ac02", 4);

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;

    private static UUID pkmPrinting;
    private static UUID mtgPrinting;

    @BeforeAll
    static void migrateAV131DatabaseWithCovers() {
        admin = new JdbcTemplate(dataSource("postgres"));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        admin.execute("CREATE DATABASE " + DATABASE);
        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);

        migrate(scratch, "131");
        pkmPrinting = printing("pokemon", "MCB");
        mtgPrinting = printing("mtg", "MCC");
        db.update(
                "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, 'v132check',"
                        + " 'v132check')",
                OWNER);
        binder(COVER_OF_ANOTHER_GAME, "pokemon", mtgPrinting, false);
        binder(COVER_OF_ITS_GAME, "pokemon", pkmPrinting, false);
        binder(FOLLOWS_ITS_CARDS, "pokemon", mtgPrinting, true);
        binder(NO_COVER, "mtg", null, false);

        migrate(scratch, "132");
    }

    @AfterAll
    static void dropScratchDatabase() {
        if (admin != null) {
            admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        }
    }

    @Test
    void aCoverOfAnotherGameLeavesABinderThatHasItsGame() {
        assertThat(cover(COVER_OF_ANOTHER_GAME)).isNull();
        assertThat(cover(COVER_OF_ITS_GAME)).isEqualTo(pkmPrinting);
        assertThat(cover(FOLLOWS_ITS_CARDS))
                .as("a binder made without a game refuses no cover")
                .isEqualTo(mtgPrinting);
        assertThat(cover(NO_COVER)).isNull();
    }

    @Test
    void aBinderInsertedWithoutAGameIsYugiohAndFollowsItsCards() {
        // The insert of the app version before stage G names neither column.
        UUID old = UUID.randomUUID();
        db.update("INSERT INTO binder (id, owner_id, name) VALUES (?, ?, 'Old app')", old, OWNER);
        Map<String, Object> row =
                db.queryForMap(
                        "SELECT g.slug, b.game_follows_cards FROM binder b JOIN game g ON g.id ="
                                + " b.game_id WHERE b.id = ?",
                        old);
        assertThat(row.get("slug")).isEqualTo("yugioh");
        assertThat(row.get("game_follows_cards")).isEqualTo(true);
        // The game is still required and must exist.
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO binder (owner_id, name, game_id) VALUES (?,"
                                                + " 'No game', NULL)",
                                        OWNER))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO binder (owner_id, name, game_id) VALUES (?,"
                                                + " 'Unknown game', ?)",
                                        OWNER,
                                        UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private static @Nullable UUID cover(UUID binder) {
        return db.queryForObject(
                "SELECT cover_printing_id FROM binder WHERE id = ?", UUID.class, binder);
    }

    private static void binder(UUID id, String game, @Nullable UUID cover, boolean follows) {
        db.update(
                "INSERT INTO binder (id, owner_id, name, game_id, cover_printing_id,"
                        + " game_follows_cards) SELECT ?, ?, 'V132 binder', id, ?, ? FROM game"
                        + " WHERE slug = ?",
                id,
                OWNER,
                cover,
                follows,
                game);
    }

    private static UUID printing(String game, String setCode) {
        UUID set = UUID.randomUUID();
        UUID card = UUID.randomUUID();
        UUID printing = UUID.randomUUID();
        db.update(
                "INSERT INTO card_set (id, game_id, code, name) SELECT ?, id, ?, ? FROM game WHERE"
                        + " slug = ?",
                set,
                setCode,
                "V132 set " + setCode,
                game);
        db.update(
                "INSERT INTO card (id, game_id, name, slug) SELECT ?, id, ?, ? FROM game WHERE"
                        + " slug = ?",
                card,
                "V132 card " + setCode,
                "v132-card-" + setCode.toLowerCase(java.util.Locale.ROOT),
                game);
        db.update(
                "INSERT INTO card_printing (id, card_id, set_id, collector_number, printing_code)"
                        + " VALUES (?, ?, ?, '001', ?)",
                printing,
                card,
                set,
                setCode + "-001");
        return printing;
    }

    private static UUID id(String group, int n) {
        return UUID.fromString(String.format("00000000-0000-4000-%s-%012d", group, n));
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
