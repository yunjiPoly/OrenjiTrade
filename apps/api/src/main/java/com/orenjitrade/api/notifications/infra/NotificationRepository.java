package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.common.TimeCursor;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * SQL of the {@code notification} table; used only inside the notifications module. JSON columns
 * travel as text and are (de)serialised by the service.
 */
@Repository
public class NotificationRepository {

    private static final String COLUMNS =
            "id, user_id, type, title, body, data::text AS data, dedup_key, in_app, created_at,"
                    + " read_at, channel_state::text AS channel_state";

    private final JdbcClient jdbc;

    public NotificationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Serialises concurrent writers of the same key until the end of the transaction ({@code
     * pg_advisory_xact_lock}).
     */
    public void lock(String key) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", key)
                .query((rs, rowNum) -> rowNum)
                .list();
    }

    public boolean existsByDedupKey(String dedupKey) {
        return jdbc.sql("SELECT count(*) FROM notification WHERE dedup_key = :key")
                        .param("key", dedupKey)
                        .query(Long.class)
                        .single()
                > 0;
    }

    public Optional<UUID> findIdByDedupKey(String dedupKey) {
        return jdbc.sql("SELECT id FROM notification WHERE dedup_key = :key")
                .param("key", dedupKey)
                .query(UUID.class)
                .optional();
    }

    /** Inserts a notification unless its dedup key exists; the new id, or empty. */
    public Optional<UUID> insert(NewRow row) {
        return jdbc.sql(
                        """
                        INSERT INTO notification (id, user_id, type, title, body, data, dedup_key,
                                                  in_app, created_at, channel_state)
                        VALUES (:id, :userId, :type, :title, :body, CAST(:data AS jsonb), :dedupKey,
                                :inApp, :createdAt, CAST(:channelState AS jsonb))
                        ON CONFLICT (dedup_key) DO NOTHING
                        RETURNING id
                        """)
                .param("id", row.id())
                .param("userId", row.userId())
                .param("type", row.type())
                .param("title", row.title())
                .param("body", row.body())
                .param("data", row.data())
                .param("dedupKey", row.dedupKey())
                .param("inApp", row.inApp())
                .param("createdAt", Timestamp.from(row.createdAt()))
                .param("channelState", row.channelState())
                .query(UUID.class)
                .optional();
    }

    public Optional<Row> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM notification WHERE id = :id")
                .param("id", id)
                .query(NotificationRepository::map)
                .optional();
    }

    /**
     * In-app notifications of a user, newest first, after the cursor, leaving out the {@code
     * excludedTypes} (type names; empty = none); at most {@code limit} rows.
     */
    public List<Row> page(
            UUID userId,
            @Nullable TimeCursor cursor,
            boolean unreadOnly,
            Collection<String> excludedTypes,
            int limit) {
        StringBuilder sql =
                new StringBuilder("SELECT ")
                        .append(COLUMNS)
                        .append(" FROM notification WHERE user_id = :userId AND in_app");
        if (unreadOnly) {
            sql.append(" AND read_at IS NULL");
        }
        if (!excludedTypes.isEmpty()) {
            sql.append(" AND type NOT IN (:excludedTypes)");
        }
        if (cursor != null) {
            sql.append(" AND (created_at, id) < (:cursorAt, :cursorId)");
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT :limit");
        JdbcClient.StatementSpec statement =
                jdbc.sql(sql.toString()).param("userId", userId).param("limit", limit);
        if (!excludedTypes.isEmpty()) {
            statement = statement.param("excludedTypes", List.copyOf(excludedTypes));
        }
        if (cursor != null) {
            statement =
                    statement
                            .param("cursorAt", Timestamp.from(cursor.at()))
                            .param("cursorId", cursor.id());
        }
        return statement.query(NotificationRepository::map).list();
    }

    /** Unread in-app notifications of a user, leaving out the {@code excludedTypes} (names). */
    public long unreadCount(UUID userId, Collection<String> excludedTypes) {
        JdbcClient.StatementSpec statement =
                jdbc.sql(
                                "SELECT count(*) FROM notification WHERE user_id = :userId AND"
                                        + " in_app AND read_at IS NULL"
                                        + (excludedTypes.isEmpty()
                                                ? ""
                                                : " AND type NOT IN (:excludedTypes)"))
                        .param("userId", userId);
        if (!excludedTypes.isEmpty()) {
            statement = statement.param("excludedTypes", List.copyOf(excludedTypes));
        }
        return statement.query(Long.class).single();
    }

    /** Marks one in-app notification of the user read (idempotent); the row, or empty. */
    public Optional<Row> markRead(UUID userId, UUID id, Instant now) {
        return jdbc.sql(
                        "UPDATE notification SET read_at = COALESCE(read_at, :now),"
                                + " seen_at = COALESCE(seen_at, :now)"
                                + " WHERE id = :id AND user_id = :userId AND in_app RETURNING "
                                + COLUMNS)
                .param("now", Timestamp.from(now))
                .param("id", id)
                .param("userId", userId)
                .query(NotificationRepository::map)
                .optional();
    }

    /** Marks every unread in-app notification of the user read; the number changed. */
    public int markAllRead(UUID userId, Instant now) {
        return jdbc.sql(
                        "UPDATE notification SET read_at = :now, seen_at = COALESCE(seen_at, :now)"
                                + " WHERE user_id = :userId AND in_app AND read_at IS NULL")
                .param("now", Timestamp.from(now))
                .param("userId", userId)
                .update();
    }

    /** Marks the unread MESSAGE notifications of one conversation read (the user read it). */
    public int markConversationRead(UUID userId, UUID conversationId, Instant now) {
        return jdbc.sql(
                        "UPDATE notification SET read_at = :now, seen_at = COALESCE(seen_at, :now)"
                                + " WHERE user_id = :userId AND type = 'MESSAGE' AND in_app"
                                + " AND read_at IS NULL AND data ->> 'conversationId' ="
                                + " :conversationId")
                .param("now", Timestamp.from(now))
                .param("userId", userId)
                .param("conversationId", conversationId.toString())
                .update();
    }

    /**
     * Whether the user has an unread MESSAGE notification of the conversation, or got one since
     * {@code since} (per-conversation throttle).
     */
    public boolean hasRecentMessageNotification(UUID userId, UUID conversationId, Instant since) {
        return jdbc.sql(
                                "SELECT count(*) FROM notification WHERE user_id = :userId"
                                        + " AND type = 'MESSAGE' AND data ->> 'conversationId' ="
                                        + " :conversationId AND ((in_app AND read_at IS NULL)"
                                        + " OR created_at >= :since)")
                        .param("userId", userId)
                        .param("conversationId", conversationId.toString())
                        .param("since", Timestamp.from(since))
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void updateChannelState(UUID id, String channelState) {
        jdbc.sql(
                        "UPDATE notification SET channel_state = CAST(:state AS jsonb) WHERE id ="
                                + " :id")
                .param("state", channelState)
                .param("id", id)
                .update();
    }

    /** Every notification of a user (export), newest first, at most {@code limit}. */
    public List<Row> allOf(UUID userId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM notification WHERE user_id = :userId"
                                + " ORDER BY created_at DESC, id DESC LIMIT :limit")
                .param("userId", userId)
                .param("limit", limit)
                .query(NotificationRepository::map)
                .list();
    }

    public int deleteByDedupKey(String dedupKey) {
        return jdbc.sql("DELETE FROM notification WHERE dedup_key = :key")
                .param("key", dedupKey)
                .update();
    }

    public int deleteByUser(UUID userId) {
        return jdbc.sql("DELETE FROM notification WHERE user_id = :userId")
                .param("userId", userId)
                .update();
    }

    /**
     * The other collectors' MESSAGE rows sent by a deleted account: the sender's name in the title
     * and at the start of the body becomes {@code name} (the body keeps its phrase, one of {@code
     * phrases}, else the plain message phrase). Returns the rows changed.
     */
    public int renameMessageSender(
            UUID senderId, String title, String name, List<String> phrases, String fallback) {
        // The phrases are plain words ("sent you a photo"): no regular-expression character.
        String pattern = "(" + String.join("|", phrases) + ")\\.$";
        return jdbc.sql(
                        "UPDATE notification SET title = :title, body = :name || ' ' ||"
                                + " coalesce(substring(body from :pattern), :fallback) || '.'"
                                + " WHERE type = 'MESSAGE' AND data->>'senderId' = :senderId")
                .param("title", title)
                .param("name", name)
                .param("pattern", pattern)
                .param("fallback", fallback)
                .param("senderId", senderId.toString())
                .update();
    }

    /**
     * The other collectors' WISHLIST_ALERT rows about a deleted account's listing: the handle in
     * the body ("listed by @handle in") and in {@code data.collectorHandle} becomes {@code name}.
     */
    public int renameWishlistCollector(UUID collectorId, String name) {
        return jdbc.sql(
                        "UPDATE notification SET body = regexp_replace(body, 'listed by @\\S+ in ',"
                                + " 'listed by ' || :name || ' in '), data = jsonb_set(data,"
                                + " '{collectorHandle}', to_jsonb(CAST(:name AS text)), false)"
                                + " WHERE type = 'WISHLIST_ALERT' AND data->>'collectorId' ="
                                + " :collectorId")
                .param("name", name)
                .param("collectorId", collectorId.toString())
                .update();
    }

    /**
     * The other collectors' RATING_RECEIVED rows from a deleted account, found by its handle
     * ({@code data.raterHandle}): the title becomes {@code title}, the body's rater ("{name} rated
     * you 5/5.") and {@code data.raterHandle} become {@code name}. Returns the rows changed.
     */
    public int renameRater(String handle, String title, String name) {
        return jdbc.sql(
                        "UPDATE notification SET title = :title, body = regexp_replace(body,"
                                + " '^.* rated you ', :name || ' rated you '), data ="
                                + " jsonb_set(data, '{raterHandle}', to_jsonb(CAST(:name AS"
                                + " text)), false) WHERE type = 'RATING_RECEIVED' AND"
                                + " data->>'raterHandle' = :handle")
                .param("title", title)
                .param("name", name)
                .param("handle", handle)
                .update();
    }

    /**
     * The other collectors' SALE_RECORDED rows from a deleted account, found by its handle ({@code
     * data.sellerHandle}): the handle starting the title ("{handle} marked … as sold to you") and
     * {@code data.sellerHandle} become {@code name}. Returns the rows changed.
     */
    public int renameSeller(String handle, String name) {
        return jdbc.sql(
                        "UPDATE notification SET title = CASE WHEN left(title, length(:handle) +"
                                + " 1) = :handle || ' ' THEN :name || substring(title from"
                                + " length(:handle) + 1) ELSE title END, data = jsonb_set(data,"
                                + " '{sellerHandle}', to_jsonb(CAST(:name AS text)), false) WHERE"
                                + " type = 'SALE_RECORDED' AND data->>'sellerHandle' = :handle")
                .param("name", name)
                .param("handle", handle)
                .update();
    }

    private static Row map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp readAt = rs.getTimestamp("read_at");
        return new Row(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("type"),
                rs.getString("title"),
                rs.getString("body"),
                rs.getString("data"),
                rs.getString("dedup_key"),
                rs.getBoolean("in_app"),
                rs.getTimestamp("created_at").toInstant(),
                readAt == null ? null : readAt.toInstant(),
                rs.getString("channel_state"));
    }

    /**
     * A notification to insert.
     *
     * @param id id
     * @param userId recipient
     * @param type type name
     * @param title title
     * @param body body
     * @param data JSON object text
     * @param dedupKey idempotency key
     * @param inApp listed in the notification centre
     * @param createdAt creation time
     * @param channelState JSON object text
     */
    public record NewRow(
            UUID id,
            UUID userId,
            String type,
            String title,
            String body,
            String data,
            String dedupKey,
            boolean inApp,
            Instant createdAt,
            String channelState) {}

    /**
     * A stored notification.
     *
     * @param id id
     * @param userId recipient
     * @param type type name
     * @param title title
     * @param body body
     * @param data JSON object text
     * @param dedupKey idempotency key
     * @param inApp listed in the notification centre
     * @param createdAt creation time
     * @param readAt read time
     * @param channelState JSON object text
     */
    public record Row(
            UUID id,
            UUID userId,
            String type,
            String title,
            String body,
            String data,
            String dedupKey,
            boolean inApp,
            Instant createdAt,
            @Nullable Instant readAt,
            String channelState) {}
}
