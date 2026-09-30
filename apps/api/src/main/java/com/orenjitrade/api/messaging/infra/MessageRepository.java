package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.common.TimeCursor;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
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
 * {@code message} and {@code message_attachment} access; used only inside the messaging module.
 * Pages use the keyset {@code (created_at, id)} on {@code ix_message_conversation_created}.
 */
@Repository
public class MessageRepository {

    private static final String COLUMNS =
            "id, conversation_id, sender_id, kind, body, payload::text AS payload, created_at,"
                    + " edited_at, deleted_at, moderation_state";

    private final JdbcClient jdbc;

    public MessageRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(
            UUID id,
            UUID conversationId,
            @Nullable UUID senderId,
            String kind,
            String body,
            String payloadJson,
            Instant createdAt,
            String moderationState) {
        jdbc.sql(
                        """
                        INSERT INTO message (id, conversation_id, sender_id, kind, body, payload,
                            created_at, moderation_state)
                        VALUES (:id, :conversationId, :senderId, :kind, :body,
                            CAST(:payload AS jsonb), :createdAt, :state)
                        """)
                .param("id", id)
                .param("conversationId", conversationId)
                .param("senderId", senderId, Types.OTHER)
                .param("kind", kind)
                .param("body", body)
                .param("payload", payloadJson)
                .param("createdAt", Timestamp.from(createdAt))
                .param("state", moderationState)
                .update();
    }

    /**
     * Inserts a SYSTEM message (no sender) unless one with the same {@code payload.systemKey}
     * exists ({@code uq_message_system_key}); the payload must carry that key.
     *
     * @return whether a row was inserted
     */
    public boolean insertSystemIfAbsent(
            UUID id, UUID conversationId, String body, String payloadJson, Instant createdAt) {
        return jdbc.sql(
                                """
                                INSERT INTO message (id, conversation_id, sender_id, kind, body,
                                    payload, created_at, moderation_state)
                                VALUES (:id, :conversationId, NULL, 'SYSTEM', :body,
                                    CAST(:payload AS jsonb), :createdAt, 'OK')
                                ON CONFLICT ((payload ->> 'systemKey'))
                                    WHERE (payload ->> 'systemKey') IS NOT NULL DO NOTHING
                                """)
                        .param("id", id)
                        .param("conversationId", conversationId)
                        .param("body", body)
                        .param("payload", payloadJson)
                        .param("createdAt", Timestamp.from(createdAt))
                        .update()
                > 0;
    }

    /** The message posted with a SYSTEM de-duplication key, if any. */
    public Optional<UUID> findIdBySystemKey(String systemKey) {
        return jdbc.sql("SELECT id FROM message WHERE (payload ->> 'systemKey') = :key")
                .param("key", systemKey)
                .query(UUID.class)
                .optional();
    }

    /** Newest first, strictly older than the cursor, at most {@code limit} rows. */
    public List<MessageRow> page(UUID conversationId, @Nullable TimeCursor cursor, int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("id", conversationId);
        params.put("limit", limit);
        String keyset = "";
        if (cursor != null) {
            keyset = " AND (created_at, id) < (:cursorAt, :cursorId)";
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM message WHERE conversation_id = :id AND deleted_at IS NULL"
                                + keyset
                                + " ORDER BY created_at DESC, id DESC LIMIT :limit")
                .params(params)
                .query(MessageRepository::map)
                .list();
    }

    /**
     * Messages per sender of a conversation (deleted and SYSTEM messages excluded): rating
     * eligibility counts at least 3 messages from each side (Phase 7).
     */
    public Map<UUID, Long> countsBySender(UUID conversationId) {
        Map<UUID, Long> counts = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT sender_id, count(*) AS messages FROM message WHERE conversation_id"
                                + " = :id AND deleted_at IS NULL AND kind <> 'SYSTEM' AND sender_id"
                                + " IS NOT NULL GROUP BY sender_id")
                .param("id", conversationId)
                .query(
                        rs -> {
                            counts.put(
                                    rs.getObject("sender_id", UUID.class), rs.getLong("messages"));
                        });
        return counts;
    }

    /** A message of a conversation (deleted ones excluded). */
    public Optional<MessageRow> find(UUID conversationId, UUID messageId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM message WHERE id = :messageId AND conversation_id = :id"
                                + " AND deleted_at IS NULL")
                .param("id", conversationId)
                .param("messageId", messageId)
                .query(MessageRepository::map)
                .optional();
    }

    public void insertAttachment(
            UUID id,
            UUID messageId,
            String storageKey,
            String url,
            int width,
            int height,
            int bytes,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO message_attachment (id, message_id, storage_key, url, width,
                            height, bytes, created_at)
                        VALUES (:id, :messageId, :key, :url, :width, :height, :bytes, :now)
                        """)
                .param("id", id)
                .param("messageId", messageId)
                .param("key", storageKey)
                .param("url", url)
                .param("width", width)
                .param("height", height)
                .param("bytes", bytes)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The first attachment of each message, by message id. */
    public Map<UUID, AttachmentRow> attachmentsOf(Collection<UUID> messageIds) {
        Map<UUID, AttachmentRow> result = new LinkedHashMap<>();
        if (messageIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT id, message_id, storage_key, width, height FROM message_attachment"
                                + " WHERE message_id IN (:ids) ORDER BY created_at, id")
                .param("ids", messageIds)
                .query(
                        (rs, rowNum) ->
                                new AttachmentRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("message_id", UUID.class),
                                        rs.getString("storage_key"),
                                        rs.getInt("width"),
                                        rs.getInt("height")))
                .list()
                .forEach(row -> result.putIfAbsent(row.messageId(), row));
        return result;
    }

    /** Messages sent by an account, oldest first (export). */
    public List<MessageRow> sentBy(UUID senderId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM message WHERE sender_id = :sender AND deleted_at IS NULL"
                                + " ORDER BY created_at, id")
                .param("sender", senderId)
                .query(MessageRepository::map)
                .list();
    }

    /**
     * Erases the content of every message an account sent (account deletion): the rows stay so the
     * other participant's history keeps its shape, but text, links and photos are gone.
     *
     * @return storage keys of the removed photos (to delete after commit)
     */
    public List<String> eraseSentBy(UUID senderId, Instant now) {
        List<String> keys =
                jdbc.sql(
                                "SELECT a.storage_key FROM message_attachment a JOIN message m ON"
                                        + " m.id = a.message_id WHERE m.sender_id = :sender")
                        .param("sender", senderId)
                        .query(String.class)
                        .list();
        jdbc.sql(
                        "DELETE FROM message_attachment a USING message m WHERE m.id ="
                                + " a.message_id AND m.sender_id = :sender")
                .param("sender", senderId)
                .update();
        jdbc.sql(
                        "UPDATE message SET body = '', payload = '{}'::jsonb, deleted_at ="
                                + " COALESCE(deleted_at, :now) WHERE sender_id = :sender")
                .param("sender", senderId)
                .param("now", Timestamp.from(now))
                .update();
        return keys;
    }

    private static MessageRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp editedAt = rs.getTimestamp("edited_at");
        return new MessageRow(
                rs.getObject("id", UUID.class),
                rs.getObject("conversation_id", UUID.class),
                rs.getObject("sender_id", UUID.class),
                rs.getString("kind"),
                rs.getString("body"),
                rs.getString("payload"),
                rs.getTimestamp("created_at").toInstant(),
                editedAt == null ? null : editedAt.toInstant(),
                rs.getString("moderation_state"));
    }

    /** A stored message. */
    public record MessageRow(
            UUID id,
            UUID conversationId,
            @Nullable UUID senderId,
            String kind,
            String body,
            String payloadJson,
            Instant createdAt,
            @Nullable Instant editedAt,
            String moderationState) {}

    /** A stored photo of a message. */
    public record AttachmentRow(
            UUID id, UUID messageId, String storageKey, int width, int height) {}
}
