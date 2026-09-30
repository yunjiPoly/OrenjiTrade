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
        assertThat(binders).isEqualTo(10);
        assertThat(items).isEqualTo(36);
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
                .isEqualTo(3);
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
    void seedsCollector2sWishlistWithANotifiedMatchAndAFewNotifications() {
        UUID collector2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
        String azureWish = "00000000-0000-4000-8f00-000000000201";
        String azureItem = "00000000-0000-4000-8c00-000000010101";
        String wishes =
                "SELECT count(*) FROM wishlist_item WHERE id::text LIKE"
                        + " '00000000-0000-4000-8f00-%'";
        String seededNotifications =
                "SELECT count(*) FROM notification WHERE id::text LIKE"
                        + " '00000000-0000-4000-9a00-%'";
        assertThat(testUsers.count(wishes)).isEqualTo(3);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_item WHERE owner_id = ? AND"
                                        + " radius_km = 25 AND active",
                                collector2))
                .isEqualTo(3);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM wishlist_match WHERE wishlist_item_id ="
                                        + " ?::uuid AND inventory_item_id = ?::uuid AND notified",
                                azureWish,
                                azureItem))
                .as("collector1's public Azure-Eyes matches and notified collector2")
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ? AND type ="
                                        + " 'WISHLIST_MATCH' AND dedup_key = ?",
                                collector2,
                                "wishlist:" + azureWish + ":" + azureItem))
                .isEqualTo(1);
        assertThat(testUsers.count(seededNotifications)).isEqualTo(4);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM privacy_settings WHERE user_id = ? AND"
                                        + " wishlist_visible",
                                collector2))
                .isEqualTo(1);
        String collector2Matches =
                "SELECT count(*) FROM wishlist_match m JOIN wishlist_item w ON w.id ="
                        + " m.wishlist_item_id WHERE w.owner_id = ?";
        int matches = testUsers.count(collector2Matches, collector2);
        int notifications =
                testUsers.count("SELECT count(*) FROM notification WHERE user_id = ?", collector2);

        seedDataRunner.seedAll();

        assertThat(testUsers.count(wishes)).isEqualTo(3);
        assertThat(testUsers.count(seededNotifications)).isEqualTo(4);
        assertThat(testUsers.count(collector2Matches, collector2)).isEqualTo(matches);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ?", collector2))
                .as("seeding again notifies nobody")
                .isEqualTo(notifications);
    }

    private Map<String, Object> binderRow(String id) {
        return testUsers
                .query(
                        "SELECT visibility, public_until, freshness_state, item_count,"
                                + " publicly_listed FROM binder WHERE id = ?",
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
                .isEqualTo(5);
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
                .isEqualTo(5);
        assertThat(testUsers.count("SELECT count(*) FROM offer_event")).isEqualTo(events);
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
                        "trading areas",
                        "catalog",
                        "inventory",
                        "conversations",
                        "community",
                        "wishlist",
                        "notifications",
                        "ratings",
                        "reports",
                        "offers",
                        "trades");
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

        UUID premiumId = UUID.fromString("00000000-0000-4000-8000-000000000009");
        Map<String, Object> premium = testUsers.row(premiumId);
        assertThat(premium.get("plan_code")).isEqualTo("PREMIUM");
        assertThat(premium.get("provider_uid")).isEqualTo("seed-premium-user");
        assertThat(testUsers.rolesOf(premiumId)).containsExactly("PREMIUM_USER", "USER");

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
        assertThat(me("seed-collector1").path("plan").asString()).isEqualTo("FREE");
    }
}
