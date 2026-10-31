package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.location.domain.RegionCatalog;
import com.orenjitrade.api.moderation.domain.FlagSubjectType;
import com.orenjitrade.api.moderation.domain.FlaggedContentPreviews;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The community side of {@link FlaggedContentPreviews} (spec 15.8.3, web stage WH1): the room and
 * the text of a flagged post or reply, for the console's Flags and rules page. A channel's region
 * label is sent only when it is a platform region's code (the rooms of V134): an archived city
 * channel's label is a city and never leaves the server (ADR 0017).
 */
@Component
public class CommunityFlagPreviews implements FlaggedContentPreviews {

    private static final String POSTS =
            """
            SELECT p.id AS subject_id, p.id AS post_id, p.body, p.moderation_state,
                   c.slug, c.name, c.region_label, c.game_slug
              FROM community_post p
              JOIN community_channel c ON c.id = p.channel_id
             WHERE p.id IN (:ids)
            """;

    private static final String REPLIES =
            """
            SELECT r.id AS subject_id, p.id AS post_id, r.body, r.moderation_state,
                   c.slug, c.name, c.region_label, c.game_slug
              FROM community_reply r
              JOIN community_post p ON p.id = r.post_id
              JOIN community_channel c ON c.id = p.channel_id
             WHERE r.id IN (:ids)
            """;

    private final JdbcClient jdbc;
    private final RegionCatalog regions;

    public CommunityFlagPreviews(JdbcClient jdbc, RegionCatalog regions) {
        this.jdbc = jdbc;
        this.regions = regions;
    }

    @Override
    public Map<UUID, FlaggedContent> previews(FlagSubjectType type, Collection<UUID> subjectIds) {
        if (subjectIds.isEmpty()) {
            return Map.of();
        }
        String sql =
                switch (type) {
                    case COMMUNITY_POST -> POSTS;
                    case COMMUNITY_REPLY -> REPLIES;
                    case MESSAGE, USER -> null;
                };
        if (sql == null) {
            return Map.of();
        }
        List<Row> rows =
                jdbc.sql(sql)
                        .param("ids", List.copyOf(subjectIds))
                        .query(
                                (rs, rowNum) ->
                                        new Row(
                                                rs.getObject("subject_id", UUID.class),
                                                new FlaggedContent(
                                                        rs.getObject("post_id", UUID.class),
                                                        rs.getString("slug"),
                                                        rs.getString("name"),
                                                        platformRegion(
                                                                rs.getString("region_label")),
                                                        rs.getString("game_slug"),
                                                        rs.getString("body"),
                                                        "REMOVED"
                                                                .equals(
                                                                        rs.getString(
                                                                                "moderation_state")))))
                        .list();
        Map<UUID, FlaggedContent> result = new LinkedHashMap<>();
        rows.forEach(row -> result.put(row.subjectId(), row.content()));
        return result;
    }

    /** The label when it names a platform region, else {@code null} (an old city label). */
    private @Nullable String platformRegion(@Nullable String label) {
        if (label == null) {
            return null;
        }
        return regions.region(label).isPresent() ? label : null;
    }

    private record Row(UUID subjectId, FlaggedContent content) {}
}
