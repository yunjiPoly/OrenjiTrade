package com.orenjitrade.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.domain.Entitlements;
import com.orenjitrade.api.billing.domain.PlanService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
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
 * Plans, usage limits and entitlements (ADR 0014, Phase 10 contract "Plans and limits"): FREE limit
 * reached → 429 with extensions, PREMIUM plan and entitlement overrides, live admin edits with
 * cache invalidation, caps, authorization and validation.
 */
class LimitsIT extends AbstractIntegrationTest {

    static final String VIEWS = "binder.views.per_day";
    static final String CONSUME_VIEWS = "/api/v1/test-probes/limits/" + VIEWS + "/consume";

    @Autowired private PlanService planService;
    @Autowired private Entitlements entitlements;

    @AfterEach
    void restoreMigrationValues() {
        testUsers.update(
                "UPDATE usage_limit l SET max_value = 30, limit_window = 'DAY', updated_by = NULL"
                        + " FROM plan p WHERE p.id = l.plan_id AND p.code = 'FREE' AND l.limit_key"
                        + " = ?",
                VIEWS);
        testUsers.update(
                "UPDATE usage_limit l SET max_value = NULL, limit_window = 'DAY', updated_by ="
                        + " NULL FROM plan p WHERE p.id = l.plan_id AND p.code = 'PREMIUM' AND"
                        + " l.limit_key = ?",
                VIEWS);
        testUsers.update(
                "UPDATE plan SET monthly_price = 4.99, name = 'Premium', active = true,"
                        + " updated_by = NULL WHERE code = 'PREMIUM'");
        planService.invalidate();
    }

    private UUID limitId(String plan, String key) {
        return (UUID)
                testUsers
                        .query(
                                "SELECT l.id FROM usage_limit l JOIN plan p ON p.id = l.plan_id"
                                        + " WHERE p.code = ? AND l.limit_key = ?",
                                plan,
                                key)
                        .get(0)
                        .get("id");
    }

    private void setFreeViews(String superAdmin, Integer max) {
        Map<String, Object> body = new HashMap<>();
        body.put("unlimited", max == null);
        if (max != null) {
            body.put("maxValue", max);
        }
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/usage-limits/" + limitId("FREE", VIEWS),
                superAdmin,
                body,
                200);
    }

    private static JsonNode limitOf(JsonNode myPlan, String key) {
        for (JsonNode limit : myPlan.path("limits")) {
            if (limit.path("key").asString().equals(key)) {
                return limit;
            }
        }
        throw new AssertionError("no limit " + key + " in " + myPlan);
    }

    @Test
    void publicPlansListFreeAndPremiumWithTheContractLimits() {
        JsonNode plans = callJson(HttpMethod.GET, "/api/v1/plans", null, null, 200);
        assertThat(plans.size()).isEqualTo(2);
        JsonNode free = plans.get(0);
        JsonNode premium = plans.get(1);
        assertThat(free.path("code").asString()).isEqualTo("FREE");
        assertThat(premium.path("code").asString()).isEqualTo("PREMIUM");
        assertThat(premium.path("monthlyPrice").decimalValue()).isEqualByComparingTo("4.99");

        Map<String, Integer> freeLimits = new LinkedHashMap<>();
        free.path("limits")
                .forEach(
                        limit ->
                                freeLimits.put(
                                        limit.path("key").asString(),
                                        limit.path("limit").isNull()
                                                        || limit.path("limit").isMissingNode()
                                                ? null
                                                : limit.path("limit").asInt()));
        assertThat(freeLimits)
                .containsEntry("binder.views.per_day", 30)
                .containsEntry("wishlist.alerts.per_day", 5)
                .containsEntry("wishlist.items.max", 20)
                .containsEntry("map.radius.max_km", 25)
                .containsEntry("binders.max", 5)
                .containsEntry("saved_searches.max", 0)
                .containsEntry("offers.per_day", 20);
        Map<String, Integer> premiumLimits = new HashMap<>();
        premium.path("limits")
                .forEach(
                        limit ->
                                premiumLimits.put(
                                        limit.path("key").asString(),
                                        limit.has("limit") && !limit.path("limit").isNull()
                                                ? limit.path("limit").asInt()
                                                : null));
        assertThat(premiumLimits)
                .containsEntry("binder.views.per_day", null)
                .containsEntry("wishlist.alerts.per_day", null)
                .containsEntry("wishlist.items.max", 500)
                .containsEntry("map.radius.max_km", 100)
                .containsEntry("binders.max", 50)
                .containsEntry("saved_searches.max", 50)
                .containsEntry("offers.per_day", 100);
        assertThat(free.path("features").toString())
                .contains("\"key\":\"filters.advanced\",\"enabled\":false")
                .contains("\"key\":\"ads.enabled\",\"enabled\":true");
    }

    @Test
    void freeLimitReachedAnswers429WithExtensionsAndAdminEditsApplyAtOnce() {
        String superAdmin = uniqueUid("limits-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String user = uniqueUid("limits-free");
        provisionCompliant(user);

        JsonNode initial = callJson(HttpMethod.GET, "/api/v1/me/plan", user, null, 200);
        assertThat(initial.path("plan").path("code").asString()).isEqualTo("FREE");
        assertThat(initial.path("upgradeUrl").asString()).isEqualTo("/premium");
        JsonNode views = limitOf(initial, VIEWS);
        assertThat(views.path("limit").asInt()).isEqualTo(30);
        assertThat(views.path("used").asLong()).isZero();
        assertThat(views.path("window").asString()).isEqualTo("DAY");
        Instant resetsAt = Instant.parse(views.path("resetsAt").asString());
        assertThat(resetsAt)
                .isEqualTo(Instant.now().truncatedTo(ChronoUnit.DAYS).plus(1, ChronoUnit.DAYS));
        JsonNode radius = limitOf(initial, "map.radius.max_km");
        assertThat(radius.path("kind").asString()).isEqualTo("CAP");
        assertThat(radius.path("limit").asInt()).isEqualTo(25);
        assertThat(radius.has("resetsAt")).isFalse();
        assertThat(initial.path("features").path("filters.advanced").asBoolean()).isFalse();
        assertThat(initial.path("features").path("ads.enabled").asBoolean()).isTrue();

        setFreeViews(superAdmin, 3);
        for (int i = 1; i <= 3; i++) {
            JsonNode decision = callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 200);
            assertThat(decision.path("used").asLong()).isEqualTo(i);
            assertThat(decision.path("remaining").asLong()).isEqualTo(3 - i);
            assertThat(decision.path("limit").asInt()).isEqualTo(3);
        }
        JsonNode reached = callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 429);
        assertThat(reached.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(reached.path("limitKey").asString()).isEqualTo(VIEWS);
        assertThat(reached.path("limit").asInt()).isEqualTo(3);
        assertThat(reached.path("used").asLong()).isEqualTo(3);
        assertThat(reached.path("upgradeUrl").asString()).isEqualTo("/premium");
        assertThat(reached.path("planCode").asString()).isEqualTo("FREE");
        assertThat(Instant.parse(reached.path("resetsAt").asString())).isEqualTo(resetsAt);
        assertThat(reached.path("requestId").asString()).isNotEmpty();

        JsonNode afterLimit =
                limitOf(callJson(HttpMethod.GET, "/api/v1/me/plan", user, null, 200), VIEWS);
        assertThat(afterLimit.path("used").asLong()).isEqualTo(3);
        assertThat(afterLimit.path("allowed").asBoolean()).isFalse();
        assertThat(afterLimit.path("remaining").asLong()).isZero();

        // Live edit: raising the limit takes effect immediately (cache evicted).
        setFreeViews(superAdmin, 5);
        assertThat(callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 200).path("used").asLong())
                .isEqualTo(4);
        // Unlimited.
        setFreeViews(superAdmin, null);
        JsonNode unlimited = callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 200);
        assertThat(unlimited.has("limit")).isFalse();
        assertThat(unlimited.path("used").asLong()).isEqualTo(5);
        // Zero blocks at once.
        setFreeViews(superAdmin, 0);
        assertThat(callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 429).path("limit").asInt())
                .isZero();

        List<Map<String, Object>> audit =
                testUsers.query(
                        "SELECT details::text AS details FROM audit_log WHERE action ="
                                + " 'usage_limit.update' AND target_id = ? ORDER BY occurred_at",
                        limitId("FREE", VIEWS).toString());
        assertThat(audit).hasSizeGreaterThanOrEqualTo(4);
        assertThat((String) audit.get(audit.size() - 1).get("details")).contains("\"maxValue\": 0");
    }

    @Test
    void premiumPlanAndEntitlementsOverrideTheFreeLimits() {
        String superAdmin = uniqueUid("limits-ent-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String admin = uniqueUid("limits-ent-admin");
        UUID adminId = provisionWithRoles(admin, Role.ADMIN);
        setFreeViews(superAdmin, 1);

        // PREMIUM plan: unlimited binder views, advanced filters, no ads.
        String premium = uniqueUid("limits-premium");
        UUID premiumId = provisionCompliant(premium);
        testUsers.update("UPDATE user_account SET plan_code = 'PREMIUM' WHERE id = ?", premiumId);
        for (int i = 0; i < 3; i++) {
            JsonNode decision = callJson(HttpMethod.POST, CONSUME_VIEWS, premium, null, 200);
            assertThat(decision.path("planCode").asString()).isEqualTo("PREMIUM");
            assertThat(decision.has("limit")).isFalse();
        }
        JsonNode premiumPlan = callJson(HttpMethod.GET, "/api/v1/me/plan", premium, null, 200);
        assertThat(premiumPlan.path("plan").path("code").asString()).isEqualTo("PREMIUM");
        assertThat(premiumPlan.path("features").path("filters.advanced").asBoolean()).isTrue();
        assertThat(premiumPlan.path("features").path("ads.enabled").asBoolean()).isFalse();
        assertThat(limitOf(premiumPlan, "map.radius.max_km").path("limit").asInt()).isEqualTo(100);

        // FREE user blocked, then an admin grant (unlimited) beats the plan value.
        String free = uniqueUid("limits-granted");
        UUID freeId = provisionCompliant(free);
        callJson(HttpMethod.POST, CONSUME_VIEWS, free, null, 200);
        callJson(HttpMethod.POST, CONSUME_VIEWS, free, null, 429);

        String entitlementsUri = "/api/v1/admin/users/" + freeId + "/entitlements";
        Map<String, Object> grant = new HashMap<>();
        grant.put("featureKey", VIEWS);
        grant.put("value", "unlimited");
        grant.put("note", "Support goodwill");
        callJson(HttpMethod.POST, entitlementsUri, free, grant, 403);
        JsonNode granted = callJson(HttpMethod.POST, entitlementsUri, admin, grant, 201);
        assertThat(granted.path("source").asString()).isEqualTo("ADMIN_GRANT");
        assertThat(granted.path("value").asString()).isEqualTo("unlimited");
        assertThat(granted.path("grantedBy").asString()).isEqualTo(adminId.toString());

        JsonNode overridden = callJson(HttpMethod.POST, CONSUME_VIEWS, free, null, 200);
        assertThat(overridden.path("overridden").asBoolean()).isTrue();
        assertThat(overridden.has("limit")).isFalse();
        JsonNode myPlan = callJson(HttpMethod.GET, "/api/v1/me/plan", free, null, 200);
        assertThat(myPlan.path("plan").path("code").asString()).isEqualTo("FREE");
        assertThat(myPlan.path("entitlements").size()).isEqualTo(1);
        assertThat(myPlan.path("entitlements").get(0).has("note")).isFalse();
        assertThat(limitOf(myPlan, VIEWS).path("overridden").asBoolean()).isTrue();

        // A numeric grant and a feature grant.
        Map<String, Object> feature = new HashMap<>();
        feature.put("featureKey", "filters.advanced");
        feature.put("expiresAt", Instant.now().plus(1, ChronoUnit.DAYS).toString());
        callJson(HttpMethod.POST, entitlementsUri, admin, feature, 201);
        assertThat(entitlements.has(freeId, "filters.advanced")).isTrue();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/plan", free, null, 200)
                                .path("features")
                                .path("filters.advanced")
                                .asBoolean())
                .isTrue();

        // Revoking gives the plan value back.
        callJson(
                HttpMethod.DELETE,
                entitlementsUri + "/" + granted.path("id").asString(),
                admin,
                null,
                204);
        callJson(
                HttpMethod.DELETE,
                entitlementsUri + "/" + granted.path("id").asString(),
                admin,
                null,
                404);
        callJson(HttpMethod.POST, CONSUME_VIEWS, free, null, 429);

        JsonNode history = callJson(HttpMethod.GET, entitlementsUri, admin, null, 200);
        assertThat(history.size()).isEqualTo(2);
        assertThat(testUsers.auditRowsFor(freeId))
                .extracting(row -> row.get("action"))
                .contains("entitlement.grant", "entitlement.revoke");

        // An expired entitlement no longer applies.
        testUsers.update(
                "UPDATE entitlement SET expires_at = now() - interval '1 minute' WHERE user_id = ?"
                        + " AND feature_key = 'filters.advanced'",
                freeId);
        entitlements.invalidate(freeId);
        assertThat(entitlements.has(freeId, "filters.advanced")).isFalse();
    }

    @Test
    void capsCompareTheRequestedValue() {
        String user = uniqueUid("limits-cap");
        provisionCompliant(user);
        String uri = "/api/v1/test-probes/limits/map.radius.max_km/value?requested=";
        JsonNode within = callJson(HttpMethod.GET, uri + "25", user, null, 200);
        assertThat(within.path("limit").asInt()).isEqualTo(25);
        JsonNode beyond = callJson(HttpMethod.GET, uri + "30", user, null, 429);
        assertThat(beyond.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(beyond.path("limitKey").asString()).isEqualTo("map.radius.max_km");
        assertThat(beyond.path("used").asLong()).isEqualTo(30);
        assertThat(beyond.has("resetsAt")).isFalse();
    }

    @Test
    void adminPlanEndpointsEnforceRolesAndValidate() {
        String collector = uniqueUid("limits-collector");
        UUID collectorId = provisionCompliant(collector);
        String admin = uniqueUid("limits-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String superAdmin = uniqueUid("limits-admin-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String limitUri = "/api/v1/admin/usage-limits/" + limitId("FREE", VIEWS);

        callJson(HttpMethod.GET, "/api/v1/admin/plans", null, null, 401);
        callJson(HttpMethod.GET, "/api/v1/admin/plans", collector, null, 403);
        JsonNode plans = callJson(HttpMethod.GET, "/api/v1/admin/plans", admin, null, 200);
        assertThat(plans.get(0).path("limits").get(0).has("id")).isTrue();
        JsonNode freeLimits =
                callJson(HttpMethod.GET, "/api/v1/admin/usage-limits?plan=FREE", admin, null, 200);
        assertThat(freeLimits.size()).isEqualTo(7);
        freeLimits.forEach(
                limit -> assertThat(limit.path("planCode").asString()).isEqualTo("FREE"));
        callJson(HttpMethod.GET, "/api/v1/admin/usage-limits?plan=free", admin, null, 400);

        Map<String, Object> thirty = Map.of("unlimited", false, "maxValue", 30);
        callJson(HttpMethod.PUT, limitUri, admin, thirty, 403);
        callJson(HttpMethod.PUT, limitUri, collector, thirty, 403);
        callJson(HttpMethod.PUT, limitUri, superAdmin, Map.of("unlimited", false), 400);
        callJson(
                HttpMethod.PUT,
                limitUri,
                superAdmin,
                Map.of("unlimited", true, "maxValue", 3),
                400);
        callJson(
                HttpMethod.PUT,
                limitUri,
                superAdmin,
                Map.of("unlimited", false, "maxValue", -1),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/usage-limits/" + limitId("FREE", "map.radius.max_km"),
                superAdmin,
                Map.of("unlimited", false, "maxValue", 30, "window", "DAY"),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/usage-limits/" + UUID.randomUUID(),
                superAdmin,
                thirty,
                404);
        JsonNode updated = callJson(HttpMethod.PUT, limitUri, superAdmin, thirty, 200);
        assertThat(updated.path("maxValue").asInt()).isEqualTo(30);
        assertThat(updated.path("unlimited").asBoolean()).isFalse();

        // Plans: SUPER_ADMIN edits, FREE cannot be disabled, public listing follows.
        Map<String, Object> premium = new HashMap<>();
        premium.put("name", "Premium");
        premium.put("description", "Everything, unlimited.");
        premium.put("monthlyPrice", 5.49);
        premium.put("currency", "CAD");
        premium.put("active", true);
        premium.put("sortOrder", 10);
        premium.put("features", List.of(Map.of("key", "filters.advanced", "enabled", true)));
        callJson(HttpMethod.PUT, "/api/v1/admin/plans/PREMIUM", admin, premium, 403);
        JsonNode changed =
                callJson(HttpMethod.PUT, "/api/v1/admin/plans/PREMIUM", superAdmin, premium, 200);
        assertThat(changed.path("monthlyPrice").decimalValue()).isEqualByComparingTo("5.49");
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/plans", null, null, 200)
                                .get(1)
                                .path("monthlyPrice")
                                .decimalValue())
                .isEqualByComparingTo("5.49");
        Map<String, Object> disableFree = new HashMap<>(premium);
        disableFree.put("name", "Free");
        disableFree.put("monthlyPrice", 0);
        disableFree.put("active", false);
        callJson(HttpMethod.PUT, "/api/v1/admin/plans/FREE", superAdmin, disableFree, 400);
        callJson(HttpMethod.PUT, "/api/v1/admin/plans/GOLD", superAdmin, premium, 404);
        premium.put("currency", "cad");
        callJson(HttpMethod.PUT, "/api/v1/admin/plans/PREMIUM", superAdmin, premium, 400);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action = 'plan.update' AND"
                                        + " target_id = 'PREMIUM'"))
                .isGreaterThanOrEqualTo(1);

        // Entitlement validation.
        String entitlementsUri = "/api/v1/admin/users/" + collectorId + "/entitlements";
        callJson(
                HttpMethod.POST, entitlementsUri, admin, Map.of("featureKey", "nope.nothing"), 400);
        callJson(
                HttpMethod.POST,
                entitlementsUri,
                admin,
                Map.of("featureKey", VIEWS, "value", "lots"),
                400);
        callJson(
                HttpMethod.POST,
                entitlementsUri,
                admin,
                Map.of("featureKey", "filters.advanced", "value", "maybe"),
                400);
        callJson(
                HttpMethod.POST,
                entitlementsUri,
                admin,
                Map.of("featureKey", VIEWS, "expiresAt", "2020-01-01T00:00:00Z"),
                400);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + UUID.randomUUID() + "/entitlements",
                admin,
                Map.of("featureKey", VIEWS),
                404);
        JsonNode numeric =
                callJson(
                        HttpMethod.POST,
                        entitlementsUri,
                        admin,
                        Map.of("featureKey", VIEWS, "value", "45"),
                        201);
        assertThat(numeric.path("value").asString()).isEqualTo("45");
        assertThat(
                        limitOf(
                                        callJson(
                                                HttpMethod.GET,
                                                "/api/v1/me/plan",
                                                collector,
                                                null,
                                                200),
                                        VIEWS)
                                .path("limit")
                                .asInt())
                .isEqualTo(45);
        callJson(HttpMethod.GET, "/api/v1/me/plan", null, null, 401);
    }
}
