package com.orenjitrade.api.delisting;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.delisting.domain.DelistPolicyService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Delist policies are data (ADR 0014): admins read and edit the thresholds (validated ordering,
 * audited, cache evicted) and the freshness job applies the new values on its next run.
 */
class AdminDelistPolicyIT extends AbstractIntegrationTest {

    @Autowired private DelistPolicyService delistPolicyService;
    @Autowired private CatalogImportService importService;

    @AfterEach
    void restoreDefaults() {
        testUsers.update(
                "UPDATE delist_policy SET name = 'Default', aging_after_days = 15,"
                        + " stale_after_days = 31, hidden_after_days = 46,"
                        + " warn_before_hidden_days = 5, max_strikes = 3, updated_by = NULL WHERE"
                        + " active");
        delistPolicyService.invalidate();
        // Other suites share the database: re-derive every state under the default policy.
        runFreshnessJob();
    }

    private static Map<String, Object> thresholds(int aging, int stale, int hidden, int warn) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("agingAfterDays", aging);
        body.put("staleAfterDays", stale);
        body.put("hiddenAfterDays", hidden);
        body.put("warnBeforeHiddenDays", warn);
        return body;
    }

    @Test
    void adminsReadAndEditThePolicyAndTheJobAppliesIt() {
        String admin = uniqueUid("delist-admin");
        UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        JsonNode policies =
                callJson(HttpMethod.GET, "/api/v1/admin/delist-policies", admin, null, 200);
        assertThat(policies.size()).isEqualTo(1);
        JsonNode active = policies.get(0);
        assertThat(active.path("active").asBoolean()).isTrue();
        assertThat(active.path("agingAfterDays").asInt()).isEqualTo(15);
        assertThat(active.path("staleAfterDays").asInt()).isEqualTo(31);
        assertThat(active.path("hiddenAfterDays").asInt()).isEqualTo(46);
        assertThat(active.path("warnBeforeHiddenDays").asInt()).isEqualTo(5);
        assertThat(active.path("maxStrikes").asInt()).isEqualTo(3);
        String uri = "/api/v1/admin/delist-policies/" + active.path("id").asString();

        callJson(HttpMethod.PUT, uri, admin, thresholds(20, 20, 60, 5), 400);
        callJson(HttpMethod.PUT, uri, admin, thresholds(20, 40, 30, 5), 400);
        callJson(HttpMethod.PUT, uri, admin, thresholds(20, 40, 60, 60), 400);
        callJson(HttpMethod.PUT, uri, admin, thresholds(0, 40, 60, 5), 400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/delist-policies/" + UUID.randomUUID(),
                admin,
                thresholds(20, 40, 60, 5),
                404);

        // An item confirmed 50 days ago is HIDDEN under the default policy...
        InventoryTestSupport.ensureCatalog(importService);
        String owner = uniqueUid("delist-owner");
        provisionCompliant(owner);
        String itemId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/inventory/items",
                                owner,
                                InventoryTestSupport.item(
                                        InventoryTestSupport.printing(testUsers, "ygo-p009a")),
                                201)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE inventory_item SET confirmed_at = now() - interval '50 days' WHERE id = ?",
                UUID.fromString(itemId));
        runFreshnessJob();
        assertThat(state(owner, itemId)).isEqualTo("HIDDEN");

        // ... and only STALE once the admin allows 60 days (restored by the next run).
        Map<String, Object> body = thresholds(20, 40, 60, 7);
        body.put("name", "Lenient");
        JsonNode updated = callJson(HttpMethod.PUT, uri, admin, body, 200);
        assertThat(updated.path("name").asString()).isEqualTo("Lenient");
        assertThat(updated.path("hiddenAfterDays").asInt()).isEqualTo(60);
        assertThat(updated.path("updatedBy").asString()).isEqualTo(adminId.toString());
        runFreshnessJob();
        assertThat(state(owner, itemId)).isEqualTo("STALE");
        assertThat(
                        testUsers.query(
                                "SELECT event FROM inventory_freshness_event WHERE item_id = ?"
                                        + " ORDER BY created_at, id",
                                UUID.fromString(itemId)))
                .extracting(row -> row.get("event"))
                .containsExactly("HIDDEN", "RESTORED");

        List<Map<String, Object>> audit =
                testUsers.query(
                        "SELECT action, actor_user_id, details::text AS details FROM audit_log"
                                + " WHERE target_type = 'DELIST_POLICY' AND target_id = ?",
                        active.path("id").asString());
        assertThat(audit).hasSize(1);
        assertThat(audit.get(0).get("action")).isEqualTo("delist_policy.update");
        assertThat(audit.get(0).get("actor_user_id")).isEqualTo(adminId);
        assertThat(String.valueOf(audit.get(0).get("details"))).contains("\"hiddenAfterDays\": 60");
    }

    @Test
    void onlyAdminsMayReadOrEdit() {
        String user = uniqueUid("delist-user");
        provisionCompliant(user);
        callJson(HttpMethod.GET, "/api/v1/admin/delist-policies", user, null, 403);
        callJson(HttpMethod.GET, "/api/v1/admin/delist-policies", null, null, 401);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/delist-policies/" + UUID.randomUUID(),
                user,
                thresholds(20, 40, 60, 5),
                403);
    }

    private String state(String owner, String itemId) {
        return callJson(HttpMethod.GET, "/api/v1/inventory/items/" + itemId, owner, null, 200)
                .path("freshness")
                .path("state")
                .asString();
    }

    private void runFreshnessJob() {
        http.post()
                .uri("/internal/jobs/freshness")
                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, InventoryTestSupport.SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isOk();
    }
}
