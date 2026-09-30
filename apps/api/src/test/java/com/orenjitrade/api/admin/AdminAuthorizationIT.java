package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;

/**
 * The admin console RBAC matrix (Phase 7 contract "Admin console"): MODERATOR reaches Reports,
 * Moderation, Community and Ratings; ADMIN everything but the SUPER_ADMIN writes (feature flags,
 * plans, usage limits, broadcasts); SUPER_ADMIN everything. Anonymous callers get 401, plain
 * collectors 403. Every route is called with a harmless request (unknown ids, invalid values) so a
 * permitted caller gets anything but 401/403 without changing data.
 */
class AdminAuthorizationIT extends AbstractIntegrationTest {

    /** The least role a route needs. */
    enum Level {
        MODERATOR,
        ADMIN,
        SUPER_ADMIN
    }

    record Route(HttpMethod method, String path, @Nullable Object body, Level level) {

        @Override
        public String toString() {
            return method + " " + path;
        }
    }

    static List<Route> routes() {
        String id = UUID.randomUUID().toString();
        List<Route> routes = new ArrayList<>();
        // --- Moderation subset (MODERATOR+) ---------------------------------------------------
        routes.add(get("/api/v1/admin/community/channels", Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/community/posts/" + id + "/remove",
                        Map.of("reason", "x"),
                        Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/community/replies/" + id + "/remove",
                        Map.of("reason", "x"),
                        Level.MODERATOR));
        routes.add(get("/api/v1/admin/moderation/flags", Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/moderation/flags/" + id + "/resolve",
                        Map.of(),
                        Level.MODERATOR));
        routes.add(get("/api/v1/admin/moderation/rules", Level.MODERATOR));
        routes.add(get("/api/v1/admin/reports", Level.MODERATOR));
        routes.add(get("/api/v1/admin/reports/" + id, Level.MODERATOR));
        routes.add(post("/api/v1/admin/reports/" + id + "/assign", null, Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/reports/" + id + "/notes",
                        Map.of("body", "note"),
                        Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/reports/" + id + "/resolve",
                        Map.of("status", "DISMISSED", "action", "NONE", "note", "x"),
                        Level.MODERATOR));
        routes.add(get("/api/v1/admin/ratings", Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/ratings/" + id + "/hide",
                        Map.of("reason", "x"),
                        Level.MODERATOR));
        routes.add(post("/api/v1/admin/ratings/" + id + "/unhide", null, Level.MODERATOR));
        routes.add(
                post(
                        "/api/v1/admin/references/" + id + "/hide",
                        Map.of("reason", "x"),
                        Level.MODERATOR));
        routes.add(post("/api/v1/admin/references/" + id + "/unhide", null, Level.MODERATOR));
        // Moderation rules: read by moderators, changed by admins (service rule).
        Map<String, Object> invalidRule = new LinkedHashMap<>();
        invalidRule.put("kind", "BANNED_TERM");
        invalidRule.put("pattern", "x");
        invalidRule.put("action", "FLAG");
        invalidRule.put("scope", "REPORT");
        routes.add(post("/api/v1/admin/moderation/rules", invalidRule, Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/moderation/rules/" + id,
                        Map.of("active", true),
                        Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.DELETE,
                        "/api/v1/admin/moderation/rules/" + id,
                        null,
                        Level.ADMIN));
        // --- ADMIN ---------------------------------------------------------------------------
        routes.add(get("/api/v1/admin/dashboard", Level.ADMIN));
        routes.add(get("/api/v1/admin/system/health", Level.ADMIN));
        routes.add(get("/api/v1/admin/users", Level.ADMIN));
        routes.add(get("/api/v1/admin/users/" + id, Level.ADMIN));
        routes.add(get("/api/v1/admin/users/" + id + "/history", Level.ADMIN));
        routes.add(get("/api/v1/admin/users/" + id + "/listing-status", Level.ADMIN));
        routes.add(get("/api/v1/admin/users/" + id + "/entitlements", Level.ADMIN));
        routes.add(
                post("/api/v1/admin/users/" + id + "/suspend", Map.of("reason", "x"), Level.ADMIN));
        routes.add(post("/api/v1/admin/users/" + id + "/unsuspend", null, Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/users/" + id + "/roles",
                        Map.of("roles", List.of("USER")),
                        Level.ADMIN));
        routes.add(
                post(
                        "/api/v1/admin/users/" + id + "/pause-listings",
                        Map.of("reason", "x"),
                        Level.ADMIN));
        routes.add(post("/api/v1/admin/users/" + id + "/resume-listings", null, Level.ADMIN));
        routes.add(get("/api/v1/admin/audit-logs", Level.ADMIN));
        routes.add(get("/api/v1/admin/delist-policies", Level.ADMIN));
        Map<String, Object> policy = new LinkedHashMap<>();
        policy.put("agingAfterDays", 15);
        policy.put("staleAfterDays", 31);
        policy.put("hiddenAfterDays", 46);
        policy.put("warnBeforeHiddenDays", 5);
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/delist-policies/" + id,
                        policy,
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/listings", Level.ADMIN));
        routes.add(get("/api/v1/admin/listings/stale", Level.ADMIN));
        routes.add(post("/api/v1/admin/listings/" + id + "/restore", null, Level.ADMIN));
        routes.add(
                post("/api/v1/admin/listings/" + id + "/hide", Map.of("reason", "x"), Level.ADMIN));
        routes.add(get("/api/v1/admin/binders", Level.ADMIN));
        routes.add(
                post(
                        "/api/v1/admin/binders/" + id + "/unpublish",
                        Map.of("reason", "x"),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/notifications/stats", Level.ADMIN));
        routes.add(get("/api/v1/admin/analytics/summary", Level.ADMIN));
        routes.add(get("/api/v1/admin/feature-flags", Level.ADMIN));
        routes.add(get("/api/v1/admin/plans", Level.ADMIN));
        routes.add(get("/api/v1/admin/usage-limits", Level.ADMIN));
        routes.add(get("/api/v1/admin/games", Level.ADMIN));
        routes.add(get("/api/v1/admin/catalog/providers", Level.ADMIN));
        routes.add(get("/api/v1/admin/catalog/sync-runs", Level.ADMIN));
        // Phase 9: transactions, disputes, payments, webhooks, settings (read).
        routes.add(get("/api/v1/admin/transactions", Level.ADMIN));
        routes.add(get("/api/v1/admin/transactions/pending-shipment", Level.ADMIN));
        routes.add(get("/api/v1/admin/transactions/pending-confirmation", Level.ADMIN));
        routes.add(get("/api/v1/admin/disputes", Level.ADMIN));
        routes.add(get("/api/v1/admin/disputes/" + id, Level.ADMIN));
        routes.add(
                post(
                        "/api/v1/admin/disputes/" + id + "/freeze",
                        Map.of("reason", "x"),
                        Level.ADMIN));
        routes.add(post("/api/v1/admin/disputes/" + id + "/unfreeze", null, Level.ADMIN));
        routes.add(
                post("/api/v1/admin/disputes/" + id + "/notes", Map.of("body", "x"), Level.ADMIN));
        routes.add(
                post(
                        "/api/v1/admin/disputes/" + id + "/resolve",
                        Map.of("outcome", "SELLER", "note", "x"),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/payments", Level.ADMIN));
        routes.add(get("/api/v1/admin/payments/" + id, Level.ADMIN));
        routes.add(get("/api/v1/admin/payments/webhooks", Level.ADMIN));
        routes.add(get("/api/v1/admin/payments/webhooks/" + id, Level.ADMIN));
        routes.add(get("/api/v1/admin/payments/settings", Level.ADMIN));
        // Phase 10: subscriptions, credits, ads, donations (reads and harmless writes).
        routes.add(get("/api/v1/admin/subscriptions", Level.ADMIN));
        routes.add(get("/api/v1/admin/subscriptions/" + id, Level.ADMIN));
        routes.add(
                post(
                        "/api/v1/admin/subscriptions/" + id + "/cancel",
                        Map.of("immediately", false),
                        Level.ADMIN));
        routes.add(
                post(
                        "/api/v1/admin/credits/grant",
                        Map.of("userId", id, "amount", 1, "reason", "ADMIN"),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/credits/ledger", Level.ADMIN));
        routes.add(get("/api/v1/admin/credits/products", Level.ADMIN));
        routes.add(get("/api/v1/admin/credits/settings", Level.ADMIN));
        routes.add(get("/api/v1/admin/ads/advertisers", Level.ADMIN));
        routes.add(post("/api/v1/admin/ads/advertisers", Map.of("name", ""), Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/ads/advertisers/" + id,
                        Map.of("name", "x"),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/ads/placements", Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/ads/placements/MAP_PANEL",
                        Map.of("name", "", "active", true, "maxAds", 1),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/ads/campaigns", Level.ADMIN));
        routes.add(post("/api/v1/admin/ads/campaigns", Map.of(), Level.ADMIN));
        routes.add(get("/api/v1/admin/ads/campaigns/" + id, Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/ads/campaigns/" + id,
                        Map.of(),
                        Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/ads/campaigns/" + id + "/targeting",
                        Map.of("rules", List.of()),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/ads/campaigns/" + id + "/stats", Level.ADMIN));
        routes.add(post("/api/v1/admin/ads/campaigns/" + id + "/creatives", Map.of(), Level.ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/ads/creatives/" + id,
                        Map.of(),
                        Level.ADMIN));
        routes.add(get("/api/v1/admin/donations", Level.ADMIN));
        routes.add(get("/api/v1/admin/donations/" + id, Level.ADMIN));
        routes.add(get("/api/v1/admin/donations/settings", Level.ADMIN));
        // --- SUPER_ADMIN (service rules; unknown keys answer 404 to a SUPER_ADMIN) ------------
        // Refunds: SUPER_ADMIN unless payments.admin_refunds_enabled (off by default).
        routes.add(
                post(
                        "/api/v1/admin/payments/" + id + "/refund",
                        Map.of("amount", 1, "reason", "x"),
                        Level.SUPER_ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/payments/settings",
                        Map.of(),
                        Level.SUPER_ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/feature-flags/noSuchFlag",
                        Map.of("enabled", true),
                        Level.SUPER_ADMIN));
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("name", "Nope");
        plan.put("monthlyPrice", 1);
        plan.put("currency", "CAD");
        plan.put("active", true);
        plan.put("sortOrder", 1);
        routes.add(new Route(HttpMethod.PUT, "/api/v1/admin/plans/NOPE", plan, Level.SUPER_ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/usage-limits/" + id,
                        Map.of("unlimited", true),
                        Level.SUPER_ADMIN));
        // Phase 10 SUPER_ADMIN writes (validated after the role check: harmless 4xx for them).
        Map<String, Object> product = new LinkedHashMap<>();
        product.put("name", "x");
        product.put("cost", 1);
        product.put("durationHours", 1);
        product.put("active", true);
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/credits/products/no_such_product",
                        product,
                        Level.SUPER_ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/credits/settings",
                        Map.of("referrerReward", -1),
                        Level.SUPER_ADMIN));
        routes.add(
                new Route(
                        HttpMethod.PUT,
                        "/api/v1/admin/donations/settings",
                        Map.of("minAmount", "0.01"),
                        Level.SUPER_ADMIN));
        routes.add(post("/api/v1/admin/donations/" + id + "/refund", null, Level.SUPER_ADMIN));
        Map<String, Object> broadcast = new LinkedHashMap<>();
        broadcast.put("title", "Maintenance");
        broadcast.put("body", "Tonight");
        broadcast.put("audience", "STAFF");
        broadcast.put("deepLink", "not-an-app-path");
        routes.add(post("/api/v1/admin/notifications/broadcast", broadcast, Level.SUPER_ADMIN));
        return routes;
    }

    @Test
    void theRoleMatrixHoldsOnEveryAdminRoute() {
        String collector = uniqueUid("rbac7-user");
        provisionCompliant(collector);
        String moderator = uniqueUid("rbac7-mod");
        provisionWithRoles(moderator, Role.MODERATOR);
        String admin = uniqueUid("rbac7-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String superAdmin = uniqueUid("rbac7-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);

        List<String> failures = new ArrayList<>();
        for (Route route : routes()) {
            expect(route, null, 401, failures);
            expect(route, collector, 403, failures);
            expect(route, moderator, route.level() == Level.MODERATOR ? null : 403, failures);
            expect(route, admin, route.level() == Level.SUPER_ADMIN ? 403 : null, failures);
            expect(route, superAdmin, null, failures);
        }
        assertThat(failures).as("RBAC matrix violations").isEmpty();
    }

    @Test
    void superAdminsBroadcastToStaffAndTheBroadcastIsAudited() {
        String superAdmin = uniqueUid("rbac7-super2");
        UUID superAdminId = provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String moderator = uniqueUid("rbac7-mod2");
        UUID moderatorId = provisionWithRoles(moderator, Role.MODERATOR);
        String collector = uniqueUid("rbac7-user2");
        UUID collectorId = provisionCompliant(collector);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Staff meeting");
        body.put("body", "Moderator sync at noon");
        body.put("audience", "STAFF");
        body.put("deepLink", "/admin");
        var answer =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/notifications/broadcast",
                        superAdmin,
                        body,
                        200);
        assertThat(answer.path("audience").asString()).isEqualTo("STAFF");
        assertThat(answer.path("recipients").asInt()).isGreaterThanOrEqualTo(2);
        String broadcastId = answer.path("broadcastId").asString();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ? AND type ="
                                        + " 'SYSTEM' AND data ->> 'broadcastId' = ?",
                                moderatorId,
                                broadcastId))
                .isEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ? AND data ->>"
                                        + " 'broadcastId' = ?",
                                collectorId,
                                broadcastId))
                .as("STAFF broadcasts skip collectors")
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action ="
                                        + " 'notification.broadcast' AND target_id = ? AND"
                                        + " actor_user_id = ?",
                                broadcastId,
                                superAdminId))
                .isEqualTo(1);
    }

    /**
     * Calls the route as {@code uid} ({@code null} = anonymous) and records a failure unless the
     * status is {@code expected} (or, with {@code null}, anything but 401 and 403).
     */
    private void expect(
            Route route, @Nullable String uid, @Nullable Integer expected, List<String> failures) {
        EntityExchangeResult<byte[]> result = call(route.method(), route.path(), uid, route.body());
        int status = result.getStatus().value();
        boolean ok = expected == null ? status != 401 && status != 403 : status == expected;
        if (!ok) {
            byte[] body = result.getResponseBody();
            failures.add(
                    route
                            + " as "
                            + (uid == null ? "anonymous" : uid)
                            + ": "
                            + status
                            + " (expected "
                            + (expected == null ? "not 401/403" : expected)
                            + ") "
                            + (body == null ? "" : new String(body, StandardCharsets.UTF_8)));
        }
    }

    private static Route get(String path, Level level) {
        return new Route(HttpMethod.GET, path, null, level);
    }

    private static Route post(String path, @Nullable Object body, Level level) {
        return new Route(HttpMethod.POST, path, body, level);
    }
}
