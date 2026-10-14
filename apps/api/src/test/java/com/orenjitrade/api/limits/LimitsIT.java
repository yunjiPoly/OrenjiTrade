package com.orenjitrade.api.limits;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Usage limits since stage F1 (ADR 0014, ADR 0019 "free for all"): the same caps for every
 * collector with today's numbers, {@code GET /me/limits}, the plain {@code 429 LIMIT_REACHED} (no
 * plan, no upgrade link), live admin edits that reach everyone at once, caps, authorization and
 * validation, and the routes of the removed paid features answering 404.
 */
class LimitsIT extends AbstractIntegrationTest {

    static final String VIEWS = "binder.views.per_day";
    static final String CONSUME_VIEWS = "/api/v1/test-probes/limits/" + VIEWS + "/consume";

    /**
     * No CAP limit is seeded since the map radius was removed (ADR 0017); the cap mechanism stays
     * in {@code Limits}, so the tests insert a cap of 25 under this key and drop it after.
     */
    static final String TEST_CAP = "test.cap.probe";

    /** Today's numbers (the FREE plan's before stage F1), for every collector. */
    static final Map<String, @Nullable Integer> LIMITS = new LinkedHashMap<>();

    static {
        LIMITS.put("binder.views.per_day", 30);
        LIMITS.put("binders.max", 5);
        LIMITS.put("inventory.items.max", null);
        LIMITS.put("offers.per_day", 20);
        LIMITS.put("saved_searches.max", 0);
        LIMITS.put("wishlist.alerts.per_day", 5);
        LIMITS.put("wishlist.items.max", 20);
    }

    @Autowired private UsageLimitService usageLimits;

    @AfterEach
    void restoreMigrationValues() {
        testUsers.update("DELETE FROM usage_limit WHERE limit_key = ?", TEST_CAP);
        testUsers.update(
                "UPDATE usage_limit SET max_value = 30, limit_window = 'DAY', updated_by = NULL"
                        + " WHERE limit_key = ?",
                VIEWS);
        usageLimits.invalidate();
    }

    private void insertTestCap() {
        testUsers.update(
                "INSERT INTO usage_limit (limit_key, kind, limit_window, max_value)"
                        + " VALUES (?, 'CAP', 'TOTAL', 25)",
                TEST_CAP);
        usageLimits.invalidate();
    }

    private UUID limitId(String key) {
        return (UUID)
                testUsers
                        .query("SELECT id FROM usage_limit WHERE limit_key = ?", key)
                        .get(0)
                        .get("id");
    }

    private void setViews(String superAdmin, @Nullable Integer max) {
        Map<String, Object> body = new HashMap<>();
        body.put("unlimited", max == null);
        if (max != null) {
            body.put("maxValue", max);
        }
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/usage-limits/" + limitId(VIEWS),
                superAdmin,
                body,
                200);
    }

    private static JsonNode limitOf(JsonNode myLimits, String key) {
        for (JsonNode limit : myLimits.path("limits")) {
            if (limit.path("key").asString().equals(key)) {
                return limit;
            }
        }
        throw new AssertionError("no limit " + key + " in " + myLimits);
    }

    private static Map<String, @Nullable Integer> numbers(JsonNode myLimits) {
        Map<String, @Nullable Integer> numbers = new LinkedHashMap<>();
        myLimits.path("limits")
                .forEach(
                        limit ->
                                numbers.put(
                                        limit.path("key").asString(),
                                        limit.has("limit") && !limit.path("limit").isNull()
                                                ? limit.path("limit").asInt()
                                                : null));
        return numbers;
    }

    @Test
    void everyCollectorHasTheSameLimitsAndNoPlan() {
        String first = uniqueUid("limits-first");
        provisionCompliant(first);
        String second = uniqueUid("limits-second");
        provisionCompliant(second);

        JsonNode mine = callJson(HttpMethod.GET, "/api/v1/me/limits", first, null, 200);
        JsonNode theirs = callJson(HttpMethod.GET, "/api/v1/me/limits", second, null, 200);
        assertThat(numbers(mine)).containsExactlyInAnyOrderEntriesOf(LIMITS);
        assertThat(numbers(theirs)).containsExactlyInAnyOrderEntriesOf(LIMITS);
        assertThat(mine.toString())
                .doesNotContain("planCode")
                .doesNotContain("upgradeUrl")
                .doesNotContain("overridden")
                .doesNotContain("premium")
                .doesNotContain("map.radius");

        JsonNode views = limitOf(mine, VIEWS);
        assertThat(views.path("window").asString()).isEqualTo("DAY");
        assertThat(views.path("used").asLong()).isZero();
        assertThat(Instant.parse(views.path("resetsAt").asString()))
                .isEqualTo(Instant.now().truncatedTo(ChronoUnit.DAYS).plus(1, ChronoUnit.DAYS));
        JsonNode binders = limitOf(mine, "binders.max");
        assertThat(binders.path("window").asString()).isEqualTo("TOTAL");
        assertThat(binders.has("resetsAt")).isFalse();

        // /me has no plan any more.
        assertThat(callJson(HttpMethod.GET, "/api/v1/me", first, null, 200).has("plan")).isFalse();
        callJson(HttpMethod.GET, "/api/v1/me/limits", null, null, 401);
    }

    @Test
    void aReachedLimitAnswers429WithoutAPlanAndAdminEditsReachEveryoneAtOnce() {
        String superAdmin = uniqueUid("limits-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String user = uniqueUid("limits-user");
        provisionCompliant(user);
        String other = uniqueUid("limits-other");
        provisionCompliant(other);
        Instant resetsAt = Instant.now().truncatedTo(ChronoUnit.DAYS).plus(1, ChronoUnit.DAYS);

        setViews(superAdmin, 3);
        for (int i = 1; i <= 3; i++) {
            JsonNode decision = callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 200);
            assertThat(decision.path("used").asLong()).isEqualTo(i);
            assertThat(decision.path("remaining").asLong()).isEqualTo(3 - i);
            assertThat(decision.path("limit").asInt()).isEqualTo(3);
        }
        JsonNode reached = callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 429);
        assertThat(reached.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(reached.path("message").asString())
                .isEqualTo("You have reached the limit for this action");
        assertThat(reached.path("limitKey").asString()).isEqualTo(VIEWS);
        assertThat(reached.path("limit").asInt()).isEqualTo(3);
        assertThat(reached.path("used").asLong()).isEqualTo(3);
        assertThat(Instant.parse(reached.path("resetsAt").asString())).isEqualTo(resetsAt);
        assertThat(reached.path("requestId").asString()).isNotEmpty();
        assertThat(reached.has("planCode")).isFalse();
        assertThat(reached.has("upgradeUrl")).isFalse();

        JsonNode afterLimit =
                limitOf(callJson(HttpMethod.GET, "/api/v1/me/limits", user, null, 200), VIEWS);
        assertThat(afterLimit.path("used").asLong()).isEqualTo(3);
        assertThat(afterLimit.path("allowed").asBoolean()).isFalse();
        assertThat(afterLimit.path("remaining").asLong()).isZero();
        // The same number for the other collector, who has used nothing yet.
        JsonNode others =
                limitOf(callJson(HttpMethod.GET, "/api/v1/me/limits", other, null, 200), VIEWS);
        assertThat(others.path("limit").asInt()).isEqualTo(3);
        assertThat(others.path("allowed").asBoolean()).isTrue();

        // Live edit: raising the limit takes effect immediately (cache evicted), for everyone.
        setViews(superAdmin, 5);
        assertThat(callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 200).path("used").asLong())
                .isEqualTo(4);
        assertThat(
                        limitOf(
                                        callJson(
                                                HttpMethod.GET,
                                                "/api/v1/me/limits",
                                                other,
                                                null,
                                                200),
                                        VIEWS)
                                .path("limit")
                                .asInt())
                .isEqualTo(5);
        // Unlimited.
        setViews(superAdmin, null);
        JsonNode unlimited = callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 200);
        assertThat(unlimited.has("limit")).isFalse();
        assertThat(unlimited.path("used").asLong()).isEqualTo(5);
        // Zero blocks at once.
        setViews(superAdmin, 0);
        assertThat(callJson(HttpMethod.POST, CONSUME_VIEWS, user, null, 429).path("limit").asInt())
                .isZero();
        assertThat(callJson(HttpMethod.POST, CONSUME_VIEWS, other, null, 429).path("limit").asInt())
                .isZero();

        List<Map<String, Object>> audit =
                testUsers.query(
                        "SELECT details::text AS details FROM audit_log WHERE action ="
                                + " 'usage_limit.update' AND target_id = ? ORDER BY occurred_at",
                        limitId(VIEWS).toString());
        assertThat(audit).hasSizeGreaterThanOrEqualTo(4);
        String last = (String) audit.get(audit.size() - 1).get("details");
        assertThat(last).contains("\"maxValue\": 0").contains("\"limitKey\": \"" + VIEWS + "\"");
        assertThat(last).doesNotContain("\"plan\"");
    }

    @Test
    void capsCompareTheRequestedValue() {
        String user = uniqueUid("limits-cap");
        provisionCompliant(user);
        insertTestCap();
        JsonNode cap =
                limitOf(callJson(HttpMethod.GET, "/api/v1/me/limits", user, null, 200), TEST_CAP);
        assertThat(cap.path("kind").asString()).isEqualTo("CAP");
        assertThat(cap.path("limit").asInt()).isEqualTo(25);
        assertThat(cap.has("resetsAt")).isFalse();
        String uri = "/api/v1/test-probes/limits/" + TEST_CAP + "/value?requested=";
        JsonNode within = callJson(HttpMethod.GET, uri + "25", user, null, 200);
        assertThat(within.path("limit").asInt()).isEqualTo(25);
        JsonNode beyond = callJson(HttpMethod.GET, uri + "30", user, null, 429);
        assertThat(beyond.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(beyond.path("limitKey").asString()).isEqualTo(TEST_CAP);
        assertThat(beyond.path("used").asLong()).isEqualTo(30);
        assertThat(beyond.has("resetsAt")).isFalse();
    }

    @Test
    void adminUsageLimitEndpointsEnforceRolesAndValidate() {
        String collector = uniqueUid("limits-collector");
        provisionCompliant(collector);
        String admin = uniqueUid("limits-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String superAdmin = uniqueUid("limits-admin-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String limitUri = "/api/v1/admin/usage-limits/" + limitId(VIEWS);

        callJson(HttpMethod.GET, "/api/v1/admin/usage-limits", null, null, 401);
        callJson(HttpMethod.GET, "/api/v1/admin/usage-limits", collector, null, 403);
        JsonNode list = callJson(HttpMethod.GET, "/api/v1/admin/usage-limits", admin, null, 200);
        // One row per key, the numbers every collector gets.
        Map<String, @Nullable Integer> listed = new LinkedHashMap<>();
        list.forEach(
                limit -> {
                    assertThat(limit.has("planCode")).isFalse();
                    assertThat(limit.path("id").asString()).isNotBlank();
                    listed.put(
                            limit.path("key").asString(),
                            limit.path("unlimited").asBoolean()
                                    ? null
                                    : limit.path("maxValue").asInt());
                });
        assertThat(listed).containsExactlyInAnyOrderEntriesOf(LIMITS);

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
        insertTestCap();
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/usage-limits/" + limitId(TEST_CAP),
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
        assertThat(updated.has("planCode")).isFalse();
    }

    @Test
    void theRoutesOfTheRemovedPaidFeaturesAreGone() {
        String collector = uniqueUid("limits-gone");
        provisionCompliant(collector);
        String admin = uniqueUid("limits-gone-admin");
        provisionWithRoles(admin, Role.SUPER_ADMIN);
        List<String> failures = new ArrayList<>();
        for (String path :
                List.of(
                        "/api/v1/plans",
                        "/api/v1/me/plan",
                        "/api/v1/me/credits",
                        "/api/v1/me/referrals",
                        "/api/v1/me/donations",
                        "/api/v1/ads?placement=MAP_PANEL",
                        "/api/v1/billing/fake/fake_cs_1",
                        "/api/v1/donations/fake/fake_dn_1")) {
            expectNotFound(HttpMethod.GET, path, collector, failures);
        }
        for (String path :
                List.of(
                        "/api/v1/me/subscription/checkout",
                        "/api/v1/me/credits/spend",
                        "/api/v1/me/referrals/redeem",
                        "/api/v1/donations/checkout")) {
            expectNotFound(HttpMethod.POST, path, collector, failures);
        }
        for (String path :
                List.of(
                        "/api/v1/admin/plans",
                        "/api/v1/admin/subscriptions",
                        "/api/v1/admin/credits/ledger",
                        "/api/v1/admin/ads/campaigns",
                        "/api/v1/admin/donations")) {
            expectNotFound(HttpMethod.GET, path, admin, failures);
        }
        expectNotFound(HttpMethod.GET, "/api/v1/public/donations/supporters", null, failures);
        assertThat(failures).as("removed routes answering something else than 404").isEmpty();
        // The provider webhooks are no longer public routes.
        assertThat(
                        call(HttpMethod.POST, "/api/v1/webhooks/billing/fake", null, Map.of())
                                .getStatus()
                                .value())
                .isEqualTo(401);
        assertThat(
                        call(HttpMethod.POST, "/api/v1/webhooks/donations/fake", null, Map.of())
                                .getStatus()
                                .value())
                .isEqualTo(401);
    }

    private void expectNotFound(
            HttpMethod method, String path, @Nullable String uid, List<String> failures) {
        int status =
                call(method, path, uid, method == HttpMethod.POST ? Map.of() : null)
                        .getStatus()
                        .value();
        if (status != 404) {
            failures.add(method + " " + path + ": " + status);
        }
    }
}
