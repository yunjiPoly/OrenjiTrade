package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDeletionConfiguration;
import com.orenjitrade.api.admin.domain.TestAccountPurgeService;
import com.orenjitrade.api.admin.domain.TestAccountPurgeService.PurgeReport;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * The local test-data purge ({@code npm run e2e:purge}): fictional {@code @example.test} accounts
 * go through the real account-deletion path (request, then the job's processing of exactly that
 * request: location, binders and inventory purged, the row anonymised, the identity deleted,
 * consents and audit kept); every other account, every other deletion request and the card catalog
 * stay untouched; a blocked account is taken off the map.
 */
class TestAccountPurgeIT extends AbstractIntegrationTest {

    @Autowired private TestAccountPurgeService purge;
    @Autowired private CatalogImportService importService;
    @Autowired private NoopIdentityAdminClient identityAdminClient;

    @Test
    void removesTestAccountsLikeARealDeletionAndNothingElse() {
        String uidA = uniqueUid("purge-a");
        String uidB = uniqueUid("purge-b");
        String uidKeep = uniqueUid("purge-keep");
        String uidDue = uniqueUid("purge-due");
        UUID a = collectorWithData(uidA, "e2e-rtest001-purge-a@example.test");
        UUID b = collectorWithData(uidB, "E2E-rtest001-Purge-B@EXAMPLE.TEST");
        UUID keep = collectorWithData(uidKeep, null); // stays <uid>@orenjitrade.test
        UUID due = provisionCompliant(uidDue);
        // Another account's deletion is already due: the purge must not process it.
        String dueRequest =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/me/deletion-requests",
                                uidDue,
                                Map.of("reason", "not a test account"),
                                201)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE account_deletion_request SET scheduled_for = now() - interval '1 minute'"
                        + " WHERE id = ?",
                UUID.fromString(dueRequest));
        int cards = testUsers.count("SELECT count(*) FROM card");
        int printings = testUsers.count("SELECT count(*) FROM card_printing");
        assertThat(purge.plan().found()).isGreaterThanOrEqualTo(2);

        PurgeReport report = purge.purge();

        assertThat(report.failed()).isEmpty();
        assertThat(report.deleted()).isGreaterThanOrEqualTo(2);
        assertThat(report.before().locations()).isGreaterThanOrEqualTo(2);
        assertThat(report.before().binders()).isGreaterThanOrEqualTo(2);
        assertThat(report.after().locations()).isZero();
        assertThat(report.after().binders()).isZero();
        assertThat(report.after().items()).isZero();
        assertThat(report.remaining()).isZero();
        for (UUID id : new UUID[] {a, b}) {
            Map<String, Object> row = testUsers.row(id);
            assertThat(row.get("status")).isEqualTo("DELETED");
            assertThat(row.get("email")).isEqualTo("deleted+" + id + "@anonymized.invalid");
            assertThat(row.get("display_name")).isEqualTo("Deleted collector");
            assertThat(testUsers.locationOf(id)).isEmpty();
            assertThat(testUsers.count("SELECT count(*) FROM binder WHERE owner_id = ?", id))
                    .isZero();
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM inventory_item WHERE owner_id = ?", id))
                    .isZero();
            assertThat(testUsers.consentsOf(id)).isNotEmpty();
            assertThat(testUsers.auditRowsFor(id))
                    .anySatisfy(
                            audit ->
                                    assertThat(audit.get("action"))
                                            .isEqualTo("account.deletion.complete"));
        }
        assertThat(identityAdminClient.isDeleted(uidA)).isTrue();
        assertThat(identityAdminClient.isDeleted(uidB)).isTrue();

        // Untouched: the other collector, the other due request, the catalog.
        assertThat(testUsers.row(keep).get("status")).isEqualTo("ACTIVE");
        assertThat(testUsers.locationOf(keep)).isNotEmpty();
        assertThat(testUsers.count("SELECT count(*) FROM binder WHERE owner_id = ?", keep))
                .isEqualTo(1);
        assertThat(identityAdminClient.isDeleted(uidKeep)).isFalse();
        assertThat(testUsers.row(due).get("status")).isEqualTo("DELETION_REQUESTED");
        assertThat(
                        testUsers
                                .query(
                                        "SELECT status FROM account_deletion_request WHERE id = ?",
                                        UUID.fromString(dueRequest))
                                .get(0)
                                .get("status"))
                .isEqualTo("PENDING");
        assertThat(testUsers.count("SELECT count(*) FROM card")).isEqualTo(cards);
        assertThat(testUsers.count("SELECT count(*) FROM card_printing")).isEqualTo(printings);

        // Idempotent: nothing left to do.
        assertThat(purge.purge().found()).isZero();
    }

    @Test
    void aBlockedTestAccountIsKeptButTakenOffTheMap() {
        String uid = uniqueUid("purge-blocked");
        UUID id = collectorWithData(uid, "e2e-rtest002-blocked@example.test");
        TestDeletionConfiguration.BLOCKED.add(id);
        try {
            PurgeReport report = purge.purge();
            assertThat(report.blocked())
                    .anySatisfy(
                            problem -> {
                                assertThat(problem.email())
                                        .isEqualTo("e2e-rtest002-blocked@example.test");
                                assertThat(problem.reason())
                                        .contains(TestDeletionConfiguration.BLOCKER);
                            });
            assertThat(testUsers.row(id).get("status")).isEqualTo("ACTIVE");
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM privacy_settings WHERE user_id = ?"
                                            + " AND discoverable",
                                    id))
                    .isZero();
        } finally {
            TestDeletionConfiguration.BLOCKED.remove(id);
        }
        // Once unblocked, the next purge removes it.
        purge.purge();
        assertThat(testUsers.row(id).get("status")).isEqualTo("DELETED");
    }

    @Test
    void recognisesOnlyTheTestDomain() {
        assertThat(TestAccountPurgeService.isTestAccountEmail("e2e-r1-x@example.test")).isTrue();
        assertThat(TestAccountPurgeService.isTestAccountEmail("X@Example.Test")).isTrue();
        assertThat(TestAccountPurgeService.isTestAccountEmail("collector1@orenjitrade.test"))
                .isFalse();
        assertThat(TestAccountPurgeService.isTestAccountEmail("m-r1-x@mobile-e2e.test")).isFalse();
        assertThat(TestAccountPurgeService.isTestAccountEmail("a@example.test.evil.org")).isFalse();
        assertThat(TestAccountPurgeService.isTestAccountEmail(null)).isFalse();
    }

    /**
     * A discoverable collector with a location, a public binder and one item; with {@code email},
     * the account is turned into a fictional E2E test account.
     */
    private UUID collectorWithData(String uid, String email) {
        InventoryTestSupport.ensureCatalog(importService);
        UUID id = provisionCompliant(uid);
        setLocation(uid, "CA", "CA-NS", "Halifax");
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, discoverable(), 200);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                InventoryTestSupport.binder("Purge test binder", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> item =
                InventoryTestSupport.item(InventoryTestSupport.printing(testUsers, "mtg-p010a"));
        item.put("binderId", binderId);
        callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, item, 201);
        assertThat(testUsers.locationOf(id)).isNotEmpty();
        if (email != null) {
            testUsers.update("UPDATE user_account SET email = ? WHERE id = ?", email, id);
        }
        return id;
    }

    private static Map<String, Object> discoverable() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", true);
        body.put("showOnlineStatus", false);
        body.put("showLastActive", true);
        body.put("profileVisibility", "MEMBERS");
        body.put("messagingPermission", "MEMBERS_WITH_PROFILE");
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }
}
