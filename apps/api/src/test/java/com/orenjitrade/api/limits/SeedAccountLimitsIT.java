package com.orenjitrade.api.limits;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import com.orenjitrade.api.users.infra.SeedAccounts;
import com.orenjitrade.api.users.infra.SeedAccounts.SeedAccount;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * The same caps for every account since stage F1 (ADR 0019), on the 12 seed accounts of the local
 * profiles: the former Premium account ({@code premium_user}), the collectors and the staff see the
 * same numbers in {@code GET /me/limits}, and a counter limit refuses every one of them at the same
 * count ({@code Limits.consume} through the test probe). Nothing in {@code Limits} may know an
 * account: a fresh collector (LimitsIT) and a seed account must meet the same limits. Shares the
 * seeded context with {@code SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
class SeedAccountLimitsIT extends AbstractIntegrationTest {

    /**
     * A counter limit of this test only (dropped after each test, ignored by FlywayMigrationIT).
     */
    static final String PROBE = "test.seed_accounts.probe";

    @Autowired private SeedAccounts seedAccounts;

    @Autowired private UsageLimitService usageLimits;

    @Autowired private StringRedisTemplate redis;

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

    /** The test token of a seed account, with its real e-mail (the sign-in keeps it). */
    private static String caller(SeedAccount account) {
        return account.providerUid() + ":" + account.email();
    }

    private static JsonNode limitOf(JsonNode myLimits) {
        for (JsonNode limit : myLimits.path("limits")) {
            if (PROBE.equals(limit.path("key").asString())) {
                return limit;
            }
        }
        throw new AssertionError("no limit " + PROBE + " in " + myLimits);
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
