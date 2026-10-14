package com.orenjitrade.api.featureflags;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.featureflags.infra.FeatureFlagRepository;
import com.orenjitrade.api.featureflags.infra.FeatureFlagSeedContributor;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Feature flags: migration defaults (V010 + the V105 launch configuration: every money feature
 * off), public map, admin reads/writes, rollout, 404 when off. Rollout is exercised on {@link
 * #PROBE}, a flag row this test creates and removes, so no product flag is switched on.
 */
class FeatureFlagsIT extends AbstractIntegrationTest {

    /** A test-only flag (no code reads it), created before each test and removed after it. */
    static final String PROBE = "rolloutProbe";

    static final Map<String, Boolean> DEFAULTS =
            Map.of(
                    "mlScanning", false,
                    "protectedPayments", false,
                    "publicChat", true,
                    "premiumPlans", false,
                    "credits", false);

    @Autowired private FeatureFlags featureFlags;
    @Autowired private FeatureFlagRepository repository;
    @Autowired private TimeProvider timeProvider;

    @BeforeEach
    void createProbe() {
        testUsers.update(
                "INSERT INTO feature_flag (key, enabled, description) VALUES (?, false, 'Test"
                        + " probe') ON CONFLICT (key) DO NOTHING",
                PROBE);
        featureFlags.invalidate();
    }

    @AfterEach
    void restoreDefaults() {
        testUsers.update("DELETE FROM feature_flag WHERE key = ?", PROBE);
        DEFAULTS.forEach(
                (key, enabled) ->
                        testUsers.update(
                                "UPDATE feature_flag SET enabled = ?, rollout_percent = 100,"
                                        + " updated_by = NULL WHERE key = ?",
                                enabled,
                                key));
        featureFlags.invalidate();
    }

    @Test
    void migrationSeedsTheDefaultsAndThePublicMapIsAnonymous() {
        featureFlags.invalidate();
        JsonNode flags = callJson(HttpMethod.GET, "/api/v1/public/feature-flags", null, null, 200);
        DEFAULTS.forEach(
                (key, enabled) ->
                        assertThat(flags.path(key).asBoolean()).as(key).isEqualTo(enabled));
        assertThat(featureFlags.isEnabled("mlScanning")).isFalse();
        assertThat(featureFlags.isEnabled("publicChat")).isTrue();
        assertThat(featureFlags.isEnabled("noSuchFlag")).isFalse();

        // With a bearer token of an account that has not accepted the terms yet: still public.
        String uid = uniqueUid("ff-public");
        provision(uid);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/public/feature-flags", uid, null, 200)
                                .path("publicChat")
                                .asBoolean())
                .isTrue();
    }

    @Test
    void adminListRequiresAnAdminAndWritesRequireASuperAdmin() {
        String collector = uniqueUid("ff-collector");
        provisionCompliant(collector);
        String admin = uniqueUid("ff-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String superAdmin = uniqueUid("ff-super");
        UUID superAdminId = provisionWithRoles(superAdmin, Role.SUPER_ADMIN);

        callJson(HttpMethod.GET, "/api/v1/admin/feature-flags", null, null, 401);
        callJson(HttpMethod.GET, "/api/v1/admin/feature-flags", collector, null, 403);
        JsonNode list = callJson(HttpMethod.GET, "/api/v1/admin/feature-flags", admin, null, 200);
        assertThat(list.size())
                .as("the migration flags and the probe")
                .isEqualTo(DEFAULTS.size() + 1);
        assertThat(list.get(0).has("rolloutPercent")).isTrue();
        assertThat(list.get(0).has("description")).isTrue();

        Map<String, Object> enable = Map.of("enabled", true);
        callJson(HttpMethod.PUT, "/api/v1/admin/feature-flags/" + PROBE, collector, enable, 403);
        JsonNode denied =
                callJson(
                        HttpMethod.PUT, "/api/v1/admin/feature-flags/" + PROBE, admin, enable, 403);
        assertThat(denied.path("errorCode").asString()).isEqualTo("FORBIDDEN");

        JsonNode updated =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/admin/feature-flags/" + PROBE,
                        superAdmin,
                        Map.of("enabled", true, "description", "Local probe test"),
                        200);
        assertThat(updated.path("enabled").asBoolean()).isTrue();
        assertThat(updated.path("updatedBy").asString()).isEqualTo(superAdminId.toString());
        assertThat(updated.path("description").asString()).isEqualTo("Local probe test");

        // Evicted at once: the public map and the service see the change.
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/public/feature-flags", null, null, 200)
                                .path(PROBE)
                                .asBoolean())
                .isTrue();
        assertThat(featureFlags.isEnabled(PROBE)).isTrue();

        List<Map<String, Object>> audit =
                testUsers.query(
                        "SELECT actor_user_id, actor_type, details::text AS details FROM audit_log"
                                + " WHERE action = 'feature_flag.update' AND target_id = ?"
                                + " ORDER BY occurred_at DESC",
                        PROBE);
        assertThat(audit).isNotEmpty();
        assertThat(audit.get(0).get("actor_user_id")).isEqualTo(superAdminId);
        assertThat(audit.get(0).get("actor_type")).isEqualTo("ADMIN");
        assertThat((String) audit.get(0).get("details")).contains("\"enabled\": true");

        callJson(HttpMethod.PUT, "/api/v1/admin/feature-flags/noSuchFlag", superAdmin, enable, 404);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/feature-flags/" + PROBE,
                superAdmin,
                Map.of("enabled", true, "rolloutPercent", 101),
                400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/feature-flags/" + PROBE,
                superAdmin,
                Map.of("rolloutPercent", 50),
                400);
    }

    @Test
    void disabledFeatureIsNotFoundAndRolloutIsDeterministicPerAccount() {
        String superAdmin = uniqueUid("ff-rollout-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        String user = uniqueUid("ff-rollout-user");
        UUID userId = provisionCompliant(user);

        JsonNode off =
                callJson(HttpMethod.GET, "/api/v1/test-probes/features/" + PROBE, user, null, 404);
        assertThat(off.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
        assertThat(off.path("feature").asString()).isEqualTo(PROBE);
        assertThat(off.path("status").asInt()).isEqualTo(404);

        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/feature-flags/" + PROBE,
                superAdmin,
                Map.of("enabled", true, "rolloutPercent", 0),
                200);
        // Enabled but rolled out to nobody.
        callJson(HttpMethod.GET, "/api/v1/test-probes/features/" + PROBE, user, null, 404);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/public/feature-flags", null, null, 200)
                                .path(PROBE)
                                .asBoolean())
                .isFalse();
        assertThat(featureFlags.isEnabled(PROBE, userId)).isFalse();

        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/feature-flags/" + PROBE,
                superAdmin,
                Map.of("enabled", true, "rolloutPercent", 100),
                200);
        callJson(HttpMethod.GET, "/api/v1/test-probes/features/" + PROBE, user, null, 204);
        assertThat(featureFlags.isEnabled(PROBE)).isTrue();

        // A partial rollout gives the same answer every time for the same account.
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/feature-flags/" + PROBE,
                superAdmin,
                Map.of("enabled", true, "rolloutPercent", 50),
                200);
        boolean first = featureFlags.isEnabled(PROBE, userId);
        for (int i = 0; i < 5; i++) {
            assertThat(featureFlags.isEnabled(PROBE, userId)).isEqualTo(first);
        }
        assertThat(featureFlags.isEnabled(PROBE, null)).isFalse();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/public/feature-flags", user, null, 200)
                                .path(PROBE)
                                .asBoolean())
                .isEqualTo(first);
    }

    @Test
    void localSeedEnablesTheFakeProviderFlagsButNotMlScanningAndKeepsAdminEdits() {
        String superAdmin = uniqueUid("ff-seed-super");
        provisionWithRoles(superAdmin, Role.SUPER_ADMIN);
        // An admin explicitly turned credits off: the seed must leave it alone.
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/feature-flags/credits",
                superAdmin,
                Map.of("enabled", false),
                200);

        new FeatureFlagSeedContributor(repository, featureFlags, timeProvider).seed();

        assertThat(featureFlags.isEnabled("protectedPayments")).isTrue();
        assertThat(featureFlags.isEnabled("premiumPlans")).isTrue();
        assertThat(featureFlags.isEnabled("credits")).isFalse();
        assertThat(featureFlags.isEnabled("mlScanning")).isFalse();
        assertThat(featureFlags.isEnabled("publicChat")).isTrue();
    }
}
