package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.common.seed.SeedDataRunner;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.users.infra.SeedAccounts;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * {@code orenji.seed.enabled=true}: the runner executes at startup and is idempotent. Separate
 * context because the property differs from the shared test profile; the database is shared, so the
 * other suites tolerate the 12 seed accounts.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
class SeedDataRunnerIT extends AbstractIntegrationTest {

    @Autowired private SeedDataRunner seedDataRunner;

    @Autowired private SeedAccounts seedAccounts;

    @Autowired private NoopIdentityAdminClient identityAdminClient;

    @Autowired private RecordedDomainEvents events;

    @Test
    void seedsInventoryPerTheSeedPlanWithoutPublicationEvents() {
        int binders =
                testUsers.count(
                        "SELECT count(*) FROM binder WHERE id::text LIKE"
                                + " '00000000-0000-4000-8b00-%'");
        int items =
                testUsers.count(
                        "SELECT count(*) FROM inventory_item WHERE id::text LIKE"
                                + " '00000000-0000-4000-8c00-%'");
        // Stage R3 added collector2's deck core "Moth Queen core" and its three cards; stage G
        // split the five binders that mixed games into one binder per game (18); stage R7 added
        // Home's feed: collector5's deck core "Monarch core" (3 cards), 13 public unfiled cards
        // of collector5 and 3 of collector2 (19 binders, 61 cards).
        assertThat(binders).isEqualTo(19);
        assertThat(items).isEqualTo(61);
        seedDataRunner.seedAll();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM binder WHERE id::text LIKE"
                                        + " '00000000-0000-4000-8b00-%'"))
                .isEqualTo(binders);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id::text LIKE"
                                        + " '00000000-0000-4000-8c00-%'"))
                .isEqualTo(items);

        Map<String, Object> fresh = binderRow("00000000-0000-4000-8b00-000000000101");
        assertThat(fresh.get("visibility")).isEqualTo("PUBLIC");
        assertThat(fresh.get("freshness_state")).isEqualTo("ACTIVE");
        assertThat(fresh.get("item_count")).isEqualTo(5);
        assertThat(fresh.get("publicly_listed")).isEqualTo(true);
        assertThat(binderRow("00000000-0000-4000-8b00-000000000103").get("visibility"))
                .isEqualTo("PRIVATE");
        Map<String, Object> stale = binderRow("00000000-0000-4000-8b00-000000000301");
        assertThat(stale.get("freshness_state")).isEqualTo("STALE");
        assertThat(stale.get("publicly_listed")).isEqualTo(true);
        Map<String, Object> hidden = binderRow("00000000-0000-4000-8b00-000000000601");
        assertThat(hidden.get("freshness_state")).isEqualTo("HIDDEN");
        assertThat(hidden.get("publicly_listed")).isEqualTo(false);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE binder_id ="
                                        + " '00000000-0000-4000-8b00-000000000601' AND"
                                        + " freshness_state = 'HIDDEN' AND hidden_reason ="
                                        + " 'STALE_UNCONFIRMED'"))
                .isEqualTo(2);
        // Stage G: every seeded binder holds the cards of its own game only.
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item i JOIN binder b ON b.id ="
                                        + " i.binder_id JOIN card_printing p ON p.id ="
                                        + " i.printing_id JOIN card c ON c.id = p.card_id WHERE"
                                        + " b.id::text LIKE '00000000-0000-4000-8b00-%' AND"
                                        + " c.game_id <> b.game_id"))
                .isZero();
        Map<String, Object> core = binderRow("00000000-0000-4000-8b00-000000000202");
        assertThat(core.get("sells_as_core")).isEqualTo(true);
        assertThat(core.get("asking_price_text")).isEqualTo("$95");
        assertThat(core.get("asking_price")).isEqualTo(new java.math.BigDecimal("95.00"));
        assertThat(core.get("publicly_listed")).isEqualTo(true);
        assertThat(core.get("item_count")).isEqualTo(3);
        Map<String, Object> temporary = binderRow("00000000-0000-4000-8b00-000000000401");
        assertThat(temporary.get("visibility")).isEqualTo("TEMPORARILY_PUBLIC");
        assertThat(temporary.get("public_until")).isNotNull();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id ="
                                        + " '00000000-0000-4000-8000-000000000007' AND"
                                        + " publicly_listed"))
                .as("collector7 is private only")
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id::text LIKE"
                                        + " '00000000-0000-4000-8c00-%' AND currency <> 'CAD'"))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id::text LIKE"
                                        + " '00000000-0000-4000-8c00-%' AND accepts_offers AND"
                                        + " publicly_listed"))
                .isGreaterThanOrEqualTo(5);
        assertThat(
                        events.of(
                                InventoryItemPublished.class,
                                event ->
                                        event.itemId()
                                                .toString()
                                                .startsWith("00000000-0000-4000-8c00-")))
                .as("seed data is not announced as newly published")
                .isEmpty();
    }

    @Test
    void seedsCollector2sWishlistWithAnAlertAndAFewNotifications() {
        UUID collector2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
        String azureWish = "00000000-0000-4000-8f00-000000000201";
        String azureItem = "00000000-0000-4000-8c00-000000010101";
        String wishes =
                "SELECT count(*) FROM wishlist_item WHERE id::text LIKE"
                        + " '00000000-0000-4000-8f00-%'";
        String seededNotifications =
                "SELECT count(*) FROM notification WHERE id::text LIKE"
                        + " '00000000-0000-4000-9a00-%'";
        // collector2's three, and collector5's two of stage R7 (Home's feed).
        assertThat(testUsers.count(wishes)).isEqualTo(5);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_item WHERE owner_id = ? AND"
                                        + " (public_note <> '' OR price_term IS NOT NULL)",
                                collector2))
                .as("two seeded wishes carry a public note and a price term, one neither")
                .isEqualTo(2);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_item WHERE id = ?::uuid AND"
                                        + " near_mint_only AND price_term = '90% TCG'",
                                azureWish))
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_alert_sent WHERE user_id = ? AND"
                                        + " inventory_item_id = ?::uuid",
                                collector2,
                                azureItem))
                .as("collector1's public Azure-Eyes alerted collector2")
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ? AND type ="
                                        + " 'WISHLIST_ALERT' AND dedup_key = ? AND data ->>"
                                        + " 'wishlistItemId' = ?",
                                collector2,
                                "wishlist-alert:" + collector2 + ":" + azureItem,
                                azureWish))
                .isEqualTo(1);
        assertThat(testUsers.count(seededNotifications)).isEqualTo(4);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM privacy_settings WHERE user_id = ? AND"
                                        + " wishlist_visible",
                                collector2))
                .isEqualTo(1);
        String collector2Alerts = "SELECT count(*) FROM wishlist_alert_sent WHERE user_id = ?";
        int alerts = testUsers.count(collector2Alerts, collector2);
        int notifications =
                testUsers.count("SELECT count(*) FROM notification WHERE user_id = ?", collector2);

        seedDataRunner.seedAll();

        assertThat(testUsers.count(wishes)).isEqualTo(5);
        assertThat(testUsers.count(seededNotifications)).isEqualTo(4);
        assertThat(testUsers.count(collector2Alerts, collector2)).isEqualTo(alerts);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ?", collector2))
                .as("seeding again notifies nobody")
                .isEqualTo(notifications);
    }

    /**
     * A database seeded before stage S2 and then migrated (the owner's own dev database): the three
     * stable-id wishes exist with V112's defaults and collector2 was never alerted about
     * collector1's listing. The seed gives the untouched wishes their S2 values and runs the sample
     * alert until collector2 has been alerted, once; a wish the collector edited is left alone.
     *
     * <p>The notification itself is not deleted here: this database is shared with every other
     * suite, whose listings use up collector2's daily alert limit, so a second notification could
     * not be relied on (the first one, sent at start-up, is asserted above). What the seed owns is
     * asked instead: the alert step runs again while the sent-alert key is missing, and the stored
     * notification stays the only one (its dedup key).
     */
    /**
     * Home's feed (stage R7) as collector1 reads it, Yu-Gi-Oh! in Americas (North): the seed's
     * posts of collector2 and collector5 today, this week and this month, every kind, groups of 12
     * and 3 cards and a single card, two deck cores (one "Trade only"), three wishes; collector2
     * sees collector1's five cards of the month. The times are relative to now and written again at
     * every start, so the feed looks the same a month later.
     */
    @Test
    void seedsHomesFeedRelativeToNow() {
        String collector1 = "seed-collector1:collector1@orenjitrade.test";
        String collector2 = "seed-collector2:collector2@orenjitrade.test";
        java.util.List<JsonNode> posts = seedPosts(collector1);
        assertThat(
                        posts.stream()
                                .map(
                                        post ->
                                                post.path("kind").asString()
                                                        + " "
                                                        + post.path("collector")
                                                                .path("handle")
                                                                .asString())
                                .toList())
                .containsExactly(
                        "NEW_CARDS collector5",
                        "WANTED collector2",
                        "DECK_CORE collector2",
                        "NEW_CARDS collector5",
                        "WANTED collector5",
                        "NEW_CARDS collector2",
                        "DECK_CORE collector5",
                        "WANTED collector5");
        JsonNode twelve = posts.get(0).path("newCards");
        assertThat(twelve.path("total").asLong()).isEqualTo(12);
        assertThat(twelve.path("previews")).hasSize(4);
        assertThat(twelve.path("previews").get(0).path("name").asString())
                .isEqualTo("Monarch's Tempest Decree");
        assertThat(twelve.path("previews").get(0).path("askingPriceText").asString())
                .isEqualTo("$11.50");
        assertThat(twelve.path("previews").get(1).path("askingPriceText").asString())
                .isEqualTo("90% TCG");
        assertThat(posts.get(2).path("deckCore").path("askingPriceText").asString())
                .isEqualTo("$95");
        assertThat(posts.get(3).path("newCards").path("total").asLong()).isEqualTo(1);
        assertThat(posts.get(5).path("newCards").path("total").asLong()).isEqualTo(3);
        assertThat(posts.get(6).path("deckCore").path("askingPriceText").asString())
                .isEqualTo("Trade only");
        assertThat(posts.get(6).path("deckCore").path("noteFirstLine").asString())
                .isEqualTo("Looking for Moth Queen pieces in trade. All NM, in sleeves.");
        java.time.Instant now = java.time.Instant.now();
        assertAgo(posts.get(0), now, java.time.Duration.ofMinutes(5));
        assertAgo(posts.get(1), now, java.time.Duration.ofHours(1));
        assertAgo(posts.get(2), now, java.time.Duration.ofHours(3));
        assertAgo(posts.get(3), now, java.time.Duration.ofHours(6));
        assertAgo(posts.get(4), now, java.time.Duration.ofDays(2));
        assertAgo(posts.get(5), now, java.time.Duration.ofDays(3));
        assertAgo(posts.get(6), now, java.time.Duration.ofDays(4));
        assertAgo(posts.get(7), now, java.time.Duration.ofDays(12));

        // collector2 sees collector1's Yu-Gi-Oh! binder, listed this month (five cards).
        java.util.List<JsonNode> seenByCollector2 = seedPosts(collector2);
        JsonNode fromCollector1 =
                seenByCollector2.stream()
                        .filter(
                                post ->
                                        post.path("collector")
                                                .path("handle")
                                                .asString()
                                                .equals("collector1"))
                        .findFirst()
                        .orElseThrow();
        assertThat(fromCollector1.path("newCards").path("total").asLong()).isEqualTo(5);
        assertAgo(fromCollector1, now, java.time.Duration.ofDays(9));

        // Dated again at every start: an old listing time comes back to "5 minutes ago".
        testUsers.update(
                "UPDATE inventory_item SET listing_changed_at = now() - interval '40 days' WHERE"
                        + " id::text LIKE '00000000-0000-4000-8c00-0000000500%'");
        seedDataRunner.seedAll();
        assertAgo(
                seedPosts(collector1).get(0),
                java.time.Instant.now(),
                java.time.Duration.ofMinutes(5));
    }

    /**
     * The seed collectors' posts of the Yu-Gi-Oh! feed of Americas (North), as {@code uid}, page by
     * page to the end (the suite's other tests add posts of their own, some dated ahead).
     */
    private java.util.List<JsonNode> seedPosts(String uid) {
        java.util.List<JsonNode> posts = new java.util.ArrayList<>();
        String cursor = null;
        for (int page = 0; page < 100; page++) {
            String path = "/api/v1/feed?region=americas-north&game=yugioh&limit=50";
            if (cursor != null) {
                path += "&cursor=" + cursor;
            }
            JsonNode body = callJson(HttpMethod.GET, path, uid, null, 200);
            body.path("items")
                    .forEach(
                            post -> {
                                if (post.path("collector")
                                        .path("id")
                                        .asString()
                                        .startsWith("00000000-0000-4000-8000-0000000000")) {
                                    posts.add(post);
                                }
                            });
            if (body.path("nextCursor").isNull()) {
                return posts;
            }
            cursor = body.path("nextCursor").asString();
        }
        throw new AssertionError("the feed never ended");
    }

    private static void assertAgo(JsonNode post, java.time.Instant now, java.time.Duration ago) {
        java.time.Instant at = java.time.Instant.parse(post.path("at").asString());
        assertThat(java.time.Duration.between(at, now).minus(ago).abs())
                .as("%s became public about %s ago", post.path("id").asString(), ago)
                .isLessThan(java.time.Duration.ofMinutes(10));
    }

    @Test
    void anUpgradedDatabaseGetsTheSeedWishValuesAndTheSampleAlertOnce() {
        UUID collector2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
        String azureWish = "00000000-0000-4000-8f00-000000000201";
        String promoWish = "00000000-0000-4000-8f00-000000000202";
        String magicWish = "00000000-0000-4000-8f00-000000000203";
        String azureItem = "00000000-0000-4000-8c00-000000010101";
        String alertKey = "wishlist-alert:" + collector2 + ":" + azureItem;
        String sentAlerts =
                "SELECT count(*) FROM wishlist_alert_sent WHERE user_id = ? AND"
                        + " inventory_item_id = ?::uuid";
        String alertNotifications =
                "SELECT count(*) FROM notification WHERE user_id = ? AND type = 'WISHLIST_ALERT'"
                        + " AND dedup_key = ?";
        String allNotifications = "SELECT count(*) FROM notification WHERE user_id = ?";
        // What V112 leaves of wishes seeded under the old model, and no alert decided yet.
        testUsers.update(
                "UPDATE wishlist_item SET public_note = '', near_mint_only = false,"
                        + " price_term = NULL, updated_at = created_at"
                        + " WHERE id::text LIKE '00000000-0000-4000-8f00-%'");
        testUsers.update(
                "DELETE FROM wishlist_alert_sent WHERE user_id = ? AND inventory_item_id ="
                        + " ?::uuid",
                collector2,
                azureItem);
        int notifications = testUsers.count(allNotifications, collector2);

        seedDataRunner.seedAll();

        assertThat(wishRow(azureWish))
                .containsEntry("public_note", "Looking for a clean copy for my Azure-Eyes deck.")
                .containsEntry("near_mint_only", true)
                .containsEntry("price_term", "90% TCG");
        assertThat(wishRow(promoWish))
                .as("this seed wish has no note, flag or term")
                .containsEntry("public_note", "")
                .containsEntry("near_mint_only", false)
                .containsEntry("price_term", null);
        assertThat(wishRow(magicWish))
                .containsEntry("public_note", "Any printing is fine.")
                .containsEntry("near_mint_only", false)
                .containsEntry("price_term", "100% TCG+");
        assertThat(testUsers.count(sentAlerts, collector2, azureItem))
                .as("the alert step ran again: the Near Mint wish fits collector1's listing")
                .isEqualTo(1);
        assertThat(testUsers.count(alertNotifications, collector2, alertKey)).isEqualTo(1);
        assertThat(testUsers.count(allNotifications, collector2)).isEqualTo(notifications);

        // A wish the collector emptied on purpose (edited: updated_at moved) stays as it is.
        testUsers.update(
                "UPDATE wishlist_item SET public_note = '', price_term = NULL,"
                        + " updated_at = created_at + interval '1 hour' WHERE id = ?::uuid",
                magicWish);

        seedDataRunner.seedAll();

        assertThat(wishRow(magicWish))
                .containsEntry("public_note", "")
                .containsEntry("price_term", null);
        assertThat(wishRow(azureWish)).containsEntry("price_term", "90% TCG");
        assertThat(testUsers.count(sentAlerts, collector2, azureItem)).isEqualTo(1);
        assertThat(testUsers.count(allNotifications, collector2))
                .as("seeding again notifies nobody")
                .isEqualTo(notifications);

        // Back to the seed state for the other tests of this class.
        testUsers.update(
                "UPDATE wishlist_item SET updated_at = created_at WHERE id = ?::uuid", magicWish);
        seedDataRunner.seedAll();
        assertThat(wishRow(magicWish)).containsEntry("price_term", "100% TCG+");
    }

    /**
     * A database seeded before stage F1 ("free for all", ADR 0019) and migrated since (the owner's
     * own dev database): the former Premium account's bio still says "Premium member." on its
     * public profile. One seed run gives it today's seed bio; a bio the collector wrote is left
     * alone, even when it mentions Premium.
     */
    @Test
    void anUpgradedDatabaseLosesTheOldPremiumMemberBio() {
        UUID formerPremium = UUID.fromString("00000000-0000-4000-8000-000000000009");
        String seedBio = "Collector and trader across all four games.";
        assertThat(bioOf(formerPremium)).as("a fresh seed").isEqualTo(seedBio);
        // What the seed of stage S6 and earlier wrote (db/seed/profiles.json before F1).
        testUsers.update(
                "UPDATE profile SET bio = ? WHERE user_id = ?",
                "Collector and trader across all four games. Premium member.",
                formerPremium);

        seedDataRunner.seedAll();

        assertThat(bioOf(formerPremium)).isEqualTo(seedBio);
        JsonNode profile =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/premium_user",
                        "seed-collector1:collector1@orenjitrade.test",
                        null,
                        200);
        assertThat(profile.path("bio").asString()).isEqualTo(seedBio);
        assertThat(profile.toString()).doesNotContain("Premium");

        String own = "Trading binders since 2019. Premium member.";
        testUsers.update("UPDATE profile SET bio = ? WHERE user_id = ?", own, formerPremium);
        seedDataRunner.seedAll();
        assertThat(bioOf(formerPremium)).as("the collector's own words").isEqualTo(own);

        // Back to the seed state for the other tests of this class.
        testUsers.update("UPDATE profile SET bio = ? WHERE user_id = ?", seedBio, formerPremium);
    }

    private String bioOf(UUID userId) {
        return (String)
                testUsers
                        .query("SELECT bio FROM profile WHERE user_id = ?", userId)
                        .get(0)
                        .get("bio");
    }

    private Map<String, Object> wishRow(String id) {
        return testUsers
                .query(
                        "SELECT public_note, near_mint_only, price_term FROM wishlist_item"
                                + " WHERE id = ?",
                        UUID.fromString(id))
                .get(0);
    }

    private Map<String, Object> binderRow(String id) {
        return testUsers
                .query(
                        "SELECT visibility, public_until, freshness_state, item_count,"
                                + " publicly_listed, sells_as_core, asking_price_text,"
                                + " asking_price FROM binder WHERE id = ?",
                        UUID.fromString(id))
                .get(0);
    }

    @Test
    void seedsRatingsAReferenceAndAnOpenReport() {
        UUID collector1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
        UUID collector2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
        UUID collector6 = UUID.fromString("00000000-0000-4000-8000-000000000006");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9b00-%'"))
                .isEqualTo(3);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM rating WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9b00-%'"))
                .isEqualTo(3);
        Map<String, Object> summary =
                testUsers
                        .query(
                                "SELECT average, count FROM rating_summary WHERE user_id = ?",
                                collector1)
                        .get(0);
        assertThat(summary.get("count")).isEqualTo(2);
        assertThat(summary.get("average").toString()).isEqualTo("4.50");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM rating_summary WHERE user_id = ? AND count ="
                                        + " 1",
                                collector2))
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM reference WHERE subject_id = ?", collector1))
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM collector_report WHERE reported_user_id = ?"
                                        + " AND status = 'OPEN' AND reason = 'SPAM'",
                                collector6))
                .isEqualTo(1);
        // The seeded conversation is qualified but unrated: collector1 can still rate it.
        JsonNode eligibility =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + collector2,
                        "seed-collector1:collector1@orenjitrade.test",
                        null,
                        200);
        assertThat(eligibility.path("eligible").asBoolean()).isTrue();
        seedDataRunner.seedAll();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM rating WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9b00-%'"))
                .as("idempotent")
                .isEqualTo(3);
    }

    @Test
    void seedsOffersAndTradesOnTheReservedIds() {
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM offer WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9c00-%'"))
                .isEqualTo(7);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM trade WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9d00-%' AND status = 'COMPLETED'"))
                .isEqualTo(2);
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status FROM offer WHERE id ="
                                                + " '00000000-0000-4000-9c00-000000000003'")
                                .get(0)
                                .get("status"))
                .isEqualTo("OPEN");
        Map<String, Object> counter =
                testUsers
                        .query(
                                "SELECT status, current_turn, parent_offer_id::text AS parent FROM"
                                    + " offer WHERE id = '00000000-0000-4000-9c00-000000000005'")
                        .get(0);
        assertThat(counter.get("status")).isEqualTo("COUNTERED");
        assertThat(counter.get("current_turn")).isEqualTo("BUYER");
        assertThat(counter.get("parent")).isEqualTo("00000000-0000-4000-9c00-000000000004");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE kind = 'TRADE' AND"
                                        + " subject_id IN ('00000000-0000-4000-9d00-000000000001',"
                                        + " '00000000-0000-4000-9d00-000000000002')"))
                .as("both completed trades made their parties eligible")
                .isEqualTo(2);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE kind = 'OFFER_ACCEPTED'"
                                        + " AND subject_id IN"
                                        + " ('00000000-0000-4000-9c00-000000000001',"
                                        + " '00000000-0000-4000-9c00-000000000002')"))
                .isEqualTo(2);
        JsonNode inbox =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/offers?role=seller&status=OPEN",
                        "seed-collector1:collector1@orenjitrade.test",
                        null,
                        200);
        assertThat(inbox.path("items").get(0).path("id").asString())
                .isEqualTo("00000000-0000-4000-9c00-000000000003");
        int events = testUsers.count("SELECT count(*) FROM offer_event");
        seedDataRunner.seedAll();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM offer WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9c00-%'"))
                .as("idempotent")
                .isEqualTo(7);
        assertThat(testUsers.count("SELECT count(*) FROM offer_event")).isEqualTo(events);
    }

    @Test
    void seedsProtectedTradesWithPaymentsShipmentsAndADispute() {
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM trade WHERE id IN"
                                        + " ('00000000-0000-4000-9d00-000000000003',"
                                        + " '00000000-0000-4000-9d00-000000000004') AND"
                                        + " protection_enabled"))
                .isEqualTo(2);
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status FROM trade WHERE id ="
                                                + " '00000000-0000-4000-9d00-000000000004'")
                                .get(0)
                                .get("status"))
                .isEqualTo("DISPUTED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM payment WHERE id::text LIKE"
                                        + " '00000000-0000-4000-9f00-%' AND status = 'SECURED'"))
                .isEqualTo(2);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM seller_account WHERE status = 'ACTIVE' AND"
                                        + " provider = 'fake' AND user_id IN"
                                        + " ('00000000-0000-4000-8000-000000000001',"
                                        + " '00000000-0000-4000-8000-000000000002')"))
                .isEqualTo(2);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM shipment WHERE trade_id::text LIKE"
                                        + " '00000000-0000-4000-9d00-%'"))
                .isEqualTo(2);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM dispute WHERE id ="
                                        + " '00000000-0000-4000-9f00-000000000101' AND status ="
                                        + " 'OPEN'"))
                .isEqualTo(1);
        int events = testUsers.count("SELECT count(*) FROM payment_event");
        seedDataRunner.seedAll();
        assertThat(testUsers.count("SELECT count(*) FROM payment_event"))
                .as("idempotent")
                .isEqualTo(events);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM dispute_message WHERE dispute_id ="
                                        + " '00000000-0000-4000-9f00-000000000101'"))
                .isEqualTo(2);
    }

    @Test
    void createsTwelveAccountsAndIsIdempotent() {
        assertThat(seedAccounts.all()).hasSize(12);
        assertThat(testUsers.countSeedAccounts()).isEqualTo(12);

        seedDataRunner.seedAll();

        assertThat(testUsers.countSeedAccounts()).isEqualTo(12);
        assertThat(seedDataRunner.contributors())
                .extracting(contributor -> contributor.name())
                .containsExactly(
                        "user accounts",
                        "auth emulator users",
                        "profiles",
                        "locations",
                        "catalog",
                        "inventory",
                        "real-catalog-demo",
                        "conversations",
                        "community",
                        "wishlist",
                        "notifications",
                        "ratings",
                        "reports",
                        "offers",
                        "trades",
                        "payments");
        // The catalog seed imported the four fictional mock catalogs (idempotently).
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM card WHERE external_ref ->> 'provider' ="
                                        + " 'mock'"))
                .isEqualTo(80);

        UUID adminId = UUID.fromString("00000000-0000-4000-8000-000000000011");
        Map<String, Object> admin = testUsers.row(adminId);
        assertThat(admin.get("provider_uid")).isEqualTo("seed-admin");
        assertThat(admin.get("email")).isEqualTo("admin@orenjitrade.test");
        assertThat(admin.get("handle")).isEqualTo("admin");
        assertThat(admin.get("display_name")).isEqualTo("Alex Morin");
        assertThat(testUsers.rolesOf(adminId)).containsExactly("ADMIN", "USER");
        assertThat(testUsers.consentsOf(adminId)).hasSize(4);

        // premium_user keeps its handle and sign-in; since stage F1 it is an ordinary collector.
        UUID premiumId = UUID.fromString("00000000-0000-4000-8000-000000000009");
        Map<String, Object> premium = testUsers.row(premiumId);
        assertThat(premium).doesNotContainKey("plan_code");
        assertThat(premium.get("provider_uid")).isEqualTo("seed-premium-user");
        assertThat(testUsers.rolesOf(premiumId)).containsExactly("USER");

        UUID superAdminId = UUID.fromString("00000000-0000-4000-8000-000000000012");
        assertThat(testUsers.rolesOf(superAdminId)).containsExactly("SUPER_ADMIN", "USER");
        UUID moderatorId = UUID.fromString("00000000-0000-4000-8000-000000000010");
        assertThat(testUsers.rolesOf(moderatorId)).containsExactly("MODERATOR", "USER");

        // No emulator configured under the test profile: no identity-provider users created.
        assertThat(identityAdminClient.createdUids()).isEmpty();

        // The seeded identity signs in straight away (consents already given).
        http.get()
                .uri("/api/v1/me/ping")
                .header(HttpHeaders.AUTHORIZATION, "Bearer test-token:seed-collector1")
                .exchange()
                .expectStatus()
                .isOk();
        assertThat(me("seed-collector1").path("handle").asString()).isEqualTo("collector1");
        assertThat(me("seed-collector1").has("plan")).isFalse();
    }
}
