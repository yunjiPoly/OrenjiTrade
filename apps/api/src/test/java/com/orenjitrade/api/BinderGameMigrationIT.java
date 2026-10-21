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
 * V131 ({@code binder_game}, stage G of the phone redesign: a binder holds the cards of one game)
 * on a database that already holds binders: Flyway builds a scratch database up to V130, fictional
 * collectors with profiles, a small catalogue of Yu-Gi-Oh!, Pokémon and Magic cards (none of
 * Riftbound or One Piece) and binders of one game, mixed games, ties and empty binders are
 * inserted, then V131 runs. Covers the majority game, the three tie rules, the two empty-binder
 * rules (a profile game without cards is skipped), the cards of another game leaving their binder
 * (live and deleted ones, with the visibility rule), the binder counts, the audit rows that log how
 * many cards left, and the NOT NULL column.
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class BinderGameMigrationIT {

    private static final String DATABASE = "v131_populated_check";

    /** Profile games mtg, pokemon. */
    private static final UUID MAGIC_FAN = id("ab01", 1);

    /** Profile without games. */
    private static final UUID NO_GAMES = id("ab01", 2);

    /** No profile row at all. */
    private static final UUID NO_PROFILE = id("ab01", 3);

    /** Profile games riftbound (no cards), pokemon. */
    private static final UUID RIFT_FAN = id("ab01", 4);

    private static final UUID ONE_GAME = id("ab02", 1);
    private static final UUID MAJORITY_PUBLIC = id("ab02", 2);
    private static final UUID MAJORITY_PRIVATE = id("ab02", 3);
    private static final UUID TIE_PROFILE = id("ab02", 4);
    private static final UUID TIE_YUGIOH = id("ab02", 5);
    private static final UUID TIE_ORDER = id("ab02", 6);
    private static final UUID EMPTY_PROFILE = id("ab02", 7);
    private static final UUID EMPTY_NO_PROFILE = id("ab02", 8);
    private static final UUID TEMPORARY = id("ab02", 9);
    private static final UUID HIDDEN = id("ab02", 10);
    private static final UUID ONLY_DELETED = id("ab02", 11);

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;

    private static UUID ygoPrinting;
    private static UUID pkmPrinting;
    private static UUID mtgPrinting;

    /** Cards of another game, by where they were. */
    private static UUID fromPublicBinder;

    private static UUID fromPrivateBinder;
    private static UUID fromTiePublicBinder;
    private static UUID fromTemporaryBinder;
    private static UUID fromHiddenBinder;
    private static UUID deletedFromHiddenBinder;

    @BeforeAll
    static void migrateAPopulatedV130Database() {
        admin = new JdbcTemplate(dataSource("postgres"));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        admin.execute("CREATE DATABASE " + DATABASE);
        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);

        migrate(scratch, "130");
        ygoPrinting = printing("yugioh", "MGA");
        pkmPrinting = printing("pokemon", "MGB");
        mtgPrinting = printing("mtg", "MGC");

        collector(MAGIC_FAN, "{mtg,pokemon}");
        collector(NO_GAMES, "{}");
        collector(NO_PROFILE, null);
        collector(RIFT_FAN, "{riftbound,pokemon}");

        binder(ONE_GAME, MAGIC_FAN, "PUBLIC", "ACTIVE");
        item(ONE_GAME, MAGIC_FAN, ygoPrinting, "PUBLIC", false);
        item(ONE_GAME, MAGIC_FAN, ygoPrinting, "PUBLIC", false);

        binder(MAJORITY_PUBLIC, NO_GAMES, "PUBLIC", "ACTIVE");
        item(MAJORITY_PUBLIC, NO_GAMES, pkmPrinting, "PUBLIC", false);
        item(MAJORITY_PUBLIC, NO_GAMES, pkmPrinting, "PUBLIC", false);
        fromPublicBinder = item(MAJORITY_PUBLIC, NO_GAMES, ygoPrinting, "PUBLIC", false);

        binder(MAJORITY_PRIVATE, NO_GAMES, "PRIVATE", "ACTIVE");
        item(MAJORITY_PRIVATE, NO_GAMES, ygoPrinting, "PUBLIC", false);
        item(MAJORITY_PRIVATE, NO_GAMES, ygoPrinting, "PUBLIC", false);
        fromPrivateBinder = item(MAJORITY_PRIVATE, NO_GAMES, mtgPrinting, "PUBLIC", false);

        // A tie: the tied game first in the owner's profile games (mtg before pokemon).
        binder(TIE_PROFILE, MAGIC_FAN, "PUBLIC", "ACTIVE");
        item(TIE_PROFILE, MAGIC_FAN, pkmPrinting, "PUBLIC", false);
        item(TIE_PROFILE, MAGIC_FAN, mtgPrinting, "PUBLIC", false);

        // A tie that the profile does not decide: Yu-Gi-Oh! when it is one of them.
        binder(TIE_YUGIOH, NO_GAMES, "PUBLIC", "ACTIVE");
        item(TIE_YUGIOH, NO_GAMES, pkmPrinting, "PUBLIC", false);
        item(TIE_YUGIOH, NO_GAMES, ygoPrinting, "PUBLIC", false);

        // Otherwise the first tied game in the games' order (Pokémon 20 before Magic 30).
        binder(TIE_ORDER, NO_PROFILE, "PUBLIC", "ACTIVE");
        fromTiePublicBinder = item(TIE_ORDER, NO_PROFILE, mtgPrinting, "PUBLIC", false);
        item(TIE_ORDER, NO_PROFILE, pkmPrinting, "PUBLIC", false);

        // Empty: the first profile game with cards (Riftbound has none here), else Yu-Gi-Oh!.
        binder(EMPTY_PROFILE, RIFT_FAN, "PRIVATE", "ACTIVE");
        binder(EMPTY_NO_PROFILE, NO_PROFILE, "PRIVATE", "ACTIVE");

        // A temporarily public binder: a card that leaves it turns private.
        binder(TEMPORARY, NO_GAMES, "TEMPORARILY_PUBLIC", "ACTIVE");
        item(TEMPORARY, NO_GAMES, ygoPrinting, "PUBLIC", false);
        item(TEMPORARY, NO_GAMES, ygoPrinting, "PUBLIC", false);
        fromTemporaryBinder = item(TEMPORARY, NO_GAMES, pkmPrinting, "TEMPORARILY_PUBLIC", false);

        // A public binder hidden by freshness: the card that leaves it turns private too.
        binder(HIDDEN, NO_GAMES, "PUBLIC", "HIDDEN");
        item(HIDDEN, NO_GAMES, mtgPrinting, "PUBLIC", false);
        item(HIDDEN, NO_GAMES, mtgPrinting, "PUBLIC", false);
        fromHiddenBinder = item(HIDDEN, NO_GAMES, ygoPrinting, "PUBLIC", false);
        // A deleted card of another game that its undo could bring back: it leaves too, and a
        // deleted card does not count for the majority.
        deletedFromHiddenBinder = item(HIDDEN, NO_GAMES, pkmPrinting, "PUBLIC", true);
        item(HIDDEN, NO_GAMES, pkmPrinting, "PUBLIC", true);
        item(HIDDEN, NO_GAMES, pkmPrinting, "PUBLIC", true);

        // Only deleted cards: an empty binder (the owner has no profile games: Yu-Gi-Oh!).
        binder(ONLY_DELETED, NO_GAMES, "PRIVATE", "ACTIVE");
        item(ONLY_DELETED, NO_GAMES, pkmPrinting, "PRIVATE", true);

        migrate(scratch, "131");
    }

    @AfterAll
    static void dropScratchDatabase() {
        if (admin != null) {
            admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        }
    }

    @Test
    void everyBinderTakesTheGameMostOfItsCardsBelongTo() {
        assertThat(gameOf(ONE_GAME)).isEqualTo("yugioh");
        assertThat(gameOf(MAJORITY_PUBLIC)).isEqualTo("pokemon");
        assertThat(gameOf(MAJORITY_PRIVATE)).isEqualTo("yugioh");
        assertThat(gameOf(TEMPORARY)).isEqualTo("yugioh");
        assertThat(gameOf(HIDDEN)).as("deleted cards do not count").isEqualTo("mtg");
    }

    @Test
    void aTieTakesTheOwnersFirstProfileGameThenYugiohThenTheGamesOrder() {
        assertThat(gameOf(TIE_PROFILE)).isEqualTo("mtg");
        assertThat(gameOf(TIE_YUGIOH)).isEqualTo("yugioh");
        assertThat(gameOf(TIE_ORDER)).isEqualTo("pokemon");
    }

    @Test
    void anEmptyBinderTakesTheFirstProfileGameWithCardsElseYugioh() {
        assertThat(gameOf(EMPTY_PROFILE)).as("Riftbound has no cards").isEqualTo("pokemon");
        assertThat(gameOf(EMPTY_NO_PROFILE)).isEqualTo("yugioh");
        assertThat(gameOf(ONLY_DELETED)).isEqualTo("yugioh");
    }

    @Test
    void cardsOfAnotherGameLeaveTheBinderAndStayInTheInventory() {
        // Every card of another game is unfiled, none is deleted or lost.
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM inventory_item i JOIN binder b ON b.id ="
                                    + " i.binder_id JOIN card_printing p ON p.id = i.printing_id"
                                    + " JOIN card c ON c.id = p.card_id WHERE c.game_id <>"
                                    + " b.game_id",
                                Long.class))
                .isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM inventory_item", Long.class))
                .isEqualTo(24);
        assertThat(cards(ONE_GAME)).isEqualTo(2);
        assertThat(cards(MAJORITY_PUBLIC)).isEqualTo(2);
        assertThat(cards(MAJORITY_PRIVATE)).isEqualTo(2);
        assertThat(cards(TIE_PROFILE)).isEqualTo(1);
        assertThat(cards(TEMPORARY)).isEqualTo(2);
        assertThat(cards(HIDDEN)).isEqualTo(2);
        // binder.item_count follows (the count trigger).
        for (UUID binder : List.of(MAJORITY_PUBLIC, MAJORITY_PRIVATE, TEMPORARY, HIDDEN)) {
            assertThat(
                            db.queryForObject(
                                    "SELECT item_count FROM binder WHERE id = ?",
                                    Integer.class,
                                    binder))
                    .isEqualTo(cards(binder));
        }
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM inventory_item WHERE binder_id IS NULL",
                                Long.class))
                .isEqualTo(11);
    }

    @Test
    void aCardThatLeavesKeepsItsVisibilityOnlyFromAPublicListedBinder() {
        assertThat(state(fromPublicBinder)).isEqualTo("PUBLIC|-|live");
        assertThat(state(fromTiePublicBinder)).isEqualTo("PUBLIC|-|live");
        assertThat(state(fromPrivateBinder)).isEqualTo("PRIVATE|-|live");
        assertThat(state(fromTemporaryBinder)).isEqualTo("PRIVATE|-|live");
        assertThat(state(fromHiddenBinder)).isEqualTo("PRIVATE|-|live");
        // A deleted card stays deleted and keeps its undo, unfiled and private.
        assertThat(state(deletedFromHiddenBinder)).isEqualTo("PRIVATE|-|restorable");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM inventory_item WHERE binder_id IS NULL AND"
                                        + " (visibility = 'TEMPORARILY_PUBLIC' OR public_until IS"
                                        + " NOT NULL)",
                                Long.class))
                .isZero();
    }

    @Test
    void theMigrationLogsHowManyCardsLeftEachBinder() {
        List<Map<String, Object>> rows =
                db.queryForList(
                        "SELECT target_id, details::text AS details FROM audit_log WHERE action ="
                                + " 'binder.game.cards_moved_out' AND actor_type = 'SYSTEM' AND"
                                + " target_type = 'BINDER' ORDER BY target_id");
        assertThat(rows)
                .extracting(row -> row.get("target_id"))
                .containsExactlyInAnyOrder(
                        MAJORITY_PUBLIC.toString(),
                        MAJORITY_PRIVATE.toString(),
                        TIE_PROFILE.toString(),
                        TIE_YUGIOH.toString(),
                        TIE_ORDER.toString(),
                        TEMPORARY.toString(),
                        HIDDEN.toString(),
                        ONLY_DELETED.toString());
        Map<String, Object> hidden =
                rows.stream()
                        .filter(row -> HIDDEN.toString().equals(row.get("target_id")))
                        .findFirst()
                        .orElseThrow();
        assertThat(hidden.get("details").toString())
                .contains("\"cards\": 1")
                .contains("\"deletedCards\": 3")
                .contains("\"binderGame\": \"mtg\"")
                .contains("\"migration\": \"V131\"");
    }

    @Test
    void theGameIsRequiredFromNowOn() {
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO binder (owner_id, name) VALUES (?, 'No game')",
                                        NO_GAMES))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO binder (owner_id, name, game_id) VALUES (?,"
                                                + " 'Unknown game', ?)",
                                        NO_GAMES,
                                        UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM binder WHERE game_id IS NULL", Long.class))
                .isZero();
    }

    private static String gameOf(UUID binder) {
        return db.queryForObject(
                "SELECT g.slug FROM binder b JOIN game g ON g.id = b.game_id WHERE b.id = ?",
                String.class,
                binder);
    }

    private static long cards(UUID binder) {
        return db.queryForObject(
                "SELECT count(*) FROM inventory_item WHERE binder_id = ? AND deleted_at IS NULL",
                Long.class,
                binder);
    }

    /** "{visibility}|{binder or -}|{live or restorable}" of an item. */
    private static String state(UUID item) {
        return db.queryForObject(
                "SELECT visibility || '|' || COALESCE(binder_id::text, '-') || '|' || CASE WHEN"
                        + " deleted_at IS NULL THEN 'live' WHEN restorable_until > now() THEN"
                        + " 'restorable' ELSE 'deleted' END FROM inventory_item WHERE id = ?",
                String.class,
                item);
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
                "V131 set " + setCode,
                game);
        db.update(
                "INSERT INTO card (id, game_id, name, slug) SELECT ?, id, ?, ? FROM game WHERE"
                        + " slug = ?",
                card,
                "V131 card " + setCode,
                "v131-card-" + setCode.toLowerCase(java.util.Locale.ROOT),
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

    private static void collector(UUID id, @Nullable String games) {
        String handle = "v131check" + id.toString().substring(32);
        db.update(
                "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, ?, ?)",
                id,
                handle,
                handle);
        if (games != null) {
            db.update(
                    "INSERT INTO profile (user_id, display_name, games) VALUES (?, 'V131 Check',"
                            + " ?::text[])",
                    id,
                    games);
        }
    }

    private static void binder(UUID id, UUID owner, String visibility, String freshness) {
        db.update(
                "INSERT INTO binder (id, owner_id, name, visibility, public_until,"
                        + " freshness_state) VALUES (?, ?, 'V131 binder', ?, CASE WHEN ? ="
                        + " 'TEMPORARILY_PUBLIC' THEN now() + interval '1 day' END, ?)",
                id,
                owner,
                visibility,
                visibility,
                freshness);
    }

    private static UUID item(
            UUID binder, UUID owner, UUID printing, String visibility, boolean deleted) {
        UUID id = UUID.randomUUID();
        db.update(
                "INSERT INTO inventory_item (id, owner_id, binder_id, printing_id, condition,"
                    + " language, edition, finish, visibility, public_until, deleted_at,"
                    + " restorable_until) VALUES (?, ?, ?, ?, 'NEAR_MINT', 'en', 'UNLIMITED',"
                    + " 'NORMAL', ?, CASE WHEN ? = 'TEMPORARILY_PUBLIC' THEN now() + interval '1"
                    + " day' END, CASE WHEN ? THEN now() END, CASE WHEN ? THEN now() + interval '10"
                    + " minutes' END)",
                id,
                owner,
                binder,
                printing,
                visibility,
                visibility,
                deleted,
                deleted);
        return id;
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
