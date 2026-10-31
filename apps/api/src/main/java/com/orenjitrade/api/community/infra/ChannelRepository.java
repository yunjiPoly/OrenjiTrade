package com.orenjitrade.api.community.infra;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code community_channel} access; used only inside the community module. */
@Repository
public class ChannelRepository {

    /** Every post that is not deleted or removed (the moderators' count). */
    private static final String STORED_POSTS =
            "p.deleted_at IS NULL AND p.moderation_state <> 'REMOVED'";

    private static final String SELECT = select(STORED_POSTS);

    /** The channel columns with the 24 h count of the posts that match {@code postFilter}. */
    private static String select(String postFilter) {
        return """
        SELECT ch.id, ch.slug, ch.name, ch.kind, ch.game_slug, ch.region_label,
               ch.description, ch.status, ch.post_rate_limit_per_hour, ch.sort_order,
               ch.updated_at,
               (SELECT count(*) FROM community_post p
                 WHERE p.channel_id = ch.id AND %s AND p.created_at > :since)
                   AS post_count_24h
          FROM community_channel ch
        """
                .formatted(postFilter);
    }

    private final JdbcClient jdbc;

    public ChannelRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Channels ordered by sort order and name. {@code activeOnly} hides archived ones; {@code game}
     * and {@code region} filter by game slug and (accent- and case-insensitive) region label: the
     * platform region code of region channels (ADR 0017).
     */
    public List<ChannelRow> list(
            boolean activeOnly, @Nullable String game, @Nullable String region, Instant now) {
        return list(SELECT, new LinkedHashMap<>(), activeOnly, game, region, now);
    }

    /**
     * The active channels as a member lists them (stage R11 review fix 1): the 24 h post count
     * holds only the posts the member may see, as {@link #lastPosts} does: not deleted, not
     * REMOVED, their author listed ({@link PostRepository#authorListed}) and not among {@code
     * hiddenAuthors} (blocks of the member, both directions), in the SQL.
     */
    public List<ChannelRow> listForMember(
            @Nullable String game,
            @Nullable String region,
            Collection<UUID> hiddenAuthors,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("now", Timestamp.from(now));
        String filter = PostRepository.visible("p");
        if (!hiddenAuthors.isEmpty()) {
            filter += " AND p.author_id NOT IN (:hidden)";
            params.put("hidden", hiddenAuthors);
        }
        return list(select(filter), params, true, game, region, now);
    }

    private List<ChannelRow> list(
            String select,
            Map<String, Object> params,
            boolean activeOnly,
            @Nullable String game,
            @Nullable String region,
            Instant now) {
        params.put("since", Timestamp.from(now.minus(Duration.ofHours(24))));
        StringBuilder where = new StringBuilder(" WHERE true");
        if (activeOnly) {
            where.append(" AND ch.status = 'ACTIVE'");
        }
        if (game != null) {
            where.append(" AND ch.game_slug = :game");
            params.put("game", game);
        }
        if (region != null) {
            where.append(
                    " AND lower(unaccent_immutable(ch.region_label)) ="
                            + " lower(unaccent_immutable(:region))");
            params.put("region", region);
        }
        return jdbc.sql(select + where + " ORDER BY ch.sort_order, ch.name, ch.slug")
                .params(params)
                .query(ChannelRepository::map)
                .list();
    }

    /**
     * The newest visible post of each channel (stage R11, the room list): not deleted, not REMOVED,
     * its author listed ({@link PostRepository#authorListed}) and not among {@code hiddenAuthors}
     * (blocks of the viewer, both directions). Channels without one are absent.
     */
    public Map<UUID, LastPostRow> lastPosts(
            Collection<UUID> channelIds, Collection<UUID> hiddenAuthors, Instant now) {
        Map<UUID, LastPostRow> result = new LinkedHashMap<>();
        if (channelIds.isEmpty()) {
            return result;
        }
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("ids", channelIds);
        params.put("now", Timestamp.from(now));
        String hidden = "";
        if (!hiddenAuthors.isEmpty()) {
            hidden = " AND p.author_id NOT IN (:hidden)";
            params.put("hidden", hiddenAuthors);
        }
        jdbc.sql(
                        "SELECT ch.id AS channel_id, lp.id, lp.author_id, lp.body, lp.created_at"
                                + " FROM community_channel ch CROSS JOIN LATERAL (SELECT p.id,"
                                + " p.author_id, p.body, p.created_at FROM community_post p"
                                + " WHERE p.channel_id = ch.id AND "
                                + PostRepository.visible("p")
                                + hidden
                                + " ORDER BY p.created_at DESC, p.id DESC LIMIT 1) lp"
                                + " WHERE ch.id IN (:ids)")
                .params(params)
                .query(
                        (rs, rowNum) ->
                                new LastPostRow(
                                        rs.getObject("channel_id", UUID.class),
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("author_id", UUID.class),
                                        rs.getString("body"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list()
                .forEach(row -> result.put(row.channelId(), row));
        return result;
    }

    public Optional<ChannelRow> findBySlug(String slug, Instant now) {
        return jdbc.sql(SELECT + " WHERE ch.slug = :slug")
                .param("since", Timestamp.from(now.minus(Duration.ofHours(24))))
                .param("slug", slug)
                .query(ChannelRepository::map)
                .optional();
    }

    public Optional<ChannelRow> findById(UUID id, Instant now) {
        return jdbc.sql(SELECT + " WHERE ch.id = :id")
                .param("since", Timestamp.from(now.minus(Duration.ofHours(24))))
                .param("id", id)
                .query(ChannelRepository::map)
                .optional();
    }

    public boolean slugExists(String slug) {
        return jdbc.sql("SELECT count(*) FROM community_channel WHERE slug = :slug")
                        .param("slug", slug)
                        .query(Long.class)
                        .single()
                > 0;
    }

    /** Inserts a channel; returns whether it was inserted ({@code false} when the slug exists). */
    public boolean insert(NewChannel channel, @Nullable UUID createdBy, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO community_channel (id, slug, name, kind, game_slug,
                                    region_label, description, status, post_rate_limit_per_hour,
                                    sort_order, created_by, updated_by, created_at, updated_at)
                                VALUES (:id, :slug, :name, :kind, :game, :region, :description,
                                    'ACTIVE', :rate, :sortOrder, :by, :by, :now, :now)
                                ON CONFLICT (slug) DO NOTHING
                                """)
                        .param("id", channel.id())
                        .param("slug", channel.slug())
                        .param("name", channel.name())
                        .param("kind", channel.kind())
                        .param("game", channel.game(), Types.VARCHAR)
                        .param("region", channel.regionLabel(), Types.VARCHAR)
                        .param("description", channel.description())
                        .param("rate", channel.postRateLimitPerHour())
                        .param("sortOrder", channel.sortOrder())
                        .param("by", createdBy, Types.OTHER)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /** Replaces the editable fields of a channel. */
    public void update(
            UUID id,
            String name,
            String description,
            String status,
            int postRateLimitPerHour,
            int sortOrder,
            @Nullable String game,
            @Nullable String regionLabel,
            UUID updatedBy,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE community_channel
                           SET name = :name, description = :description, status = :status,
                               post_rate_limit_per_hour = :rate, sort_order = :sortOrder,
                               game_slug = :game, region_label = :region, updated_by = :by,
                               updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("name", name)
                .param("description", description)
                .param("status", status)
                .param("rate", postRateLimitPerHour)
                .param("sortOrder", sortOrder)
                .param("game", game, Types.VARCHAR)
                .param("region", regionLabel, Types.VARCHAR)
                .param("by", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    private static ChannelRow map(ResultSet rs, int rowNum) throws SQLException {
        return new ChannelRow(
                rs.getObject("id", UUID.class),
                rs.getString("slug"),
                rs.getString("name"),
                rs.getString("kind"),
                rs.getString("game_slug"),
                rs.getString("region_label"),
                rs.getString("description"),
                rs.getString("status"),
                rs.getInt("post_rate_limit_per_hour"),
                rs.getInt("sort_order"),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getInt("post_count_24h"));
    }

    /** A stored channel with its 24 h post count. */
    public record ChannelRow(
            UUID id,
            String slug,
            String name,
            String kind,
            @Nullable String gameSlug,
            @Nullable String regionLabel,
            String description,
            String status,
            int postRateLimitPerHour,
            int sortOrder,
            Instant updatedAt,
            int postCount24h) {}

    /** The newest visible post of a channel. */
    public record LastPostRow(
            UUID channelId, UUID postId, UUID authorId, String body, Instant createdAt) {}

    /** A channel to insert. */
    public record NewChannel(
            UUID id,
            String slug,
            String name,
            String kind,
            @Nullable String game,
            @Nullable String regionLabel,
            String description,
            int postRateLimitPerHour,
            int sortOrder) {}
}
