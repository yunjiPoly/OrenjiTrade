package com.orenjitrade.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
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
 * V120 to V123 (stage F1 "free for all": ads, donations, credits and Premium removed, the usage
 * limits the same for everyone) on a database that holds data of every removed feature, shaped like
 * the local seeds: Flyway builds a scratch database up to V119, fictional subscriptions, billing
 * webhooks, entitlements, a credit ledger with referrals, ad campaigns with impressions, clicks and
 * conversions, donations, a PREMIUM account with its role, usage limits with an admin edit, usage
 * counters (one of saved_searches.max), old notifications and promotional broadcasts, outbox rows,
 * job runs and audit rows are inserted, then the rest of the migrations run. A database migrated
 * from scratch is covered by {@link FlywayMigrationIT}.
 *
 * <p>The scratch database lives in the shared Testcontainers PostGIS server (never a developer
 * database) and is dropped afterwards. No Spring context is needed.
 */
class PaidFeaturesRemovalMigrationIT {

    private static final String DATABASE = "v123_populated_check";

    private static final UUID FREE_USER = user(1);
    private static final UUID PREMIUM_USER = user(2);
    private static final UUID ADMIN = user(3);
    private static final UUID REFEREE = user(4);

    private static final UUID SUBSCRIPTION = id("ab10", 1);
    private static final UUID ADVERTISER = id("ab20", 1);
    private static final UUID CAMPAIGN = id("ab20", 2);
    private static final UUID CREATIVE = id("ab20", 3);
    private static final UUID DONATION = id("ab30", 1);

    private static final UUID PREMIUM_NOTICE = id("ab40", 1);
    private static final UUID PLAIN_NOTICE = id("ab40", 2);
    private static final UUID SUPPORT_BROADCAST = id("ab40", 3);
    private static final UUID WISHLIST_BROADCAST = id("ab40", 4);
    private static final UUID CHECKOUT_BROADCAST = id("ab40", 5);
    private static final UUID PREMIUM_BROADCAST = id("ab40", 6);
    private static final UUID CREDITS_BROADCAST = id("ab40", 7);
    private static final UUID LOOKALIKE_BROADCAST = id("ab40", 8);
    private static final UUID OTHER_LINKED_NOTICE = id("ab40", 9);

    private static final UUID BILLING_WEBHOOK_PUBLICATION = id("ab50", 1);
    private static final UUID SUBSCRIPTION_PUBLICATION = id("ab50", 2);
    private static final UUID DONATION_PUBLICATION = id("ab50", 3);
    private static final UUID OTHER_PUBLICATION = id("ab50", 4);

    private static final List<String> REMOVED_RELATIONS =
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
                    "donation_webhook_event");

    private static @Nullable JdbcTemplate admin;
    private static JdbcTemplate db;

    @BeforeAll
    static void migrateAPopulatedDatabase() {
        admin = new JdbcTemplate(dataSource("postgres"));
        admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        admin.execute("CREATE DATABASE " + DATABASE);
        DataSource scratch = dataSource(DATABASE);
        db = new JdbcTemplate(scratch);

        // Every migration before V120 (R1's V115-V119 included once merged; "?" does not fail
        // while they do not exist on this branch).
        migrate(scratch, "119?");
        insertPaidFeatureData();
        migrate(scratch, null);
    }

    @AfterAll
    static void dropScratchDatabase() {
        if (admin != null) {
            admin.execute("DROP DATABASE IF EXISTS " + DATABASE + " WITH (FORCE)");
        }
    }

    @Test
    void everyTableViewAndFunctionOfThePaidFeaturesIsGone() {
        for (String relation : REMOVED_RELATIONS) {
            assertThat(db.queryForObject("SELECT to_regclass(?) IS NULL", Boolean.class, relation))
                    .as(relation)
                    .isTrue();
        }
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM pg_proc WHERE proname ="
                                        + " 'credit_ledger_entry_append_only'",
                                Integer.class))
                .isZero();
        assertThat(columnsOf("user_account")).doesNotContain("plan_code");
        assertThat(columnsOf("usage_limit")).doesNotContain("plan_id");
    }

    @Test
    void theUsageLimitsKeepTheFreeNumbersAndAdminEditsOneRowPerKey() {
        Map<String, @Nullable Integer> limits = new LinkedHashMap<>();
        db.query(
                "SELECT limit_key, max_value FROM usage_limit ORDER BY limit_key",
                rs -> {
                    int max = rs.getInt("max_value");
                    @Nullable Integer value = rs.wasNull() ? null : max;
                    limits.put(rs.getString("limit_key"), value);
                });
        Map<String, @Nullable Integer> expected = new LinkedHashMap<>();
        expected.put("binder.views.per_day", 30);
        expected.put("binders.max", 7);
        expected.put("inventory.items.max", null);
        expected.put("offers.per_day", 20);
        expected.put("wishlist.alerts.per_day", 5);
        expected.put("wishlist.items.max", 20);
        assertThat(limits)
                .as("the FREE values, with the admin edit of binders.max")
                .isEqualTo(expected);
        assertThat(
                        db.queryForObject(
                                "SELECT updated_by FROM usage_limit WHERE limit_key ="
                                        + " 'binders.max'",
                                UUID.class))
                .isEqualTo(ADMIN);
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO usage_limit (limit_key, kind, limit_window,"
                                                + " max_value) VALUES ('binders.max', 'COUNTER',"
                                                + " 'TOTAL', 9)"))
                .as("one limit per key")
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(
                        db.queryForObject(
                                "SELECT count FROM usage_counter WHERE user_id = ? AND limit_key ="
                                        + " 'binder.views.per_day'",
                                Integer.class,
                                PREMIUM_USER))
                .as("counters are untouched")
                .isEqualTo(12);
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM usage_counter WHERE limit_key ="
                                        + " 'saved_searches.max'",
                                Integer.class))
                .as("saved_searches.max, a Premium perk of a feature never built, is gone")
                .isZero();
    }

    @Test
    void thePremiumAccountIsAnOrdinaryCollectorAndTheRoleIsGone() {
        assertThat(rolesOf(PREMIUM_USER)).containsExactly("USER");
        assertThat(rolesOf(ADMIN)).containsExactly("ADMIN", "USER");
        assertThat(db.queryForObject("SELECT count(*) FROM user_account", Integer.class))
                .isEqualTo(4);
        assertThatThrownBy(
                        () ->
                                db.update(
                                        "INSERT INTO user_role (user_id, role) VALUES (?,"
                                                + " 'PREMIUM_USER')",
                                        FREE_USER))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theFlagsAndSettingsOfTheRemovedFeaturesAreGone() {
        // cardTextScan: V129, the camera card scan, added after F1.
        assertThat(db.queryForList("SELECT key FROM feature_flag ORDER BY key", String.class))
                .containsExactly("cardTextScan", "mlScanning", "protectedPayments", "publicChat");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM platform_settings WHERE key LIKE 'credits.%'"
                                        + " OR key LIKE 'donations.%'",
                                Integer.class))
                .isZero();
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM platform_settings WHERE key LIKE"
                                        + " 'payments.%'",
                                Integer.class))
                .as("protected payments keep their settings")
                .isPositive();
    }

    @Test
    void oldNotificationsNoLongerOfferPremiumOrLinkToRemovedScreens() {
        Map<String, Object> premium = notification(PREMIUM_NOTICE);
        assertThat(premium.get("body"))
                .isEqualTo(
                        "You reached today's limit of 5 wishlist alerts. New listings still show"
                                + " on the card pages. The limit resets tomorrow.");
        assertThat((String) premium.get("data"))
                .contains("\"kind\": \"LIMIT_REACHED\"")
                .contains("\"limitKey\": \"wishlist.alerts.per_day\"")
                .doesNotContain("planCode")
                .doesNotContain("upgradeUrl")
                .doesNotContain("deepLink")
                .doesNotContain("premium");

        Map<String, Object> plain = notification(PLAIN_NOTICE);
        assertThat(plain.get("body"))
                .isEqualTo(
                        "You reached today's limit of 3 notifications of this kind. The limit"
                                + " resets tomorrow.");
        assertThat((String) plain.get("data")).doesNotContain("planCode");

        // Broadcasts that promoted a removed feature (they linked to its screen) are deleted.
        for (UUID promotion :
                List.of(
                        SUPPORT_BROADCAST,
                        CHECKOUT_BROADCAST,
                        PREMIUM_BROADCAST,
                        CREDITS_BROADCAST)) {
            assertThat(exists(promotion)).as("promotion %s", promotion).isFalse();
        }
        assertThat((String) notification(WISHLIST_BROADCAST).get("data"))
                .as("links to screens that stay are kept")
                .contains("\"deepLink\": \"/wishlist\"");
        assertThat((String) notification(LOOKALIKE_BROADCAST).get("data"))
                .as("a path that only starts like a removed one")
                .contains("\"deepLink\": \"/premiumcards\"");
        Map<String, Object> other = notification(OTHER_LINKED_NOTICE);
        assertThat(other.get("body")).isEqualTo("Your support request was answered.");
        assertThat((String) other.get("data"))
                .as("any other notice keeps its text and loses the link")
                .contains("\"kind\": \"NOTICE\"")
                .doesNotContain("deepLink");
    }

    @Test
    void outboxRowsOfTheRemovedEventsAreCompletedAndJobHistoryGoesWithItsJob() {
        for (UUID removed :
                List.of(
                        BILLING_WEBHOOK_PUBLICATION,
                        SUBSCRIPTION_PUBLICATION,
                        DONATION_PUBLICATION)) {
            assertThat(completed(removed)).as("completed %s", removed).isTrue();
        }
        assertThat(completed(OTHER_PUBLICATION)).as("other events are left alone").isFalse();
        assertThat(db.queryForList("SELECT name FROM job_run ORDER BY name", String.class))
                .containsExactly("freshness");
    }

    @Test
    void auditRowsStayAsHistory() {
        assertThat(db.queryForList("SELECT action FROM audit_log ORDER BY action", String.class))
                .containsExactly(
                        "ads.campaign.create",
                        "credits.grant",
                        "donation.refund",
                        "plan.update",
                        "subscription.cancel");
    }

    // ---------------------------------------------------------------------------------------
    // Fictional data of every removed feature (shaped like the local seeds), at V119
    // ---------------------------------------------------------------------------------------

    private static void insertPaidFeatureData() {
        for (int n = 1; n <= 4; n++) {
            db.update(
                    "INSERT INTO user_account (id, provider_uid, handle, plan_code) VALUES (?, ?,"
                            + " ?, ?)",
                    user(n),
                    "v123check-" + n,
                    "v123check" + n,
                    n == 2 ? "PREMIUM" : "FREE");
            db.update("INSERT INTO user_role (user_id, role) VALUES (?, 'USER')", user(n));
        }
        db.update("INSERT INTO user_role (user_id, role) VALUES (?, 'PREMIUM_USER')", PREMIUM_USER);
        db.update("INSERT INTO user_role (user_id, role) VALUES (?, 'ADMIN')", ADMIN);

        // Premium: a live subscription, its history, a provider webhook, entitlements.
        db.update(
                "INSERT INTO subscription (id, user_id, plan_id, status, provider, provider_ref,"
                        + " amount, currency, current_period_start, current_period_end,"
                        + " activated_at) SELECT ?, ?, id, 'ACTIVE', 'fake', 'fake_sub_1', 4.99,"
                        + " 'CAD', now(), now() + interval '30 days', now() FROM plan WHERE code ="
                        + " 'PREMIUM'",
                SUBSCRIPTION,
                PREMIUM_USER);
        db.update(
                "INSERT INTO subscription_event (subscription_id, event) VALUES (?, 'ACTIVATED')",
                SUBSCRIPTION);
        db.update(
                "INSERT INTO billing_webhook_event (provider, provider_event_id, type,"
                        + " signature_valid, status, subscription_id, payload) VALUES ('fake',"
                        + " 'evt_1', 'subscription.activated', true, 'PROCESSED', ?, '{}')",
                SUBSCRIPTION);
        db.update(
                "INSERT INTO entitlement (user_id, feature_key, value, source, granted_by) VALUES"
                        + " (?, 'binder.views.per_day', 'unlimited', 'ADMIN_GRANT', ?)",
                FREE_USER,
                ADMIN);
        db.update(
                "INSERT INTO entitlement (user_id, feature_key, value, source, expires_at)"
                        + " VALUES (?, 'filters.advanced', 'true', 'CREDIT_PURCHASE', now() +"
                        + " interval '1 day')",
                FREE_USER);

        // An admin edit of a FREE limit, and a PREMIUM limit (V011 rows already exist).
        db.update(
                "UPDATE usage_limit l SET max_value = 7, updated_by = ? FROM plan p WHERE p.id ="
                        + " l.plan_id AND p.code = 'FREE' AND l.limit_key = 'binders.max'",
                ADMIN);
        db.update(
                "INSERT INTO usage_counter (user_id, limit_key, window_start, count) VALUES (?,"
                        + " 'binder.views.per_day', date_trunc('day', now()), 12)",
                PREMIUM_USER);
        db.update(
                "INSERT INTO usage_counter (user_id, limit_key, window_start, count) VALUES (?,"
                        + " 'saved_searches.max', to_timestamp(0), 3)",
                PREMIUM_USER);

        // Credits: a grant, a referral and its redemption.
        db.update(
                "INSERT INTO credit_ledger_entry (user_id, amount, balance_after, type, reason,"
                        + " idempotency_key) VALUES (?, 500, 500, 'GRANT', 'PROMO',"
                        + " 'seed:v123:grant')",
                FREE_USER);
        db.update("INSERT INTO referral_code (user_id, code) VALUES (?, 'V123CHECK')", FREE_USER);
        db.update(
                "INSERT INTO referral_redemption (id, referrer_id, referee_id, code,"
                        + " referrer_reward, referee_reward) VALUES (?, ?, ?, 'V123CHECK', 100,"
                        + " 50)",
                id("ab60", 1),
                FREE_USER,
                REFEREE);

        // Ads: a campaign targeting the PREMIUM plan, served, clicked and converted.
        db.update(
                "INSERT INTO advertiser (id, name, contact_email) VALUES (?, 'Fictional Sleeves',"
                        + " 'ads@sleeves.example')",
                ADVERTISER);
        db.update(
                "INSERT INTO ad_campaign (id, advertiser_id, name, status, start_at, budget_total,"
                        + " pricing) VALUES (?, ?, 'House ad', 'ACTIVE', now(), 10, 'FLAT')",
                CAMPAIGN,
                ADVERTISER);
        db.update(
                "INSERT INTO ad_creative (id, campaign_id, placement_id, headline, cta_label,"
                        + " landing_url, status) SELECT ?, ?, id, 'Go Premium', 'See plans',"
                        + " '/premium', 'ACTIVE' FROM ad_placement WHERE key = 'MAP_PANEL'",
                CREATIVE,
                CAMPAIGN);
        db.update(
                "INSERT INTO ad_targeting_rule (campaign_id, kind, value) VALUES (?, 'PLAN',"
                        + " 'FREE')",
                CAMPAIGN);
        UUID impression = id("ab20", 4);
        UUID click = id("ab20", 5);
        db.update(
                "INSERT INTO ad_impression (id, serve_id, creative_id, campaign_id,"
                        + " placement_key) VALUES (?, ?, ?, ?, 'MAP_PANEL')",
                impression,
                id("ab20", 6),
                CREATIVE,
                CAMPAIGN);
        db.update(
                "INSERT INTO ad_click (id, serve_id, creative_id, campaign_id, impression_id,"
                        + " placement_key) VALUES (?, ?, ?, ?, ?, 'MAP_PANEL')",
                click,
                id("ab20", 7),
                CREATIVE,
                CAMPAIGN,
                impression);
        db.update(
                "INSERT INTO ad_conversion (click_id, creative_id, campaign_id, kind) VALUES (?,"
                        + " ?, ?, 'SIGNUP')",
                click,
                CREATIVE,
                CAMPAIGN);
        db.update(
                "INSERT INTO ad_campaign_daily (campaign_id, day, impressions, clicks) VALUES (?,"
                        + " current_date, 1, 1)",
                CAMPAIGN);

        // Donations: a succeeded donation and its provider webhook.
        db.update(
                "INSERT INTO donation (id, user_id, amount, currency, provider, provider_ref,"
                        + " status, public_thanks, succeeded_at) VALUES (?, ?, 5.00, 'CAD', 'fake',"
                        + " 'fake_dn_1', 'SUCCEEDED', true, now())",
                DONATION,
                FREE_USER);
        db.update(
                "INSERT INTO donation_webhook_event (provider, provider_event_id, type,"
                        + " signature_valid, status, donation_id, payload) VALUES ('fake',"
                        + " 'evt_dn_1', 'donation.succeeded', true, 'PROCESSED', ?, '{}')",
                DONATION);

        // Notifications of the old shapes.
        notification(
                PREMIUM_NOTICE,
                "More wishlist alerts are waiting",
                "You reached today's limit of 5 wishlist alerts on your plan. New listings still"
                        + " show on the card pages; upgrade to Premium for unlimited alerts.",
                "{\"kind\": \"LIMIT_REACHED\", \"notificationType\": \"WISHLIST_ALERT\","
                        + " \"limitKey\": \"wishlist.alerts.per_day\", \"limit\": 5, \"planCode\":"
                        + " \"FREE\", \"upgradeUrl\": \"/premium\", \"deepLink\": \"/premium\"}");
        notification(
                PLAIN_NOTICE,
                "More notifications are waiting",
                "You reached today's limit of 3 notifications of this kind on your plan. The limit"
                        + " resets tomorrow.",
                "{\"kind\": \"LIMIT_REACHED\", \"notificationType\": \"MESSAGE\", \"limitKey\":"
                        + " \"messages.per_day\", \"limit\": 3, \"planCode\": \"FREE\"}");
        notification(
                SUPPORT_BROADCAST,
                "Thank you",
                "Support OrenjiTrade with a donation.",
                "{\"kind\": \"BROADCAST\", \"deepLink\": \"/support\"}");
        notification(
                CHECKOUT_BROADCAST,
                "Your checkout",
                "Finish your checkout.",
                "{\"kind\": \"BROADCAST\", \"deepLink\": \"/checkout/fake-billing/fake_cs_1\"}");
        notification(
                WISHLIST_BROADCAST,
                "Your wishlist",
                "Add the cards you are looking for.",
                "{\"kind\": \"BROADCAST\", \"deepLink\": \"/wishlist\"}");
        notification(
                PREMIUM_BROADCAST,
                "Go Premium",
                "Try Premium.",
                "{\"kind\": \"BROADCAST\", \"deepLink\": \"/premium#plans\"}");
        notification(
                CREDITS_BROADCAST,
                "Earn credits",
                "Invite a friend and earn credits.",
                "{\"kind\": \"BROADCAST\", \"deepLink\": \"/credits?tab=referrals\"}");
        notification(
                LOOKALIKE_BROADCAST,
                "Premium cards",
                "See the most traded cards.",
                "{\"kind\": \"BROADCAST\", \"deepLink\": \"/premiumcards\"}");
        notification(
                OTHER_LINKED_NOTICE,
                "Support",
                "Your support request was answered.",
                "{\"kind\": \"NOTICE\", \"deepLink\": \"/support\"}");

        // Incomplete outbox rows, job runs and audit rows.
        publication(
                BILLING_WEBHOOK_PUBLICATION,
                "com.orenjitrade.api.billing.events.BillingWebhookReceived");
        publication(
                SUBSCRIPTION_PUBLICATION, "com.orenjitrade.api.billing.events.SubscriptionChanged");
        publication(
                DONATION_PUBLICATION,
                "com.orenjitrade.api.donations.events.DonationWebhookReceived");
        publication(
                OTHER_PUBLICATION, "com.orenjitrade.api.inventory.events.InventoryItemPublished");
        for (String job : List.of("credits-reconcile", "subscriptions-period", "freshness")) {
            db.update(
                    "INSERT INTO job_run (name, status, finished_at) VALUES (?, 'SUCCEEDED',"
                            + " now())",
                    job);
        }
        for (String action :
                List.of(
                        "plan.update",
                        "credits.grant",
                        "ads.campaign.create",
                        "donation.refund",
                        "subscription.cancel")) {
            db.update(
                    "INSERT INTO audit_log (actor_user_id, actor_type, action, target_type,"
                            + " target_id, details) VALUES (?, 'ADMIN', ?, 'TEST', 'x', '{}')",
                    ADMIN,
                    action);
        }
    }

    private static void notification(UUID id, String title, String body, String data) {
        db.update(
                "INSERT INTO notification (id, user_id, type, title, body, data, dedup_key) VALUES"
                        + " (?, ?, 'SYSTEM', ?, ?, ?::jsonb, ?)",
                id,
                FREE_USER,
                title,
                body,
                data,
                "v123check:" + id);
    }

    private static void publication(UUID id, String eventType) {
        db.update(
                "INSERT INTO event_publication (id, listener_id, event_type, serialized_event,"
                        + " publication_date, status, completion_attempts) VALUES (?, 'listener',"
                        + " ?, '{}', now(), 'PUBLISHED', 1)",
                id,
                eventType);
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    private static Map<String, Object> notification(UUID id) {
        return db.queryForMap(
                "SELECT title, body, data::text AS data FROM notification WHERE id = ?", id);
    }

    private static boolean exists(UUID notification) {
        return Boolean.TRUE.equals(
                db.queryForObject(
                        "SELECT count(*) > 0 FROM notification WHERE id = ?",
                        Boolean.class,
                        notification));
    }

    private static boolean completed(UUID publication) {
        return Boolean.TRUE.equals(
                db.queryForObject(
                        "SELECT completion_date IS NOT NULL AND status = 'COMPLETED' FROM"
                                + " event_publication WHERE id = ?",
                        Boolean.class,
                        publication));
    }

    private static List<String> rolesOf(UUID userId) {
        return db.queryForList(
                "SELECT role FROM user_role WHERE user_id = ? ORDER BY role", String.class, userId);
    }

    private static List<String> columnsOf(String table) {
        return db.queryForList(
                "SELECT column_name FROM information_schema.columns WHERE table_name = ?",
                String.class,
                table);
    }

    private static UUID user(int n) {
        return id("ab00", n);
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

    private static void migrate(DataSource dataSource, @Nullable String target) {
        var configuration =
                Flyway.configure()
                        .dataSource(dataSource)
                        .locations("classpath:db/migration")
                        .validateMigrationNaming(true);
        if (target != null) {
            configuration.target(target);
        }
        configuration.load().migrate();
    }
}
