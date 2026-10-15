package com.orenjitrade.api.limits;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import com.orenjitrade.api.users.infra.SeedAccounts;
import com.orenjitrade.api.users.infra.SeedAccounts.SeedAccount;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * The same caps for every account since stage F1 (ADR 0019), on the 12 seed accounts of the local
 * profiles: the former Premium account ({@code premium_user}), the collectors and the staff see the
 * same numbers in {@code GET /me/limits}, a counter limit refuses every one of them at the same
 * count ({@code Limits.consume} through the test probe), and a limit whose usage another module
 * counts ({@code binders.max}, {@code wishlist.items.max}, {@code inventory.items.max}: a {@code
 * LimitUsageSource}) refuses every one of them at its own usage, through the probe, {@code GET
 * /me/limits} and the binder creation itself. Nothing in {@code Limits} may know an account: a
 * fresh collector (LimitsIT) and a seed account must meet the same limits. Shares the seeded
 * context with {@code SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
class SeedAccountLimitsIT extends AbstractIntegrationTest {

    /**
     * A counter limit of this test only (dropped after each test, ignored by FlywayMigrationIT).
     */
    static final String PROBE = "test.seed_accounts.probe";

    /** The limits whose usage another module counts (a {@code LimitUsageSource} each). */
    static final List<String> SOURCE_LIMITS =
            List.of("binders.max", "wishlist.items.max", "inventory.items.max");

    /** The name of the binder a refused creation would have made (removed after each test). */
    static final String PROBE_BINDER = "SeedAccountLimitsIT refused binder";

    @Autowired private SeedAccounts seedAccounts;

    @Autowired private UsageLimitService usageLimits;

    @Autowired private StringRedisTemplate redis;

    /** The numbers of {@link #SOURCE_LIMITS} before the test ({@code null}: unlimited). */
    private final Map<String, @Nullable Integer> savedMaxima = new LinkedHashMap<>();

    @BeforeEach
    void rememberTheSourceLimits() {
        savedMaxima.clear();
        for (String key : SOURCE_LIMITS) {
            List<Map<String, Object>> rows =
                    testUsers.query("SELECT max_value FROM usage_limit WHERE limit_key = ?", key);
            assertThat(rows).as(key).hasSize(1);
            Object max = rows.get(0).get("max_value");
            savedMaxima.put(key, max == null ? null : ((Number) max).intValue());
        }
    }

    @AfterEach
    void restoreTheSourceLimits() {
        savedMaxima.forEach(this::setMax);
        testUsers.update("DELETE FROM binder WHERE name = ?", PROBE_BINDER);
    }

    @AfterEach
    void dropTheProbeLimit() {
        testUsers.update("DELETE FROM usage_counter WHERE limit_key = ?", PROBE);
        testUsers.update("DELETE FROM usage_limit WHERE limit_key = ?", PROBE);
        usageLimits.invalidate();
        Set<String> mirrors = redis.keys("orenji:usage:*:" + PROBE + ":*");
        if (mirrors != null && !mirrors.isEmpty()) {
            redis.delete(mirrors);
        }
    }

    @Test
    void everySeedAccountSeesTheSameNumbers() {
        List<SeedAccount> accounts = seedAccounts.all();
        assertThat(accounts).hasSize(12).extracting(SeedAccount::handle).contains("premium_user");
        Map<String, @Nullable Integer> reference =
                numbers(
                        callJson(
                                HttpMethod.GET,
                                "/api/v1/me/limits",
                                "seed-collector1:collector1@orenjitrade.test",
                                null,
                                200));
        assertThat(reference).containsKeys("binders.max", "binder.views.per_day");
        for (SeedAccount account : accounts) {
            Map<String, @Nullable Integer> numbers =
                    numbers(
                            callJson(
                                    HttpMethod.GET,
                                    "/api/v1/me/limits",
                                    caller(account),
                                    null,
                                    200));
            assertThat(numbers).as(account.handle()).isEqualTo(reference);
        }
    }

    @Test
    void aCounterLimitRefusesEverySeedAccountAtTheSameCount() {
        testUsers.update(
                "INSERT INTO usage_limit (limit_key, kind, limit_window, max_value)"
                        + " VALUES (?, 'COUNTER', 'DAY', 2)",
                PROBE);
        usageLimits.invalidate();
        String consume = "/api/v1/test-probes/limits/" + PROBE + "/consume";
        for (SeedAccount account : seedAccounts.all()) {
            String caller = caller(account);
            for (int used = 1; used <= 2; used++) {
                JsonNode decision = callJson(HttpMethod.POST, consume, caller, null, 200);
                assertThat(decision.path("used").asLong()).as(account.handle()).isEqualTo(used);
                assertThat(decision.path("limit").asInt()).as(account.handle()).isEqualTo(2);
            }
            JsonNode refused = callJson(HttpMethod.POST, consume, caller, null, 429);
            assertThat(refused.path("errorCode").asString())
                    .as(account.handle())
                    .isEqualTo("LIMIT_REACHED");
            assertThat(refused.path("limit").asInt()).as(account.handle()).isEqualTo(2);
            assertThat(refused.path("used").asLong()).as(account.handle()).isEqualTo(2);
            assertThat(refused.has("planCode") || refused.has("upgradeUrl"))
                    .as(account.handle())
                    .isFalse();
            JsonNode status =
                    limitOf(callJson(HttpMethod.GET, "/api/v1/me/limits", caller, null, 200));
            assertThat(status.path("allowed").asBoolean()).as(account.handle()).isFalse();
            assertThat(status.path("used").asLong()).as(account.handle()).isEqualTo(2);
        }
    }

    @Test
    void aLimitCountedByAnotherModuleRefusesEverySeedAccountAtItsOwnUsage() {
        List<SeedAccount> accounts = seedAccounts.all();
        assertThat(accounts).hasSize(12).extracting(SeedAccount::handle).contains("premium_user");
        for (String key : SOURCE_LIMITS) {
            String consume = "/api/v1/test-probes/limits/" + key + "/consume";
            for (SeedAccount account : accounts) {
                String caller = caller(account);
                String what = account.handle() + " " + key;
                long used = usedOf(caller, key);

                setMax(key, Math.toIntExact(used));
                JsonNode refused = callJson(HttpMethod.POST, consume, caller, null, 429);
                assertThat(refused.path("errorCode").asString())
                        .as(what)
                        .isEqualTo("LIMIT_REACHED");
                assertThat(refused.path("limitKey").asString()).as(what).isEqualTo(key);
                assertThat(refused.path("limit").asLong()).as(what).isEqualTo(used);
                assertThat(refused.path("used").asLong()).as(what).isEqualTo(used);
                assertThat(refused.has("planCode") || refused.has("upgradeUrl")).as(what).isFalse();
                JsonNode atTheLimit =
                        limitOf(
                                callJson(HttpMethod.GET, "/api/v1/me/limits", caller, null, 200),
                                key);
                assertThat(atTheLimit.path("allowed").asBoolean()).as(what).isFalse();
                assertThat(atTheLimit.path("remaining").asLong()).as(what).isZero();

                setMax(key, Math.toIntExact(used + 1));
                JsonNode allowed = callJson(HttpMethod.POST, consume, caller, null, 200);
                assertThat(allowed.path("allowed").asBoolean()).as(what).isTrue();
                assertThat(allowed.path("used").asLong()).as(what).isEqualTo(used);
                assertThat(allowed.path("remaining").asLong()).as(what).isEqualTo(1);
                JsonNode belowTheLimit =
                        limitOf(
                                callJson(HttpMethod.GET, "/api/v1/me/limits", caller, null, 200),
                                key);
                assertThat(belowTheLimit.path("allowed").asBoolean()).as(what).isTrue();
            }
        }
    }

    @Test
    void aSeedAccountAtTheBinderLimitCreatesNoBinder() {
        for (SeedAccount account : seedAccounts.all()) {
            String caller = caller(account);
            long used = usedOf(caller, "binders.max");
            setMax("binders.max", Math.toIntExact(used));
            JsonNode refused =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/binders",
                            caller,
                            InventoryTestSupport.binder(PROBE_BINDER, "PRIVATE"),
                            429);
            assertThat(refused.path("errorCode").asString())
                    .as(account.handle())
                    .isEqualTo("LIMIT_REACHED");
            assertThat(refused.path("limitKey").asString())
                    .as(account.handle())
                    .isEqualTo("binders.max");
            assertThat(refused.has("planCode") || refused.has("upgradeUrl"))
                    .as(account.handle())
                    .isFalse();
            assertThat(usedOf(caller, "binders.max")).as(account.handle()).isEqualTo(used);
        }
        assertThat(testUsers.count("SELECT count(*) FROM binder WHERE name = ?", PROBE_BINDER))
                .isZero();
    }

    /** Sets the number of a usage limit for everyone ({@code null}: unlimited). */
    private void setMax(String key, @Nullable Integer max) {
        testUsers.update(
                "UPDATE usage_limit SET max_value = CAST(? AS INTEGER) WHERE limit_key = ?",
                max,
                key);
        usageLimits.invalidate();
    }

    /** What {@code GET /me/limits} counts against {@code key} for the caller. */
    private long usedOf(String caller, String key) {
        JsonNode limit =
                limitOf(callJson(HttpMethod.GET, "/api/v1/me/limits", caller, null, 200), key);
        assertThat(limit.path("used").isNumber()).as(key).isTrue();
        return limit.path("used").asLong();
    }

    /** The test token of a seed account, with its real e-mail (the sign-in keeps it). */
    private static String caller(SeedAccount account) {
        return account.providerUid() + ":" + account.email();
    }

    private static JsonNode limitOf(JsonNode myLimits) {
        return limitOf(myLimits, PROBE);
    }

    private static JsonNode limitOf(JsonNode myLimits, String key) {
        for (JsonNode limit : myLimits.path("limits")) {
            if (key.equals(limit.path("key").asString())) {
                return limit;
            }
        }
        throw new AssertionError("no limit " + key + " in " + myLimits);
    }

    /** Key to number ({@code null}: unlimited) of a {@code GET /me/limits} answer. */
    private static Map<String, @Nullable Integer> numbers(JsonNode myLimits) {
        Map<String, @Nullable Integer> numbers = new LinkedHashMap<>();
        for (JsonNode limit : myLimits.path("limits")) {
            JsonNode max = limit.path("limit");
            numbers.put(limit.path("key").asString(), max.isNumber() ? max.asInt() : null);
        }
        return numbers;
    }
}
