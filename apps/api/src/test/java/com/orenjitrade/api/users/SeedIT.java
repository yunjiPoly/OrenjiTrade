package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.common.seed.SeedDataRunner;
import com.orenjitrade.api.location.domain.ApproximateLocationService;
import com.orenjitrade.api.location.domain.GridCell;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Phase 1-B seed: profiles, tags, privacy settings and trading areas of the 12 accounts. Shares the
 * seeded context with {@code SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
class SeedIT extends AbstractIntegrationTest {

    static final Set<String> DISCOVERABLE = Set.of("01", "02", "03", "04", "05", "06", "08", "09");

    @Autowired private SeedDataRunner seedDataRunner;

    private static UUID seedId(String nn) {
        return UUID.fromString("00000000-0000-4000-8000-0000000000" + nn);
    }

    @Test
    void seedsProfilesTagsPrivacyAndTradingAreasIdempotently() {
        seedDataRunner.seedAll();
        Map<UUID, Map<String, Object>> before = new HashMap<>();
        for (int n = 1; n <= 12; n++) {
            String nn = String.format("%02d", n);
            UUID id = seedId(nn);
            boolean discoverable = DISCOVERABLE.contains(nn);

            List<Map<String, Object>> profile =
                    testUsers.query(
                            "SELECT display_name, completed_at FROM profile WHERE user_id = ?", id);
            assertThat(profile).as("profile %s", nn).hasSize(1);
            assertThat(profile.get(0).get("completed_at")).isNotNull();
            assertThat(profile.get(0).get("display_name"))
                    .isEqualTo(testUsers.row(id).get("display_name"));
            assertThat(
                            testUsers
                                    .query(
                                            "SELECT discoverable FROM privacy_settings WHERE"
                                                    + " user_id = ?",
                                            id)
                                    .get(0)
                                    .get("discoverable"))
                    .as("discoverable %s", nn)
                    .isEqualTo(discoverable);

            Map<String, Object> location = testUsers.locationOf(id);
            assertThat(location).as("trading area %s", nn).isNotEmpty();
            assertThat(location.get("trading_area_radius_m")).isEqualTo(5000);
            assertThat(location.get("public_label")).isNotNull();
            if (discoverable) {
                double lat = ((Number) location.get("public_lat")).doubleValue();
                double lng = ((Number) location.get("public_lng")).doubleValue();
                GridCell cell =
                        ApproximateLocationService.cellOf(
                                ((Number) location.get("centre_lat")).doubleValue(),
                                ((Number) location.get("centre_lng")).doubleValue());
                assertThat(cell.contains(lat, lng))
                        .as("public point of %s in its cell", nn)
                        .isTrue();
                assertThat(location.get("grid_cell")).isEqualTo(cell.id());
            } else {
                assertThat(location.get("public_lat")).as("no public point for %s", nn).isNull();
                assertThat(location.get("grid_cell")).isNull();
            }
            before.put(id, location);
        }

        assertThat(
                        testUsers.query(
                                "SELECT t.slug FROM profile_tag pt JOIN tag t ON t.id = pt.tag_id"
                                        + " WHERE pt.profile_user_id = ? ORDER BY t.slug",
                                seedId("01")))
                .extracting(row -> row.get("slug"))
                .containsExactly("collector", "english", "french", "local-meetups", "trader");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM tag t WHERE usage_count <> (SELECT count(*)"
                                        + " FROM profile_tag pt WHERE pt.tag_id = t.id)"))
                .as("usage counts are consistent")
                .isZero();
        int profiles = testUsers.count("SELECT count(*) FROM profile");
        int links = testUsers.count("SELECT count(*) FROM profile_tag");

        // Idempotent: nothing moves on a second run.
        seedDataRunner.seedAll();
        assertThat(testUsers.count("SELECT count(*) FROM profile")).isEqualTo(profiles);
        assertThat(testUsers.count("SELECT count(*) FROM profile_tag")).isEqualTo(links);
        before.forEach((id, location) -> assertThat(testUsers.locationOf(id)).isEqualTo(location));

        JsonNode collector = me("seed-collector1:collector1@orenjitrade.test");
        assertThat(collector.path("onboarding").path("profileComplete").asBoolean()).isTrue();
        assertThat(collector.path("onboarding").path("tradingAreaSet").asBoolean()).isTrue();
        assertThat(collector.path("onboarding").path("interestsSet").asBoolean()).isTrue();
        JsonNode moderator = me("seed-moderator:moderator@orenjitrade.test");
        assertThat(moderator.path("onboarding").path("profileComplete").asBoolean()).isTrue();
        assertThat(moderator.path("onboarding").path("interestsSet").asBoolean()).isFalse();
    }
}
