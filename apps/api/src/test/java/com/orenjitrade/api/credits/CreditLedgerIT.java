package com.orenjitrade.api.credits;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.AbstractPhase10IT;
import com.orenjitrade.api.credits.domain.CreditProducts;
import com.orenjitrade.api.credits.infra.CreditBalanceCache;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 credits: the ledger is append-only in the database (UPDATE, DELETE and TRUNCATE are
 * refused by a trigger), the balance is the sum of the entries (also after the cache was corrupted
 * and reconciled), spends are idempotent per key and unlock stacked time-boxed entitlements, admin
 * grants and adjustments are audited and never go below zero, and credit products are data edited
 * by super admins.
 */
class CreditLedgerIT extends AbstractPhase10IT {

    @Autowired private StringRedisTemplate redis;

    @Autowired private CreditProducts products;

    @Test
    void theLedgerIsAppendOnlyInTheDatabase() {
        Member member = member("credit-append");
        String admin = staff("credit-append-admin", Role.ADMIN);
        String entryId = grant(admin, member.id(), 40, "PROMO", 200).path("id").asString();

        assertThatThrownBy(
                        () ->
                                testUsers.update(
                                        "UPDATE credit_ledger_entry SET amount = 999 WHERE id ="
                                                + " ?::uuid",
                                        entryId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("append-only");
        assertThatThrownBy(
                        () ->
                                testUsers.update(
                                        "DELETE FROM credit_ledger_entry WHERE id = ?::uuid",
                                        entryId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("append-only");
        assertThatThrownBy(() -> testUsers.update("TRUNCATE credit_ledger_entry"))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("append-only");
        assertThat(
                        testUsers.count(
                                "SELECT amount FROM credit_ledger_entry WHERE id = ?::uuid",
                                entryId))
                .isEqualTo(40);
    }

    @Test
    void theBalanceIsTheSumAndSpendsAreIdempotentAndUnlockStackedEntitlements() {
        Member member = member("credit-spend");
        String admin = staff("credit-spend-admin", Role.ADMIN);
        grant(admin, member.id(), 100, "PROMO", 200);

        JsonNode credits = credits(member);
        assertThat(credits.path("balance").asLong()).isEqualTo(100);
        assertThat(credits.path("withdrawable").asBoolean()).isFalse();
        assertThat(credits.path("transferable").asBoolean()).isFalse();
        assertThat(credits.path("entries").path("items").size()).isEqualTo(1);
        assertThat(credits.path("entries").path("items").get(0).path("type").asString())
                .isEqualTo("GRANT");
        assertThat(credits.path("entries").path("items").get(0).has("note"))
                .as("admin notes stay internal")
                .isFalse();
        JsonNode product = product(credits, "premium_search_day");
        assertThat(product.path("cost").asInt()).isEqualTo(50);
        assertThat(product.path("featureKey").asString()).isEqualTo("filters.advanced");

        String key = UUID.randomUUID().toString();
        JsonNode spent = spend(member, "premium_search_day", key, 200);
        assertThat(spent.path("duplicate").asBoolean()).isFalse();
        assertThat(spent.path("balance").asLong()).isEqualTo(50);
        assertThat(spent.path("entry").path("amount").asInt()).isEqualTo(-50);
        assertThat(spent.path("entry").path("product").asString()).isEqualTo("premium_search_day");
        assertThat(spent.path("entitlement").path("featureKey").asString())
                .isEqualTo("filters.advanced");
        Instant firstExpiry = Instant.parse(spent.path("entitlement").path("expiresAt").asString());
        assertThat(firstExpiry)
                .isBetween(
                        Instant.now().plus(Duration.ofHours(23)),
                        Instant.now().plus(Duration.ofHours(25)));

        JsonNode replay = spend(member, "premium_search_day", key, 200);
        assertThat(replay.path("duplicate").asBoolean()).isTrue();
        assertThat(replay.path("entry").path("id").asString())
                .isEqualTo(spent.path("entry").path("id").asString());
        assertThat(replay.path("balance").asLong()).isEqualTo(50);
        JsonNode reused = spend(member, "binder_views_day", key, 409);
        assertThat(errorCode(reused)).isEqualTo("CONFLICT");

        JsonNode plan = callJson(HttpMethod.GET, "/api/v1/me/plan", member.uid(), null, 200);
        assertThat(plan.path("features").path("filters.advanced").asBoolean()).isTrue();
        assertThat(plan.path("entitlements").toString()).contains("CREDIT_PURCHASE");

        // A second day stacks after the first one.
        JsonNode second = spend(member, "premium_search_day", UUID.randomUUID().toString(), 200);
        assertThat(second.path("balance").asLong()).isZero();
        assertThat(Instant.parse(second.path("entitlement").path("expiresAt").asString()))
                .isEqualTo(firstExpiry.plus(Duration.ofHours(24)));

        JsonNode broke = spend(member, "premium_search_day", UUID.randomUUID().toString(), 409);
        assertThat(errorCode(broke)).isEqualTo("INSUFFICIENT_CREDITS");
        assertThat(broke.path("balance").asLong()).isZero();
        assertThat(broke.path("cost").asLong()).isEqualTo(50);

        // balance = SUM(amount) = balance_after of the latest entry.
        assertThat(
                        testUsers.count(
                                "SELECT COALESCE(SUM(amount), 0) FROM credit_ledger_entry WHERE"
                                        + " user_id = ?",
                                member.id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT balance_after FROM credit_ledger_entry WHERE user_id = ?"
                                        + " ORDER BY seq DESC LIMIT 1",
                                member.id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM credit_ledger_entry WHERE user_id = ?",
                                member.id()))
                .isEqualTo(3);
        assertThat(credits(member).path("entries").path("items").size()).isEqualTo(3);

        // A corrupted cache is repaired by the reconciliation job.
        redis.opsForValue().set(CreditBalanceCache.KEY_PREFIX + member.id(), "999");
        assertThat(credits(member).path("balance").asLong()).isEqualTo(999);
        JsonNode run = job("/internal/jobs/credits-reconcile");
        assertThat(run.path("cacheMismatches").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(run.path("ledgerMismatches").asInt()).isZero();
        assertThat(credits(member).path("balance").asLong()).isZero();

        // Cursor pagination.
        JsonNode firstPage =
                callJson(HttpMethod.GET, "/api/v1/me/credits?limit=2", member.uid(), null, 200);
        assertThat(firstPage.path("entries").path("items").size()).isEqualTo(2);
        assertThat(firstPage.path("entries").path("hasMore").asBoolean()).isTrue();
        JsonNode nextPage =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/me/credits?limit=2&cursor="
                                + firstPage.path("entries").path("nextCursor").asString(),
                        member.uid(),
                        null,
                        200);
        assertThat(nextPage.path("entries").path("items").size()).isEqualTo(1);
    }

    @Test
    void adminGrantsAndAdjustmentsAreAuditedAndNeverGoBelowZero() {
        Member member = member("credit-admin");
        String admin = staff("credit-admin-staff", Role.ADMIN);
        JsonNode granted = grant(admin, member.id(), 25, "REWARD", 200);
        assertThat(granted.path("type").asString()).isEqualTo("GRANT");
        assertThat(granted.path("note").asString()).isEqualTo("Fictional test note");

        JsonNode tooMuch = grant(admin, member.id(), -30, "CORRECTION", 409);
        assertThat(errorCode(tooMuch)).isEqualTo("INSUFFICIENT_CREDITS");
        JsonNode adjusted = grant(admin, member.id(), -5, "CORRECTION", 200);
        assertThat(adjusted.path("type").asString()).isEqualTo("ADJUST");
        assertThat(adjusted.path("balanceAfter").asInt()).isEqualTo(20);

        grant(admin, member.id(), 0, "ADMIN", 400);
        grant(admin, UUID.randomUUID(), 5, "ADMIN", 404);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/credits/grant",
                admin,
                Map.of("userId", member.id().toString(), "amount", 5, "reason", "GIFT"),
                400);
        grant(member.uid(), member.id(), 5, "ADMIN", 403);

        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action = 'credits.grant' AND"
                                        + " target_id = ?",
                                member.id().toString()))
                .isEqualTo(2);
        JsonNode ledger =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/credits/ledger?userId=" + member.id(),
                        admin,
                        null,
                        200);
        assertThat(ledger.path("balance").asLong()).isEqualTo(20);
        assertThat(ledger.path("entries").path("totalItems").asInt()).isEqualTo(2);
        callJson(HttpMethod.GET, "/api/v1/admin/credits/ledger", admin, null, 200);
        callJson(HttpMethod.GET, "/api/v1/me/credits", null, null, 401);
    }

    @Test
    void spendValidationAndCreditProductsAreDataEditedBySuperAdmins() {
        Member member = member("credit-valid");
        spend(member, "no_such_product", "k-1", 400);
        callJson(
                HttpMethod.POST,
                "/api/v1/me/credits/spend",
                member.uid(),
                Map.of("featureKey", "premium_search_day"),
                400);
        spend(member, "premium_search_day", "has spaces", 400);

        String superAdmin = staff("credit-products-super", Role.SUPER_ADMIN);
        String admin = staff("credit-products-admin", Role.ADMIN);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "Advanced search for a day");
        body.put("description", "Advanced search filters for 24 hours.");
        body.put("featureValue", "true");
        body.put("cost", 60);
        body.put("durationHours", 24);
        body.put("active", true);
        body.put("sortOrder", 10);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/credits/products/premium_search_day",
                admin,
                body,
                403);
        try {
            JsonNode updated =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/admin/credits/products/premium_search_day",
                            superAdmin,
                            body,
                            200);
            assertThat(updated.path("cost").asInt()).isEqualTo(60);
            assertThat(product(credits(member), "premium_search_day").path("cost").asInt())
                    .isEqualTo(60);
            body.put("featureValue", "maybe");
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/credits/products/premium_search_day",
                    superAdmin,
                    body,
                    400);
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM audit_log WHERE action ="
                                            + " 'credits.product.update' AND target_id ="
                                            + " 'premium_search_day'"))
                    .isPositive();
        } finally {
            testUsers.update(
                    "UPDATE credit_product SET cost = 50 WHERE key = 'premium_search_day'");
            products.invalidate();
        }
        callJson(HttpMethod.GET, "/api/v1/admin/credits/products", admin, null, 200);
    }

    private JsonNode credits(Member member) {
        return callJson(HttpMethod.GET, "/api/v1/me/credits", member.uid(), null, 200);
    }

    private JsonNode spend(Member member, String product, String key, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/me/credits/spend",
                member.uid(),
                Map.of("featureKey", product, "idempotencyKey", key),
                expectedStatus);
    }

    private JsonNode grant(String adminUid, UUID userId, int amount, String reason, int status) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userId", userId.toString());
        body.put("amount", amount);
        body.put("reason", reason);
        body.put("note", "Fictional test note");
        return callJson(HttpMethod.POST, "/api/v1/admin/credits/grant", adminUid, body, status);
    }

    private static JsonNode product(JsonNode credits, String key) {
        for (JsonNode product : credits.path("products")) {
            if (key.equals(product.path("key").asString())) {
                return product;
            }
        }
        throw new AssertionError("no product " + key);
    }
}
