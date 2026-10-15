package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.common.seed.SeedDataRunner;
import com.orenjitrade.api.common.seed.SeedWordingTest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Phase 1-B seed: profiles, tags, privacy settings and locations (country, state/province, city;
 * ADR 0017) of the 12 accounts, spread over the three platform regions. Shares the seeded context
 * with {@code SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
class SeedIT extends AbstractIntegrationTest {

    static final Set<String> DISCOVERABLE = Set.of("01", "02", "03", "04", "05", "06", "08", "09");

    /** Country of each seed account (db/seed/locations.json): all three regions are covered. */
    static final Map<String, String> COUNTRIES =
            Map.ofEntries(
                    Map.entry("01", "CA"),
                    Map.entry("02", "CA"),
                    Map.entry("03", "AR"),
                    Map.entry("04", "ES"),
                    Map.entry("05", "US"),
                    Map.entry("06", "CL"),
                    Map.entry("07", "US"),
                    Map.entry("08", "FR"),
                    Map.entry("09", "BR"),
                    Map.entry("10", "DE"),
                    Map.entry("11", "GB"),
                    Map.entry("12", "CA"));

    @Autowired private SeedDataRunner seedDataRunner;

    private static UUID seedId(String nn) {
        return UUID.fromString("00000000-0000-4000-8000-0000000000" + nn);
    }

    @Test
    void seedsProfilesTagsPrivacyAndLocationsIdempotently() {
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
            assertThat(location).as("location %s", nn).isNotEmpty();
            assertThat(location.get("country_code")).isEqualTo(COUNTRIES.get(nn));
            assertThat(location.get("subdivision_code").toString()).startsWith(COUNTRIES.get(nn));
            before.put(id, location);
        }

        assertThat(
                        testUsers.query(
                                "SELECT t.slug FROM profile_tag pt JOIN tag t ON t.id = pt.tag_id"
                                        + " WHERE pt.profile_user_id = ? ORDER BY t.slug",
                                seedId("01")))
                .extracting(row -> row.get("slug"))
                .containsExactly("collector", "english", "french", "shipping", "trader");
        // Deals ship by mail (ADR 0018): no seed profile carries the hidden meetup tag (V115).
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM profile_tag pt JOIN tag t ON t.id ="
                                        + " pt.tag_id WHERE t.slug = 'local-meetups'"))
                .isZero();
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
        assertThat(collector.path("onboarding").path("locationSet").asBoolean()).isTrue();
        assertThat(
                        testUsers.count(
                                "SELECT count(DISTINCT co.region_code) FROM user_location ul JOIN"
                                        + " country co ON co.code = ul.country_code JOIN"
                                        + " privacy_settings ps ON ps.user_id = ul.user_id WHERE"
                                        + " ps.discoverable AND ul.user_id::text LIKE"
                                        + " '00000000-0000-4000-8000-%'"))
                .as("discoverable seed collectors in every region")
                .isEqualTo(3);
        assertThat(collector.path("onboarding").path("interestsSet").asBoolean()).isTrue();
        JsonNode moderator = me("seed-moderator:moderator@orenjitrade.test");
        assertThat(moderator.path("onboarding").path("profileComplete").asBoolean()).isTrue();
        assertThat(moderator.path("onboarding").path("interestsSet").asBoolean()).isFalse();
    }

    /**
     * Deals ship by mail (ADR 0018, spec 2026-10-14 section 11): what the seed writes for its
     * collectors (bios, binder descriptions, card notes, messages and inbox previews, community
     * posts and replies, offers and their history, ratings, donations) never speaks of meeting, a
     * game store, a café or the locals. Only the seed accounts' rows are read, since other test
     * classes share this database; {@link SeedWordingTest} reads the seed's own sources.
     */
    @Test
    void seedsShippingWordingOnly() {
        seedDataRunner.seedAll();
        String seed = "::text LIKE '00000000-0000-4000-8000-%'";
        Map<String, String> texts = new LinkedHashMap<>();
        texts.put("bio", "SELECT bio AS text FROM profile WHERE user_id" + seed);
        texts.put("binder", "SELECT description AS text FROM binder WHERE owner_id" + seed);
        texts.put(
                "card notes",
                "SELECT notes || ' ' || public_notes AS text FROM inventory_item WHERE owner_id"
                        + seed);
        texts.put("message", "SELECT body AS text FROM message WHERE sender_id" + seed);
        texts.put(
                "inbox preview",
                "SELECT coalesce(last_message_preview, '') AS text FROM conversation WHERE"
                        + " created_by"
                        + seed);
        texts.put("post", "SELECT body AS text FROM community_post WHERE author_id" + seed);
        texts.put("reply", "SELECT body AS text FROM community_reply WHERE author_id" + seed);
        texts.put(
                "offer",
                "SELECT coalesce(message, '') AS text FROM offer WHERE buyer_id"
                        + seed
                        + " AND seller_id"
                        + seed);
        texts.put(
                "offer history",
                "SELECT e.snapshot::text AS text FROM offer_event e JOIN offer o ON o.id ="
                        + " e.offer_id WHERE o.buyer_id"
                        + seed
                        + " AND o.seller_id"
                        + seed);
        texts.put(
                "rating", "SELECT coalesce(comment, '') AS text FROM rating WHERE rater_id" + seed);
        texts.put(
                "donation",
                "SELECT coalesce(message, '') AS text FROM donation WHERE user_id" + seed);
        List<String> found = new ArrayList<>();
        texts.forEach(
                (what, sql) -> {
                    List<Map<String, Object>> rows = testUsers.query(sql);
                    assertThat(rows).as("seeded %s", what).isNotEmpty();
                    for (Map<String, Object> row : rows) {
                        String text = String.valueOf(row.get("text"));
                        SeedWordingTest.findings(text)
                                .forEach(word -> found.add(what + ": " + word + " in " + text));
                    }
                });
        assertThat(found).isEmpty();
    }
}
