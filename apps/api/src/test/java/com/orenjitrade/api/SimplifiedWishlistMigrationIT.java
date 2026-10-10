package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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
 * a scratch database up to V111, fictional old-model wishes, a match, notifications, preferences,
 * outbox rows and analytics counts are inserted, then V112 runs. Covers:
 *
 * <ul>
 *   <li>the shapes that only become duplicates through V112's normalisation (a rarity stored next
 *       to a printing, a printing wish without its card or with another card, a rarity no printing
 *       of the card has, rarity strings with blanks), which the unique selection index would
 *       otherwise refuse;
 *   <li>duplicates that differ in each dropped column, and a tie on {@code created_at};
 *   <li>paused wishes (deleted, never made public), carried-over alert opt-outs, incomplete outbox
 *       rows of the removed and reshaped events, and the analytics rows of the removed event.
 * </ul>
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class SimplifiedWishlistMigrationIT {

    private static final String DATABASE = "v112_populated_check";

    /** Every fictional wish is created relative to this instant, so ties are exact. */
    private static final Instant BASE = Instant.parse("2026-10-01T12:00:00Z");

    private static final UUID OWNER = user(1);
    private static final UUID OTHER = user(2);

    /** Owns duplicates that differ in one dropped column each. */
    private static final UUID FILTERS = user(3);

    /** Owns two equal wishes created at the same instant. */
    private static final UUID TIE = user(4);

    /** Owns paused wishes. */
    private static final UUID PAUSED = user(5);

    /** Owns wishes whose rarity needs normalising. */
    private static final UUID RARITY = user(6);

    /** Owns a printing wish stored with another card. */
    private static final UUID MISMATCH = user(7);

    /** Has no preferences row at all. */
    private static final UUID NO_PREFERENCES = user(8);

    private static final UUID CARD = UUID.fromString("00000000-0000-4000-aa20-000000000001");

    /** A card of another game with one Common printing (no Secret Rare, no Ghost Rare). */
    private static final UUID OTHER_CARD = UUID.fromString("00000000-0000-4000-aa20-000000000002");

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

    /** The oldest of nine wishes that differ in one dropped column each: the only one kept. */
    private static final UUID FILTERS_OLDEST = wish(20);

    /** Two equal wishes of one instant: the smaller id is kept. */
    private static final UUID TIE_SMALLER_ID = wish(30);

    private static final UUID TIE_LARGER_ID = wish(31);

    /** A paused wish older than its active twin: deleted, so the active twin is kept. */
    private static final UUID PAUSED_OLDER_TWIN = wish(40);

    private static final UUID ACTIVE_NEWER_TWIN = wish(41);

    /** A paused wish with no twin: deleted, its selection is simply gone. */
    private static final UUID PAUSED_ALONE = wish(42);

    /** "Any Ghost Rare" of a card without one: kept as a plain "any printing" wish. */
    private static final UUID UNKNOWN_RARITY = wish(50);

    /** {@code ' Secret Rare '}: trimmed and kept; the exact twin after it collapses. */
    private static final UUID PADDED_RARITY = wish(51);

    private static final UUID EXACT_RARITY_NEWER = wish(52);

    /** A blank rarity: any printing; the lower-case rarity after it (unknown) collapses. */
    private static final UUID BLANK_RARITY = wish(53);

    private static final UUID LOWER_CASE_RARITY_NEWER = wish(54);

    /** A printing wish stored with another card (and its game): follows the printing. */
    private static final UUID WRONG_CARD = wish(60);

    /** The same printing with the right card, newer: equal after normalising, collapsed. */
    private static final UUID RIGHT_CARD_NEWER = wish(61);

    private static final UUID OUTBOX_OLD_SHAPE = publication(1);
    private static final UUID OUTBOX_REMOVED_CLASS = publication(2);
    private static final UUID OUTBOX_OTHER_EVENT = publication(3);
    private static final UUID OUTBOX_ALREADY_COMPLETED = publication(4);
    private static final Instant COMPLETED_AT = Instant.parse("2026-09-30T08:00:00Z");

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
        assertThat(wishesOf(OWNER))
                .containsExactly(ANY_OLDEST, ULTRA_WITH_RARITY, SECRET_NO_CARD, ANY_SECRET_RARITY);
        assertThat(wishesOf(OTHER)).containsExactly(OTHER_OWNER_ANY);
    }

    @Test
    void collapsesDuplicatesOfEveryDroppedColumnAndBreaksATieByTheSmallestId() {
        assertThat(wishesOf(FILTERS))
                .as(
                        "condition, edition, language, maximum price, currency, trade preference,"
                                + " private note and match date no longer tell wishes apart")
                .containsExactly(FILTERS_OLDEST);
        assertThat(wishesOf(TIE))
                .as("same created_at: the smallest id survives, deterministically")
                .containsExactly(TIE_SMALLER_ID);
    }

    @Test
    void deletesPausedWishesInsteadOfMakingThemPublic() {
        assertThat(wishesOf(PAUSED))
                .as(
                        "a paused wish goes (even as the oldest of two equal ones: its active twin"
                                + " is the one kept)")
                .containsExactly(ACTIVE_NEWER_TWIN);
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM wishlist_item WHERE id IN (?, ?)",
                                Integer.class,
                                PAUSED_OLDER_TWIN,
                                PAUSED_ALONE))
                .isZero();
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
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM pg_constraint WHERE conname ="
                                        + " 'ck_wishlist_item_target'",
                                Integer.class))
                .as("redundant once card_id is NOT NULL")
                .isZero();
    }

    @Test
    void clearsARarityTheCardLacksAndTrimsRarityStrings() {
        assertThat(wishesOf(RARITY))
                .containsExactly(UNKNOWN_RARITY, PADDED_RARITY, BLANK_RARITY)
                .doesNotContain(EXACT_RARITY_NEWER, LOWER_CASE_RARITY_NEWER);

        Map<String, Object> unknown = row(UNKNOWN_RARITY);
        assertThat(unknown.get("card_id")).isEqualTo(OTHER_CARD);
        assertThat(unknown.get("printing_id")).isNull();
        assertThat(unknown.get("rarity"))
                .as("no printing of the card is a Ghost Rare: any printing")
                .isNull();
        assertThat(row(PADDED_RARITY).get("rarity")).isEqualTo("Secret Rare");
        assertThat(row(BLANK_RARITY).get("rarity")).isNull();
    }

    @Test
    void aPrintingWishFollowsItsPrintingsCardAndGame() {
        assertThat(wishesOf(MISMATCH)).containsExactly(WRONG_CARD);

        Map<String, Object> wish =
                db.queryForMap(
                        "SELECT card_id, printing_id, game_slug FROM wishlist_item WHERE id = ?",
                        WRONG_CARD);
        assertThat(wish.get("printing_id")).isEqualTo(ULTRA);
        assertThat(wish.get("card_id")).isEqualTo(CARD);
        assertThat(wish.get("game_slug")).isEqualTo("yugioh");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM wishlist_item w JOIN card_printing p"
                                        + " ON p.id = w.printing_id WHERE w.card_id <> p.card_id",
                                Integer.class))
                .isZero();
    }

    @Test
    void neverCopiesPrivateNotesAndStartsTheNewFieldsEmpty() {
        List<Map<String, Object>> rows =
                db.queryForList(
                        "SELECT public_note, near_mint_only, price_term FROM wishlist_item");

        assertThat(rows)
                .hasSize(12)
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
                                "SELECT count(*) FROM notification_preferences"
                                        + " WHERE categories ? 'WISHLIST_MATCH'",
                                Integer.class))
                .isZero();
        assertThat(
                        db.queryForObject(
                                "SELECT value::text FROM platform_settings"
                                        + " WHERE key = 'wishlist.price_terms'",
                                String.class))
                .isEqualTo("\"80% TCG,85% TCG,90% TCG,100% TCG,100% TCG+\"");
        assertThat(
                        db.queryForList(
                                "SELECT event_type FROM analytics_daily_count ORDER BY event_type",
                                String.class))
                .as("the counts of the removed wishlist_matched event go, the others stay")
                .containsExactly("wishlist_item_created");
    }

    @Test
    void carriesAnAlertOptOutOverAndKeepsAlertsOnOtherwise() {
        assertThat(wishlistAlerts(FILTERS))
                .as("in-app and push off for the old category: alerts start off")
                .isFalse();
        assertThat(wishlistAlerts(TIE))
                .as("only email was on, and wishlist alerts are never emailed: off")
                .isFalse();
        assertThat(wishlistAlerts(OWNER)).as("push off, in-app on: alerts stay on").isTrue();
        assertThat(wishlistAlerts(PAUSED)).as("in-app off, push on: alerts stay on").isTrue();
        assertThat(wishlistAlerts(OTHER)).as("the category was never touched").isTrue();
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM notification_preferences WHERE user_id = ?",
                                Integer.class,
                                NO_PREFERENCES))
                .as("no row is invented for a collector on the defaults")
                .isZero();
    }

    @Test
    void completesIncompleteOutboxRowsOfTheRemovedAndReshapedEventsOnly() {
        for (UUID id : List.of(OUTBOX_OLD_SHAPE, OUTBOX_REMOVED_CLASS)) {
            Map<String, Object> publication = publicationRow(id);
            assertThat(publication.get("completion_date")).isNotNull();
            assertThat(publication.get("status")).isEqualTo("COMPLETED");
        }
        Map<String, Object> other = publicationRow(OUTBOX_OTHER_EVENT);
        assertThat(other.get("completion_date"))
                .as("another event's publication is still to be delivered")
                .isNull();
        assertThat(other.get("status")).isEqualTo("PUBLISHED");
        assertThat(publicationRow(OUTBOX_ALREADY_COMPLETED).get("completion_date"))
                .as("a completed row keeps its date")
                .isEqualTo(Timestamp.from(COMPLETED_AT));
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM event_publication"
                                        + " WHERE completion_date IS NULL",
                                Integer.class))
                .isOne();
    }

    private static List<UUID> wishesOf(UUID owner) {
        return db.queryForList(
                "SELECT id FROM wishlist_item WHERE owner_id = ? ORDER BY id", UUID.class, owner);
    }

    private static Map<String, Object> row(UUID id) {
        return db.queryForMap(
                "SELECT card_id, printing_id, rarity FROM wishlist_item WHERE id = ?", id);
    }

    private static @Nullable Boolean wishlistAlerts(UUID user) {
        return db.queryForObject(
                "SELECT wishlist_alerts FROM notification_preferences WHERE user_id = ?",
                Boolean.class,
                user);
    }

    private static Map<String, Object> publicationRow(UUID id) {
        return db.queryForMap(
                "SELECT completion_date, status FROM event_publication WHERE id = ?", id);
    }

    private static UUID user(int n) {
        return UUID.fromString(String.format("00000000-0000-4000-aa00-%012d", n));
    }

    private static UUID wish(int n) {
        return UUID.fromString(String.format("00000000-0000-4000-aa50-%012d", n));
    }

    private static UUID publication(int n) {
        return UUID.fromString(String.format("00000000-0000-4000-aa60-%012d", n));
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
        for (int n = 1; n <= 8; n++) {
            db.update(
                    "INSERT INTO user_account (id, provider_uid, handle) VALUES (?, ?, ?)",
                    user(n),
                    "v112check-" + n,
                    "v112check" + n);
        }
        db.update(
                "INSERT INTO card_set (id, game_id, code, name)"
                        + " SELECT '00000000-0000-4000-aa10-000000000001', id, 'V12',"
                        + " 'V112 Check Set' FROM game WHERE slug = 'yugioh'");
        db.update(
                "INSERT INTO card_set (id, game_id, code, name)"
                        + " SELECT '00000000-0000-4000-aa10-000000000002', id, 'V12P',"
                        + " 'V112 Check Pocket Set' FROM game WHERE slug = 'pokemon'");
        db.update(
                "INSERT INTO card (id, game_id, name, slug)"
                        + " SELECT ?, id, 'V112 Check Dragon', 'v112-check-dragon' FROM game"
                        + " WHERE slug = 'yugioh'",
                CARD);
        db.update(
                "INSERT INTO card (id, game_id, name, slug)"
                        + " SELECT ?, id, 'V112 Check Wyvern', 'v112-check-wyvern' FROM game"
                        + " WHERE slug = 'pokemon'",
                OTHER_CARD);
        db.update(
                "INSERT INTO card_printing"
                        + " (id, card_id, set_id, collector_number, rarity, printing_code) VALUES"
                        + " (?, ?, '00000000-0000-4000-aa10-000000000001', 'EN001', 'Ultra Rare',"
                        + " 'V12-EN001'),"
                        + " (?, ?, '00000000-0000-4000-aa10-000000000001', 'EN002', 'Secret Rare',"
                        + " 'V12-EN002'),"
                        + " ('00000000-0000-4000-aa30-000000000003', ?,"
                        + " '00000000-0000-4000-aa10-000000000002', '001', 'Common', 'V12P-001')",
                ULTRA,
                CARD,
                SECRET,
                CARD,
                OTHER_CARD);
        UUID listing = UUID.fromString("00000000-0000-4000-aa40-000000000001");
        db.update(
                "INSERT INTO inventory_item"
                        + " (id, owner_id, printing_id, condition, language, edition, finish)"
                        + " VALUES (?, ?, ?, 'NEAR_MINT', 'en', 'UNLIMITED', 'NORMAL')",
                listing,
                OTHER,
                ULTRA);

        new OldWish(OWNER, CARD, null, null)
                .notes("PRIVATE BUDGET NOTE")
                .maxPrice(60.00)
                .insert(ANY_OLDEST, 96);
        new OldWish(OWNER, CARD, null, null).notes("another private note").insert(ANY_NEWER, 72);
        new OldWish(OWNER, CARD, ULTRA, "Ultra Rare").insert(ULTRA_WITH_RARITY, 48);
        new OldWish(OWNER, CARD, ULTRA, null).insert(ULTRA_PLAIN, 24);
        new OldWish(OWNER, CARD, ULTRA, "Secret Rare").insert(ULTRA_OTHER_RARITY, 12);
        new OldWish(OWNER, null, SECRET, null).insert(SECRET_NO_CARD, 120);
        new OldWish(OWNER, CARD, SECRET, "Secret Rare").insert(SECRET_WITH_CARD, 6);
        new OldWish(OWNER, CARD, null, "Secret Rare").notes("x").insert(ANY_SECRET_RARITY, 3);
        new OldWish(OTHER, CARD, null, null).insert(OTHER_OWNER_ANY, 1);

        // The same selection nine times: the oldest, then one wish per dropped column that
        // differs from it in that column only.
        new OldWish(FILTERS, CARD, null, null).insert(FILTERS_OLDEST, 90);
        new OldWish(FILTERS, CARD, null, null).conditionMin("LIGHTLY_PLAYED").insert(wish(21), 80);
        new OldWish(FILTERS, CARD, null, null).edition("FIRST_EDITION").insert(wish(22), 70);
        new OldWish(FILTERS, CARD, null, null).language("fr").insert(wish(23), 60);
        new OldWish(FILTERS, CARD, null, null).maxPrice(12.50).insert(wish(24), 50);
        new OldWish(FILTERS, CARD, null, null).currency("USD").insert(wish(25), 40);
        new OldWish(FILTERS, CARD, null, null).tradePreference("TRADE").insert(wish(26), 30);
        new OldWish(FILTERS, CARD, null, null).notes("a private note").insert(wish(27), 20);
        new OldWish(FILTERS, CARD, null, null).matchedHoursAgo(5).insert(wish(28), 10);

        // The larger id first: neither the insertion order nor the date decides.
        new OldWish(TIE, CARD, null, null).insert(TIE_LARGER_ID, 30);
        new OldWish(TIE, CARD, null, null).insert(TIE_SMALLER_ID, 30);

        new OldWish(PAUSED, CARD, null, null).paused().insert(PAUSED_OLDER_TWIN, 50);
        new OldWish(PAUSED, CARD, null, null).insert(ACTIVE_NEWER_TWIN, 40);
        new OldWish(PAUSED, CARD, ULTRA, null).paused().insert(PAUSED_ALONE, 30);

        new OldWish(RARITY, OTHER_CARD, null, "Ghost Rare")
                .game("pokemon")
                .insert(UNKNOWN_RARITY, 60);
        new OldWish(RARITY, CARD, null, " Secret Rare ").insert(PADDED_RARITY, 50);
        new OldWish(RARITY, CARD, null, "Secret Rare").insert(EXACT_RARITY_NEWER, 40);
        new OldWish(RARITY, CARD, null, "  ").insert(BLANK_RARITY, 30);
        new OldWish(RARITY, CARD, null, "ultra rare").insert(LOWER_CASE_RARITY_NEWER, 20);

        new OldWish(MISMATCH, OTHER_CARD, ULTRA, null).game("pokemon").insert(WRONG_CARD, 20);
        new OldWish(MISMATCH, CARD, ULTRA, null).insert(RIGHT_CARD_NEWER, 10);

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

        String message = "\"MESSAGE\": {\"push\": true, \"email\": false, \"inApp\": true}";
        insertPreferences(OWNER, "{" + oldCategory(false, true, true) + ", " + message + "}");
        insertPreferences(OTHER, "{" + message + "}");
        insertPreferences(FILTERS, "{" + oldCategory(false, false, false) + "}");
        insertPreferences(TIE, "{" + oldCategory(false, true, false) + "}");
        insertPreferences(PAUSED, "{" + oldCategory(true, false, false) + ", " + message + "}");

        // Outbox rows a crash between commit and listener leaves behind (S1 shapes).
        String analytics =
                "com.orenjitrade.api.analytics.infra.AnalyticsEventListener.on("
                        + "com.orenjitrade.api.wishlist.events.";
        insertPublication(
                OUTBOX_OLD_SHAPE,
                analytics + "WishlistItemCreated)",
                "com.orenjitrade.api.wishlist.events.WishlistItemCreated",
                "{\"wishlistItemId\":\""
                        + ANY_OLDEST
                        + "\",\"ownerId\":\""
                        + OWNER
                        + "\",\"game\":\"yugioh\",\"target\":\"card\",\"hasMaxPrice\":true,"
                        + "\"tradePreference\":\"SALE\",\"occurredAt\":\"2026-10-01T10:00:00Z\"}",
                null);
        insertPublication(
                OUTBOX_REMOVED_CLASS,
                analytics + "WishlistMatched)",
                "com.orenjitrade.api.wishlist.events.WishlistMatched",
                "{\"matchId\":\"00000000-0000-4000-aa70-000000000001\",\"notified\":true}",
                null);
        insertPublication(
                OUTBOX_OTHER_EVENT,
                "com.orenjitrade.api.wishlist.infra.WishlistInventoryListener.on("
                        + "com.orenjitrade.api.inventory.events.InventoryItemPublished)",
                "com.orenjitrade.api.inventory.events.InventoryItemPublished",
                "{\"itemId\":\"" + listing + "\"}",
                null);
        insertPublication(
                OUTBOX_ALREADY_COMPLETED,
                analytics + "WishlistItemCreated)",
                "com.orenjitrade.api.wishlist.events.WishlistItemCreated",
                "{\"wishlistItemId\":\"" + ANY_NEWER + "\"}",
                COMPLETED_AT);

        db.update(
                "INSERT INTO analytics_daily_count (day, event_type, count) VALUES"
                        + " ('2026-10-01', 'wishlist_matched', 2),"
                        + " ('2026-10-02', 'wishlist_matched', 1),"
                        + " ('2026-10-01', 'wishlist_item_created', 3)");
    }

    /** The old WISHLIST_MATCH category of the channel matrix. */
    private static String oldCategory(boolean push, boolean email, boolean inApp) {
        return "\"WISHLIST_MATCH\": {\"push\": "
                + push
                + ", \"email\": "
                + email
                + ", \"inApp\": "
                + inApp
                + "}";
    }

    private static void insertPreferences(UUID user, String categories) {
        db.update(
                "INSERT INTO notification_preferences (user_id, categories) VALUES (?, ?::jsonb)",
                user,
                categories);
    }

    private static void insertPublication(
            UUID id,
            String listener,
            String eventType,
            String serializedEvent,
            @Nullable Instant completedAt) {
        db.update(
                "INSERT INTO event_publication (id, listener_id, event_type, serialized_event,"
                        + " publication_date, completion_date, status, completion_attempts)"
                        + " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id,
                listener,
                eventType,
                serializedEvent,
                Timestamp.from(BASE),
                completedAt == null ? null : Timestamp.from(completedAt),
                completedAt == null ? "PUBLISHED" : "COMPLETED",
                completedAt == null ? 0 : 1);
    }

    /**
     * One S1-model wish: its selection and the removed columns with the old form's usual values,
     * each of which a test row changes on its own.
     */
    private static final class OldWish {

        private final UUID owner;
        private final @Nullable UUID card;
        private final @Nullable UUID printing;
        private final @Nullable String rarity;
        private String game = "yugioh";
        private @Nullable String conditionMin = "NEAR_MINT";
        private @Nullable String edition;
        private @Nullable String language = "en";
        private @Nullable Double maxPrice;
        private String currency = "CAD";
        private String tradePreference = "SALE";
        private String notes = "";
        private boolean active = true;
        private @Nullable Integer matchedHoursAgo;

        OldWish(UUID owner, @Nullable UUID card, @Nullable UUID printing, @Nullable String rarity) {
            this.owner = owner;
            this.card = card;
            this.printing = printing;
            this.rarity = rarity;
        }

        OldWish game(String value) {
            this.game = value;
            return this;
        }

        OldWish conditionMin(String value) {
            this.conditionMin = value;
            return this;
        }

        OldWish edition(String value) {
            this.edition = value;
            return this;
        }

        OldWish language(String value) {
            this.language = value;
            return this;
        }

        OldWish maxPrice(double value) {
            this.maxPrice = value;
            return this;
        }

        OldWish currency(String value) {
            this.currency = value;
            return this;
        }

        OldWish tradePreference(String value) {
            this.tradePreference = value;
            return this;
        }

        OldWish notes(String value) {
            this.notes = value;
            return this;
        }

        OldWish paused() {
            this.active = false;
            return this;
        }

        OldWish matchedHoursAgo(int hours) {
            this.matchedHoursAgo = hours;
            return this;
        }

        /** Inserts the wish as created {@code hoursBefore} hours before {@link #BASE}. */
        void insert(UUID id, int hoursBefore) {
            db.update(
                    "INSERT INTO wishlist_item (id, owner_id, game_slug, card_id, printing_id,"
                            + " rarity, condition_min, edition, language, max_price, currency,"
                            + " trade_preference, notes, active, created_at, last_matched_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    id,
                    owner,
                    game,
                    card,
                    printing,
                    rarity,
                    conditionMin,
                    edition,
                    language,
                    maxPrice,
                    currency,
                    tradePreference,
                    notes,
                    active,
                    Timestamp.from(BASE.minus(Duration.ofHours(hoursBefore))),
                    matchedHoursAgo == null
                            ? null
                            : Timestamp.from(BASE.minus(Duration.ofHours(matchedHoursAgo))));
        }
    }
}
