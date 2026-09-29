package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.common.seed.SeedDataRunner;
import com.orenjitrade.api.users.infra.SeedAccounts;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

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

    @Test
    void createsTwelveAccountsAndIsIdempotent() {
        assertThat(seedAccounts.all()).hasSize(12);
        assertThat(testUsers.countSeedAccounts()).isEqualTo(12);

        seedDataRunner.seedAll();

        assertThat(testUsers.countSeedAccounts()).isEqualTo(12);
        assertThat(seedDataRunner.contributors())
                .extracting(contributor -> contributor.name())
                .containsExactly(
                        "user accounts", "auth emulator users", "profiles", "trading areas");

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
