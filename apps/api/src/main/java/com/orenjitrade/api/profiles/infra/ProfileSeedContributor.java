package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds the profiles, tags and privacy settings of the 12 fictional accounts ({@code
 * db/seed/profiles.json}, see {@code docs/development/seed-data.md}). Discoverable: collectors 1-6,
 * 8 and premium_user (an ordinary collector since stage F1); not discoverable: collector7 and the
 * staff accounts. Idempotent and respectful of local edits: rows that already exist are left
 * untouched; tag usage counts are recomputed at the end. Deleted accounts are skipped.
 *
 * <p>One exception, for a database seeded before stage F1 ("free for all", ADR 0019) and migrated
 * since: a bio that still holds the exact text an older seed wrote ({@link #RETIRED_BIOS}) gets
 * today's seed bio, so the former Premium account no longer calls itself "Premium member." on its
 * public profile. A bio the collector changed is never touched.
 */
@Component
public class ProfileSeedContributor implements SeedContributor {

    static final String RESOURCE = "db/seed/profiles.json";
    static final String SEED_ID_PREFIX = "00000000-0000-4000-8000-0000000000";

    /** Seed bios of earlier stages, by account number, that today's seed replaces. */
    static final Map<String, String> RETIRED_BIOS =
            Map.of("09", "Collector and trader across all four games. Premium member.");

    private static final Logger log = LoggerFactory.getLogger(ProfileSeedContributor.class);

    private final JdbcClient jdbc;
    private final TimeProvider timeProvider;
    private final List<SeedProfile> profiles;

    public ProfileSeedContributor(
            JdbcClient jdbc, TimeProvider timeProvider, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.timeProvider = timeProvider;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            this.profiles = jsonMapper.readValue(in, new TypeReference<List<SeedProfile>>() {});
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + RESOURCE, e);
        }
    }

    @Override
    public String name() {
        return "profiles";
    }

    @Override
    public int order() {
        return ORDER_PROFILES;
    }

    @Override
    @Transactional
    public void seed() {
        Timestamp now = Timestamp.from(timeProvider.now());
        for (SeedProfile profile : profiles) {
            UUID userId = UUID.fromString(SEED_ID_PREFIX + profile.nn());
            int inserted =
                    jdbc.sql(
                                    """
                                    INSERT INTO profile (user_id, display_name, bio, games, languages,
                                        completed_at, created_at, updated_at)
                                    SELECT id, COALESCE(display_name, handle), :bio,
                                        CAST(:games AS text[]), CAST(:languages AS text[]), :now, :now, :now
                                      FROM user_account
                                     WHERE id = :id AND status <> 'DELETED'
                                    ON CONFLICT (user_id) DO NOTHING
                                    """)
                            .param("id", userId)
                            .param("bio", profile.bio())
                            .param("games", arrayLiteral(profile.games()))
                            .param("languages", arrayLiteral(profile.languages()))
                            .param("now", now)
                            .update();
            if (inserted > 0) {
                for (String slug : profile.tags()) {
                    jdbc.sql(
                                    """
                                    INSERT INTO profile_tag (profile_user_id, tag_id, created_at)
                                    SELECT :id, t.id, :now FROM tag t WHERE t.slug = :slug
                                    ON CONFLICT DO NOTHING
                                    """)
                            .param("id", userId)
                            .param("slug", slug)
                            .param("now", now)
                            .update();
                }
            }
            jdbc.sql(
                            """
                            INSERT INTO privacy_settings (user_id, discoverable, created_at, updated_at)
                            SELECT id, :discoverable, :now, :now FROM user_account
                             WHERE id = :id AND status <> 'DELETED'
                            ON CONFLICT (user_id) DO NOTHING
                            """)
                    .param("id", userId)
                    .param("discoverable", profile.discoverable())
                    .param("now", now)
                    .update();
            String retired = RETIRED_BIOS.get(profile.nn());
            if (retired != null && replaceRetiredBio(userId, retired, profile.bio(), now) > 0) {
                log.info("Seed account {}: the bio of an earlier seed was replaced", profile.nn());
            }
        }
        jdbc.sql(
                        """
                        UPDATE tag t SET usage_count = (SELECT count(*) FROM profile_tag pt
                            WHERE pt.tag_id = t.id)
                        WHERE t.usage_count <> (SELECT count(*) FROM profile_tag pt WHERE pt.tag_id = t.id)
                        """)
                .update();
    }

    /** Today's seed bio in place of an earlier seed's, only while the bio is exactly that text. */
    private int replaceRetiredBio(UUID userId, String retired, String bio, Timestamp now) {
        return jdbc.sql(
                        """
                        UPDATE profile SET bio = :bio, updated_at = :now
                         WHERE user_id = :id AND bio = :retired
                        """)
                .param("id", userId)
                .param("bio", bio)
                .param("retired", retired)
                .param("now", now)
                .update();
    }

    /**
     * PostgreSQL array literal of simple slugs / ISO codes (validated shapes, no quoting needed).
     */
    static String arrayLiteral(List<String> values) {
        for (String value : values) {
            if (!value.matches("[a-z0-9_-]+")) {
                throw new IllegalArgumentException("Unexpected seed value " + value);
            }
        }
        return "{" + String.join(",", values) + "}";
    }

    /** JSON shape of {@value #RESOURCE}. */
    record SeedProfile(
            String nn,
            String bio,
            List<String> games,
            List<String> languages,
            List<String> tags,
            boolean discoverable) {}
}
