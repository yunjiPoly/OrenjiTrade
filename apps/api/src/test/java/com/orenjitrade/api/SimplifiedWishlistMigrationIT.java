package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
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
 * V112 ({@code simplified_wishlist}) on a database that already holds S1-model data: Flyway builds
 * a scratch database up to V111, fictional old-model wishes, a match, notifications and preferences
 * are inserted, then V112 runs. Covers the shapes that only become duplicates through V112's
 * normalisation (a rarity stored next to a printing, a printing wish without its card), which the
 * unique selection index would otherwise refuse.
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class SimplifiedWishlistMigrationIT {

    private static final String DATABASE = "v112_populated_check";

    private static final UUID OWNER = UUID.fromString("00000000-0000-4000-aa00-000000000001");
    private static final UUID OTHER = UUID.fromString("00000000-0000-4000-aa00-000000000002");
    private static final UUID CARD = UUID.fromString("00000000-0000-4000-aa20-000000000001");
    private static final UUID ULTRA = UUID.fromString("00000000-0000-4000-aa30-000000000001");
    private static final UUID SECRET = UUID.fromString("00000000-0000-4000-aa30-000000000002");

    /** Any printing, the oldest of two that differ only by removed filters: kept. */
    private static final UUID ANY_OLDEST = wish(1);

    /** Any printing, newer, other removed filters only: collapsed into {@link #ANY_OLDEST}. */
    private static final UUID ANY_NEWER = wish(2);

    /** One printing with its own rarity as an extra filter (old form): kept, rarity cleared. */
    private static final UUID ULTRA_WITH_RARITY = wish(3);

    /** The same printing without a rarity, newer: equal after the clearing, collapsed. */
    private static final UUID ULTRA_PLAIN = wish(4);

    /** The same printing with another rarity, newer: equal after the clearing, collapsed. */
    private static final UUID ULTRA_OTHER_RARITY = wish(5);

    /** A printing wish without its card (allowed by the old schema): kept, card filled in. */
    private static final UUID SECRET_NO_CARD = wish(6);

    /** The same printing with its card and rarity, newer: equal after normalising, collapsed. */
    private static final UUID SECRET_WITH_CARD = wish(7);

    /** Any printing of one rarity: kept with its rarity. */
    private static final UUID ANY_SECRET_RARITY = wish(8);

    /** Another collector's wish equal to {@link #ANY_OLDEST}: kept (one wish per collector). */
    private static final UUID OTHER_OWNER_ANY = wish(9);

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;

    @BeforeAll
    static void migrateAPopulatedV111Database() {
        admin = new JdbcTemplate(dataSource("postgres"));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        admin.execute("CREATE DATABASE " + DATABASE);
        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);

        migrate(scratch, "111");
        insertS1ModelData();
        migrate(scratch, "112");
    }

    @AfterAll
    static void dropScratchDatabase() {
        if (admin != null) {
            admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        }
    }

    @Test
    void collapsesWishesThatBecomeEqualAndKeepsTheOldest() {
        List<UUID> ownerWishes =
                db.queryForList(
                        "SELECT id FROM wishlist_item WHERE owner_id = ? ORDER BY id",
                        UUID.class,
                        OWNER);

        assertThat(ownerWishes)
                .containsExactly(ANY_OLDEST, ULTRA_WITH_RARITY, SECRET_NO_CARD, ANY_SECRET_RARITY);
        assertThat(
                        db.queryForList(
                                "SELECT id FROM wishlist_item WHERE owner_id = ?",
                                UUID.class,
                                OTHER))
                .containsExactly(OTHER_OWNER_ANY);
    }

    @Test
    void normalisesTheSelection() {
        Map<String, Object> ultra = row(ULTRA_WITH_RARITY);
        Map<String, Object> secret = row(SECRET_NO_CARD);
        Map<String, Object> anyRarity = row(ANY_SECRET_RARITY);

        assertThat(ultra.get("printing_id")).isEqualTo(ULTRA);
        assertThat(ultra.get("rarity")).as("a printing fixes its rarity").isNull();
        assertThat(secret.get("card_id")).as("the printing's card").isEqualTo(CARD);
        assertThat(secret.get("rarity")).isNull();
        assertThat(anyRarity.get("printing_id")).isNull();
        assertThat(anyRarity.get("rarity")).isEqualTo("Secret Rare");
        assertThat(
                        db.queryForObject(
                                "SELECT is_nullable FROM information_schema.columns"
                                        + " WHERE table_name = 'wishlist_item'"
                                        + " AND column_name = 'card_id'",
                                String.class))
                .isEqualTo("NO");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM pg_indexes WHERE indexname ="
                                        + " 'uq_wishlist_item_selection'",
                                Integer.class))
                .isOne();
    }

    @Test
    void neverCopiesPrivateNotesAndStartsTheNewFieldsEmpty() {
        List<Map<String, Object>> rows =
                db.queryForList(
                        "SELECT public_note, near_mint_only, price_term FROM wishlist_item");

        assertThat(rows)
                .hasSize(5)
                .allSatisfy(
                        row -> {
                            assertThat(row.get("public_note")).isEqualTo("");
                            assertThat(row.get("near_mint_only")).isEqualTo(false);
                            assertThat(row.get("price_term")).isNull();
                        });
        assertThat(
                        db.queryForList(
                                "SELECT column_name FROM information_schema.columns"
                                        + " WHERE table_name = 'wishlist_item'",
                                String.class))
                .doesNotContain(
                        "notes",
                        "max_price",
                        "currency",
                        "trade_preference",
                        "condition_min",
                        "edition",
                        "language",
                        "active",
                        "last_matched_at");
    }

    @Test
    void dropsMatchesAndTheirNotificationsButKeepsTheRest() {
        assertThat(
                        db.queryForObject(
                                "SELECT to_regclass('public.wishlist_match') IS NULL",
                                Boolean.class))
                .isTrue();
        assertThat(
                        db.queryForList(
                                "SELECT type FROM notification WHERE user_id = ?",
                                String.class,
                                OWNER))
                .containsExactly("MESSAGE");
        assertThat(
                        db.queryForObject(
                                "SELECT categories::text FROM notification_preferences"
                                        + " WHERE user_id = ?",
                                String.class,
                                OWNER))
                .contains("MESSAGE")
                .doesNotContain("WISHLIST_MATCH");
        assertThat(
                        db.queryForObject(
                                "SELECT wishlist_alerts FROM notification_preferences"
                                        + " WHERE user_id = ?",
                                Boolean.class,
                                OWNER))
                .isTrue();
        assertThat(
                        db.queryForObject(
                                "SELECT value::text FROM platform_settings"
                                        + " WHERE key = 'wishlist.price_terms'",
                                String.class))
                .isEqualTo("\"80% TCG,85% TCG,90% TCG,100% TCG,100% TCG+\"");
    }

    private static Map<String, Object> row(UUID id) {
        return db.queryForMap(
                "SELECT card_id, printing_id, rarity FROM wishlist_item WHERE id = ?", id);
    }

    private static UUID wish(int n) {
        return UUID.fromString(String.format("00000000-0000-4000-aa50-%012d", n));
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

    /** Fictional S1-model rows (the V050 / V109 wishlist with its removed filters and matches). */
    private static void insertS1ModelData() {
        db.update(
                "INSERT INTO user_account (id, provider_uid, handle) VALUES"
                        + " (?, 'v112check-a', 'v112checka'), (?, 'v112check-b', 'v112checkb')",
                OWNER,
                OTHER);
        db.update(
                "INSERT INTO card_set (id, game_id, code, name)"
                        + " SELECT '00000000-0000-4000-aa10-000000000001', id, 'V12',"
                        + " 'V112 Check Set' FROM game WHERE slug = 'yugioh'");
        db.update(
                "INSERT INTO card (id, game_id, name, slug)"
                        + " SELECT ?, id, 'V112 Check Dragon', 'v112-check-dragon' FROM game"
                        + " WHERE slug = 'yugioh'",
                CARD);
        db.update(
                "INSERT INTO card_printing"
                        + " (id, card_id, set_id, collector_number, rarity, printing_code) VALUES"
                        + " (?, ?, '00000000-0000-4000-aa10-000000000001', 'EN001', 'Ultra Rare',"
                        + " 'V12-EN001'),"
                        + " (?, ?, '00000000-0000-4000-aa10-000000000001', 'EN002', 'Secret Rare',"
                        + " 'V12-EN002')",
                ULTRA,
                CARD,
                SECRET,
                CARD);
        UUID listing = UUID.fromString("00000000-0000-4000-aa40-000000000001");
        db.update(
                "INSERT INTO inventory_item"
                        + " (id, owner_id, printing_id, condition, language, edition, finish)"
                        + " VALUES (?, ?, ?, 'NEAR_MINT', 'en', 'UNLIMITED', 'NORMAL')",
                listing,
                OTHER,
                ULTRA);

        insertWish(ANY_OLDEST, OWNER, CARD, null, null, "PRIVATE BUDGET NOTE", 60.00, 96);
        insertWish(ANY_NEWER, OWNER, CARD, null, null, "another private note", null, 72);
        insertWish(ULTRA_WITH_RARITY, OWNER, CARD, ULTRA, "Ultra Rare", "", null, 48);
        insertWish(ULTRA_PLAIN, OWNER, CARD, ULTRA, null, "", null, 24);
        insertWish(ULTRA_OTHER_RARITY, OWNER, CARD, ULTRA, "Secret Rare", "", null, 12);
        insertWish(SECRET_NO_CARD, OWNER, null, SECRET, null, "", null, 120);
        insertWish(SECRET_WITH_CARD, OWNER, CARD, SECRET, "Secret Rare", "", null, 6);
        insertWish(ANY_SECRET_RARITY, OWNER, CARD, null, "Secret Rare", "x", null, 3);
        insertWish(OTHER_OWNER_ANY, OTHER, CARD, null, null, "", null, 1);

        db.update(
                "INSERT INTO wishlist_match (wishlist_item_id, inventory_item_id, notified)"
                        + " VALUES (?, ?, true)",
                ANY_OLDEST,
                listing);
        db.update(
                "INSERT INTO notification"
                        + " (id, user_id, type, title, body, data, dedup_key, in_app, created_at,"
                        + " channel_state) VALUES"
                        + " (gen_random_uuid(), ?, 'WISHLIST_MATCH', 'Wishlist match', 'x',"
                        + " '{\"deepLink\": \"/wishlist/x\"}', 'wishlist:a:b', true, now(), '{}'),"
                        + " (gen_random_uuid(), ?, 'SYSTEM', 'More wishlist matches', 'x',"
                        + " '{\"kind\": \"LIMIT_REACHED\", \"notificationType\":"
                        + " \"WISHLIST_MATCH\"}', 'limit:a:WISHLIST_MATCH:2026-10-09', true, now(),"
                        + " '{}'),"
                        + " (gen_random_uuid(), ?, 'MESSAGE', 'New message', 'x', '{}',"
                        + " 'message:v112check', true, now(), '{}')",
                OWNER,
                OWNER,
                OWNER);
        db.update(
                "INSERT INTO notification_preferences (user_id, categories) VALUES (?,"
                        + " '{\"WISHLIST_MATCH\": {\"push\": false, \"email\": true, \"inApp\":"
                        + " true}, \"MESSAGE\": {\"push\": true, \"email\": false, \"inApp\":"
                        + " true}}')",
                OWNER);
    }

    private static void insertWish(
            UUID id,
            UUID owner,
            @Nullable UUID card,
            @Nullable UUID printing,
            @Nullable String rarity,
            String privateNote,
            @Nullable Double maxPrice,
            int hoursAgo) {
        db.update(
                "INSERT INTO wishlist_item (id, owner_id, game_slug, card_id, printing_id, rarity,"
                        + " condition_min, language, max_price, currency, trade_preference, notes,"
                        + " active, created_at) VALUES (?, ?, 'yugioh', ?, ?, ?, 'NEAR_MINT', 'en',"
                        + " ?, 'CAD', 'SALE', ?, true, now() - make_interval(hours => ?))",
                id,
                owner,
                card,
                printing,
                rarity,
                maxPrice,
                privateNote,
                hoursAgo);
    }
}
