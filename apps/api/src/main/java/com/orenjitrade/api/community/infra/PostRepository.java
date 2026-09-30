package com.orenjitrade.api.community.infra;

import com.orenjitrade.api.common.TimeCursor;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
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

/**
 * {@code community_post} access; used only inside the community module. A post is <em>visible</em>
 * ⇔ not deleted ∧ not REMOVED ∧ its author is listed (account ACTIVE, or a temporary suspension is
 * over; read-only join on {@code user_account}) ∧ its author is not hidden from the viewer by a
 * block (ids passed by the caller).
 */
@Repository
public class PostRepository {

    /** The author of {@code alias} is an active account (needs {@code :now}). */
    static String authorListed(String alias) {
        return "EXISTS (SELECT 1 FROM user_account u WHERE u.id = "
                + alias
                + ".author_id AND (u.status = 'ACTIVE' OR (u.status = 'SUSPENDED' AND"
                + " u.suspended_until IS NOT NULL AND u.suspended_until <= :now)))";
    }

    private static final String SELECT =
            """
            SELECT p.id, p.channel_id, ch.slug AS channel_slug, ch.status AS channel_status,
                   p.author_id, p.body, p.payload::text AS payload, p.created_at, p.edited_at,
                   p.deleted_at, p.moderation_state, p.reply_count, p.last_reply_at
              FROM community_post p
              JOIN community_channel ch ON ch.id = p.channel_id
            """;

    private final JdbcClient jdbc;

    public PostRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Visible posts of a channel, newest first, strictly older than the cursor. */
    public List<PostRow> page(
            UUID channelId,
            Collection<UUID> hiddenAuthors,
            @Nullable TimeCursor cursor,
            int limit,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("channelId", channelId);
        params.put("now", Timestamp.from(now));
        params.put("limit", limit);
        StringBuilder where =
                new StringBuilder(" WHERE p.channel_id = :channelId AND ").append(visible("p"));
        if (!hiddenAuthors.isEmpty()) {
            where.append(" AND p.author_id NOT IN (:hidden)");
            params.put("hidden", hiddenAuthors);
        }
        if (cursor != null) {
            where.append(" AND (p.created_at, p.id) < (:cursorAt, :cursorId)");
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(SELECT + where + " ORDER BY p.created_at DESC, p.id DESC LIMIT :limit")
                .params(params)
                .query(PostRepository::map)
                .list();
    }

    /** A visible post (for the viewer's hidden authors). */
    public Optional<PostRow> findVisible(UUID postId, Collection<UUID> hiddenAuthors, Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("id", postId);
        params.put("now", Timestamp.from(now));
        StringBuilder where = new StringBuilder(" WHERE p.id = :id AND ").append(visible("p"));
        if (!hiddenAuthors.isEmpty()) {
            where.append(" AND p.author_id NOT IN (:hidden)");
            params.put("hidden", hiddenAuthors);
        }
        return jdbc.sql(SELECT + where).params(params).query(PostRepository::map).optional();
    }

    /** A post whatever its state (moderator actions); empty when unknown. */
    public Optional<PostRow> findAny(UUID postId) {
        return jdbc.sql(SELECT + " WHERE p.id = :id")
                .param("id", postId)
                .query(PostRepository::map)
                .optional();
    }

    /**
     * Posts and replies of an author that moderators removed, newest removal first (Phase 7
     * moderator history): kind, id, channel slug, removal time and reason only.
     */
    public List<RemovedRow> removedOf(UUID authorId, int limit) {
        return jdbc.sql(
                        """
                        SELECT x.kind, x.id, x.channel_slug, x.removed_at, x.removed_reason FROM (
                            SELECT 'POST' AS kind, p.id, c.slug AS channel_slug, p.removed_at,
                                   p.removed_reason
                              FROM community_post p JOIN community_channel c ON c.id = p.channel_id
                             WHERE p.author_id = :author AND p.moderation_state = 'REMOVED'
                            UNION ALL
                            SELECT 'REPLY' AS kind, r.id, c.slug AS channel_slug, r.removed_at,
                                   r.removed_reason
                              FROM community_reply r
                              JOIN community_post p ON p.id = r.post_id
                              JOIN community_channel c ON c.id = p.channel_id
                             WHERE r.author_id = :author AND r.moderation_state = 'REMOVED') x
                         ORDER BY x.removed_at DESC NULLS LAST, x.id LIMIT :limit
                        """)
                .param("author", authorId)
                .param("limit", limit)
                .query(
                        (rs, rowNum) -> {
                            Timestamp removedAt = rs.getTimestamp("removed_at");
                            return new RemovedRow(
                                    rs.getString("kind"),
                                    rs.getObject("id", UUID.class),
                                    rs.getString("channel_slug"),
                                    removedAt == null ? null : removedAt.toInstant(),
                                    rs.getString("removed_reason"));
                        })
                .list();
    }

    /** A removed post or reply (moderator history). */
    public record RemovedRow(
            String kind,
            UUID id,
            String channelSlug,
            @Nullable Instant removedAt,
            @Nullable String reason) {}

    /** Whether the author posted the same normalised text since {@code since} (not deleted). */
    public boolean duplicateExists(UUID authorId, String bodyHash, Instant since) {
        return jdbc.sql(
                                "SELECT count(*) FROM community_post WHERE author_id = :author AND"
                                        + " body_hash = :hash AND created_at > :since AND"
                                        + " deleted_at IS NULL")
                        .param("author", authorId)
                        .param("hash", bodyHash)
                        .param("since", Timestamp.from(since))
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void insert(
            UUID id,
            UUID channelId,
            UUID authorId,
            String body,
            String bodyHash,
            String payloadJson,
            String moderationState,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO community_post (id, channel_id, author_id, body, body_hash,
                            payload, moderation_state, created_at)
                        VALUES (:id, :channelId, :authorId, :body, :hash, CAST(:payload AS jsonb),
                            :state, :now)
                        """)
                .param("id", id)
                .param("channelId", channelId)
                .param("authorId", authorId)
                .param("body", body)
                .param("hash", bodyHash)
                .param("payload", payloadJson)
                .param("state", moderationState)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void updateBody(
            UUID id, String body, String bodyHash, String moderationState, Instant editedAt) {
        jdbc.sql(
                        "UPDATE community_post SET body = :body, body_hash = :hash,"
                                + " moderation_state = :state, edited_at = :at WHERE id = :id")
                .param("id", id)
                .param("body", body)
                .param("hash", bodyHash)
                .param("state", moderationState)
                .param("at", Timestamp.from(editedAt))
                .update();
    }

    public void softDelete(UUID id, UUID deletedBy, Instant now) {
        jdbc.sql(
                        "UPDATE community_post SET deleted_at = :now, deleted_by = :by WHERE id ="
                                + " :id AND deleted_at IS NULL")
                .param("id", id)
                .param("by", deletedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void remove(UUID id, UUID moderatorId, String reason, Instant now) {
        jdbc.sql(
                        "UPDATE community_post SET moderation_state = 'REMOVED', removed_reason ="
                                + " :reason, removed_by = :by, removed_at = :now WHERE id = :id")
                .param("id", id)
                .param("by", moderatorId)
                .param("reason", reason)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** A visible reply was added. */
    public void replyAdded(UUID postId, Instant at) {
        jdbc.sql(
                        "UPDATE community_post SET reply_count = reply_count + 1, last_reply_at ="
                                + " GREATEST(COALESCE(last_reply_at, :at), :at) WHERE id = :id")
                .param("id", postId)
                .param("at", Timestamp.from(at))
                .update();
    }

    /** A visible reply disappeared (deleted or removed). */
    public void replyRemoved(UUID postId) {
        jdbc.sql(
                        "UPDATE community_post SET reply_count = GREATEST(reply_count - 1, 0)"
                                + " WHERE id = :id")
                .param("id", postId)
                .update();
    }

    /** Posts of an author, oldest first (export; deleted ones excluded). */
    public List<PostRow> byAuthor(UUID authorId) {
        return jdbc.sql(
                        SELECT
                                + " WHERE p.author_id = :author AND p.deleted_at IS NULL ORDER BY"
                                + " p.created_at, p.id")
                .param("author", authorId)
                .query(PostRepository::map)
                .list();
    }

    /** Account deletion: soft-deletes the author's posts and erases their text. */
    public int eraseByAuthor(UUID authorId, Instant now) {
        return jdbc.sql(
                        "UPDATE community_post SET deleted_at = COALESCE(deleted_at, :now),"
                                + " deleted_by = COALESCE(deleted_by, :author), body = '[deleted]',"
                                + " payload = '{}'::jsonb WHERE author_id = :author")
                .param("author", authorId)
                .param("now", Timestamp.from(now))
                .update();
    }

    static String visible(String alias) {
        return alias
                + ".deleted_at IS NULL AND "
                + alias
                + ".moderation_state <> 'REMOVED' AND "
                + authorListed(alias);
    }

    private static PostRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp editedAt = rs.getTimestamp("edited_at");
        Timestamp deletedAt = rs.getTimestamp("deleted_at");
        Timestamp lastReplyAt = rs.getTimestamp("last_reply_at");
        return new PostRow(
                rs.getObject("id", UUID.class),
                rs.getObject("channel_id", UUID.class),
                rs.getString("channel_slug"),
                rs.getString("channel_status"),
                rs.getObject("author_id", UUID.class),
                rs.getString("body"),
                rs.getString("payload"),
                rs.getTimestamp("created_at").toInstant(),
                editedAt == null ? null : editedAt.toInstant(),
                deletedAt == null ? null : deletedAt.toInstant(),
                rs.getString("moderation_state"),
                rs.getInt("reply_count"),
                lastReplyAt == null ? null : lastReplyAt.toInstant());
    }

    /** A stored post. */
    public record PostRow(
            UUID id,
            UUID channelId,
            String channelSlug,
            String channelStatus,
            UUID authorId,
            String body,
            String payloadJson,
            Instant createdAt,
            @Nullable Instant editedAt,
            @Nullable Instant deletedAt,
            String moderationState,
            int replyCount,
            @Nullable Instant lastReplyAt) {}
}
