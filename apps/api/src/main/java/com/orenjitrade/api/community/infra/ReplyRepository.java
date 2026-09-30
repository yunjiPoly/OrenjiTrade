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
 * {@code community_reply} access; used only inside the community module. Same visibility rule as
 * posts ({@link PostRepository}).
 */
@Repository
public class ReplyRepository {

    private static final String SELECT =
            "SELECT r.id, r.post_id, r.author_id, r.body, r.created_at, r.deleted_at,"
                    + " r.moderation_state FROM community_reply r";

    private final JdbcClient jdbc;

    public ReplyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Visible replies of a post, oldest first, strictly after the cursor. */
    public List<ReplyRow> page(
            UUID postId,
            Collection<UUID> hiddenAuthors,
            @Nullable TimeCursor cursor,
            int limit,
            Instant now) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("postId", postId);
        params.put("now", Timestamp.from(now));
        params.put("limit", limit);
        StringBuilder where =
                new StringBuilder(" WHERE r.post_id = :postId AND ")
                        .append(PostRepository.visible("r"));
        if (!hiddenAuthors.isEmpty()) {
            where.append(" AND r.author_id NOT IN (:hidden)");
            params.put("hidden", hiddenAuthors);
        }
        if (cursor != null) {
            where.append(" AND (r.created_at, r.id) > (:cursorAt, :cursorId)");
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(SELECT + where + " ORDER BY r.created_at, r.id LIMIT :limit")
                .params(params)
                .query(ReplyRepository::map)
                .list();
    }

    /** A reply whatever its state; empty when unknown. */
    public Optional<ReplyRow> findAny(UUID replyId) {
        return jdbc.sql(SELECT + " WHERE r.id = :id")
                .param("id", replyId)
                .query(ReplyRepository::map)
                .optional();
    }

    public void insert(
            UUID id, UUID postId, UUID authorId, String body, String moderationState, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO community_reply (id, post_id, author_id, body, moderation_state,
                            created_at)
                        VALUES (:id, :postId, :authorId, :body, :state, :now)
                        """)
                .param("id", id)
                .param("postId", postId)
                .param("authorId", authorId)
                .param("body", body)
                .param("state", moderationState)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Soft delete; returns whether the reply was visible before. */
    public boolean softDelete(UUID id, UUID deletedBy, Instant now) {
        return jdbc.sql(
                                "UPDATE community_reply SET deleted_at = :now, deleted_by = :by"
                                        + " WHERE id = :id AND deleted_at IS NULL AND"
                                        + " moderation_state <> 'REMOVED'")
                        .param("id", id)
                        .param("by", deletedBy)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /** Moderator removal; returns whether the reply was visible before. */
    public boolean remove(UUID id, UUID moderatorId, String reason, Instant now) {
        return jdbc.sql(
                                "UPDATE community_reply SET moderation_state = 'REMOVED',"
                                        + " removed_reason = :reason, removed_by = :by, removed_at"
                                        + " = :now WHERE id = :id AND deleted_at IS NULL AND"
                                        + " moderation_state <> 'REMOVED'")
                        .param("id", id)
                        .param("by", moderatorId)
                        .param("reason", reason)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /** Replies of an author, oldest first (export). */
    public List<ReplyRow> byAuthor(UUID authorId) {
        return jdbc.sql(
                        SELECT
                                + " WHERE r.author_id = :author AND r.deleted_at IS NULL ORDER BY"
                                + " r.created_at, r.id")
                .param("author", authorId)
                .query(ReplyRepository::map)
                .list();
    }

    /** Account deletion: soft-deletes the author's replies and erases their text. */
    public int eraseByAuthor(UUID authorId, Instant now) {
        return jdbc.sql(
                        "UPDATE community_reply SET deleted_at = COALESCE(deleted_at, :now),"
                                + " deleted_by = COALESCE(deleted_by, :author), body = '[deleted]'"
                                + " WHERE author_id = :author")
                .param("author", authorId)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Recomputes the visible reply counters of the posts an author replied to. */
    public void recount(UUID authorId) {
        jdbc.sql(
                        """
                        UPDATE community_post p
                           SET reply_count = (SELECT count(*) FROM community_reply r
                                               WHERE r.post_id = p.id AND r.deleted_at IS NULL
                                                 AND r.moderation_state <> 'REMOVED')
                         WHERE p.id IN (SELECT post_id FROM community_reply WHERE author_id = :author)
                        """)
                .param("author", authorId)
                .update();
    }

    private static ReplyRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp deletedAt = rs.getTimestamp("deleted_at");
        return new ReplyRow(
                rs.getObject("id", UUID.class),
                rs.getObject("post_id", UUID.class),
                rs.getObject("author_id", UUID.class),
                rs.getString("body"),
                rs.getTimestamp("created_at").toInstant(),
                deletedAt == null ? null : deletedAt.toInstant(),
                rs.getString("moderation_state"));
    }

    /** A stored reply. */
    public record ReplyRow(
            UUID id,
            UUID postId,
            UUID authorId,
            String body,
            Instant createdAt,
            @Nullable Instant deletedAt,
            String moderationState) {}
}
