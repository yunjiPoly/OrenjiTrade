package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.common.TimeCursor;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code conversation}, {@code conversation_participant} and {@code conversation_pair} access; used
 * only inside the messaging module. The pair table makes {@code POST /conversations} idempotent
 * even under concurrent calls (the second insert of a pair does nothing and the existing
 * conversation is returned).
 */
@Repository
public class ConversationRepository {

    private static final String SUMMARY_SELECT =
            """
            SELECT c.id, c.created_at, c.last_message_id, c.last_message_at,
                   c.last_message_preview, c.last_message_kind, c.last_message_sender_id,
                   COALESCE(c.last_message_at, c.created_at) AS sort_at,
                   me.muted, me.archived, me.last_read_at, other.user_id AS other_id,
                   c.subject_item_id, c.subject_binder_id, c.subject_set_at, c.subject_set_by,
                   (SELECT jsonb_build_object('sale', lm.payload -> 'sale',
                                              'offer', (lm.payload -> 'offer') IS NOT NULL)::text
                      FROM message lm
                     WHERE lm.id = c.last_message_id AND lm.kind = 'SYSTEM') AS last_system,
                   (SELECT count(*) FROM message m
                     WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                       AND m.sender_id IS DISTINCT FROM me.user_id
                       AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at))
                       AS unread_count
              FROM conversation_participant me
              JOIN conversation c ON c.id = me.conversation_id
              JOIN conversation_participant other
                ON other.conversation_id = c.id AND other.user_id <> me.user_id
            """;

    private final JdbcClient jdbc;

    public ConversationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The DIRECT conversation of a pair, if any. */
    public Optional<UUID> findByPair(UUID a, UUID b) {
        return jdbc.sql(
                        "SELECT conversation_id FROM conversation_pair WHERE user_low = LEAST(:a,"
                                + " :b) AND user_high = GREATEST(:a, :b)")
                .param("a", a)
                .param("b", b)
                .query(UUID.class)
                .optional();
    }

    /**
     * Creates the DIRECT conversation of a pair with both participants, or returns the existing one
     * when a concurrent request (or an earlier one) created it first.
     *
     * @return the conversation id and whether it was created by this call
     */
    public Created createDirect(UUID id, UUID createdBy, UUID other, Instant now) {
        Timestamp at = Timestamp.from(now);
        jdbc.sql(
                        "INSERT INTO conversation (id, kind, created_by, created_at, updated_at)"
                                + " VALUES (:id, 'DIRECT', :createdBy, :at, :at)")
                .param("id", id)
                .param("createdBy", createdBy)
                .param("at", at)
                .update();
        int paired =
                jdbc.sql(
                                "INSERT INTO conversation_pair (user_low, user_high,"
                                        + " conversation_id) VALUES (LEAST(:a, :b), GREATEST(:a,"
                                        + " :b), :id) ON CONFLICT (user_low, user_high) DO NOTHING")
                        .param("a", createdBy)
                        .param("b", other)
                        .param("id", id)
                        .update();
        if (paired == 0) {
            jdbc.sql("DELETE FROM conversation WHERE id = :id").param("id", id).update();
            return new Created(findByPair(createdBy, other).orElseThrow(), false);
        }
        for (UUID participant : List.of(createdBy, other)) {
            jdbc.sql(
                            "INSERT INTO conversation_participant (conversation_id, user_id,"
                                    + " joined_at) VALUES (:id, :userId, :at)")
                    .param("id", id)
                    .param("userId", participant)
                    .param("at", at)
                    .update();
        }
        return new Created(id, true);
    }

    /** The participant row of {@code userId}, empty when they are not a participant. */
    public Optional<ParticipantRow> participant(UUID conversationId, UUID userId) {
        return jdbc.sql(
                        "SELECT conversation_id, user_id, last_read_at, last_read_message_id,"
                                + " muted, archived FROM conversation_participant WHERE"
                                + " conversation_id = :id AND user_id = :userId")
                .param("id", conversationId)
                .param("userId", userId)
                .query(ConversationRepository::participant)
                .optional();
    }

    /** Both participant rows of a conversation. */
    public List<ParticipantRow> participants(UUID conversationId) {
        return jdbc.sql(
                        "SELECT conversation_id, user_id, last_read_at, last_read_message_id,"
                                + " muted, archived FROM conversation_participant WHERE"
                                + " conversation_id = :id ORDER BY user_id")
                .param("id", conversationId)
                .query(ConversationRepository::participant)
                .list();
    }

    /**
     * One slice of the caller's conversations, most recent activity first: conversations with at
     * least one message (or created by the caller), without the ones hidden by a block in either
     * direction; {@code archived} selects the archive or the inbox.
     */
    public List<SummaryRow> summaries(
            UUID userId, boolean archived, @Nullable TimeCursor cursor, int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("me", userId);
        params.put("archived", archived);
        params.put("limit", limit);
        StringBuilder where =
                new StringBuilder(
                        " WHERE me.user_id = :me AND me.archived = :archived"
                                + " AND (c.last_message_at IS NOT NULL OR c.created_by = :me)"
                                + " AND NOT "
                                + BlockRepository.blockedBetween("me.user_id", "other.user_id"));
        if (cursor != null) {
            where.append(
                    " AND (COALESCE(c.last_message_at, c.created_at), c.id) < (:cursorAt,"
                            + " :cursorId)");
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(SUMMARY_SELECT + where + " ORDER BY sort_at DESC, c.id DESC LIMIT :limit")
                .params(params)
                .query(ConversationRepository::summary)
                .list();
    }

    /** The summary of one conversation for one participant. */
    public Optional<SummaryRow> summary(UUID conversationId, UUID userId) {
        return jdbc.sql(SUMMARY_SELECT + " WHERE me.user_id = :me AND c.id = :id")
                .param("me", userId)
                .param("id", conversationId)
                .query(ConversationRepository::summary)
                .optional();
    }

    /**
     * Pins the chat's subject (stage R4): a card ({@code itemId}) or a deck core ({@code
     * binderId}), the latest wins. Pinning the subject the chat already has pins it again: its time
     * and who pinned it are those of this pin, so an earlier sale of it no longer marks the chat
     * "Sold" (the seller can record a sale of the copies left) and a card its owner shares is shown
     * to the other collector even when it is private (review fix 1, findings F5 and F6). The caller
     * holds the item or the binder {@code FOR KEY SHARE} before this update takes the conversation
     * row.
     *
     * @return whether the conversation exists
     */
    public boolean setSubject(
            UUID conversationId,
            @Nullable UUID itemId,
            @Nullable UUID binderId,
            UUID setBy,
            Instant at) {
        return jdbc.sql(
                                """
                                UPDATE conversation
                                   SET subject_item_id = :itemId, subject_binder_id = :binderId,
                                       subject_set_at = :at, subject_set_by = :setBy
                                 WHERE id = :id
                                """)
                        .param("id", conversationId)
                        .param("itemId", itemId, Types.OTHER)
                        .param("binderId", binderId, Types.OTHER)
                        .param("setBy", setBy)
                        .param("at", Timestamp.from(at))
                        .update()
                > 0;
    }

    /** The stored subject of a conversation (empty for an unknown conversation). */
    public Optional<SubjectRef> subjectOf(UUID conversationId) {
        return jdbc.sql(
                        "SELECT subject_item_id, subject_binder_id, subject_set_at, subject_set_by"
                                + " FROM conversation WHERE id = :id")
                .param("id", conversationId)
                .query(
                        (rs, rowNum) -> {
                            Timestamp setAt = rs.getTimestamp("subject_set_at");
                            return new SubjectRef(
                                    rs.getObject("subject_item_id", UUID.class),
                                    rs.getObject("subject_binder_id", UUID.class),
                                    setAt == null ? null : setAt.toInstant(),
                                    rs.getObject("subject_set_by", UUID.class));
                        })
                .optional();
    }

    /** A conversation left without any message keeps no last message (the undo of a sale). */
    public void clearLastMessage(UUID conversationId) {
        jdbc.sql(
                        """
                        UPDATE conversation
                           SET last_message_id = NULL, last_message_at = NULL,
                               last_message_preview = NULL, last_message_kind = NULL,
                               last_message_sender_id = NULL
                         WHERE id = :id
                        """)
                .param("id", conversationId)
                .update();
    }

    /** Records the last message of a conversation (inside the message transaction). */
    public void updateLastMessage(
            UUID conversationId,
            UUID messageId,
            Instant at,
            String preview,
            String kind,
            @Nullable UUID senderId) {
        jdbc.sql(
                        """
                        UPDATE conversation
                           SET last_message_id = :messageId, last_message_at = :at,
                               last_message_preview = :preview, last_message_kind = :kind,
                               last_message_sender_id = :senderId, updated_at = :at
                         WHERE id = :id
                        """)
                .param("id", conversationId)
                .param("messageId", messageId)
                .param("at", Timestamp.from(at))
                .param("preview", preview)
                .param("kind", kind)
                .param("senderId", senderId, Types.OTHER)
                .update();
    }

    /** A new message brings the conversation back to both inboxes. */
    public void unarchive(UUID conversationId) {
        jdbc.sql(
                        "UPDATE conversation_participant SET archived = false WHERE"
                                + " conversation_id = :id AND archived")
                .param("id", conversationId)
                .update();
    }

    /**
     * Moves the read marker forward (never backward).
     *
     * @return whether it moved
     */
    public boolean markRead(UUID conversationId, UUID userId, Instant at, UUID messageId) {
        return jdbc.sql(
                                """
                                UPDATE conversation_participant
                                   SET last_read_at = :at, last_read_message_id = :messageId
                                 WHERE conversation_id = :id AND user_id = :userId
                                   AND (last_read_at IS NULL OR last_read_at < :at)
                                """)
                        .param("id", conversationId)
                        .param("userId", userId)
                        .param("at", Timestamp.from(at))
                        .param("messageId", messageId)
                        .update()
                > 0;
    }

    /** Changes the caller's switches; {@code null} keeps a value. */
    public void updateSwitches(
            UUID conversationId, UUID userId, @Nullable Boolean muted, @Nullable Boolean archived) {
        jdbc.sql(
                        """
                        UPDATE conversation_participant
                           SET muted = COALESCE(:muted, muted), archived = COALESCE(:archived, archived)
                         WHERE conversation_id = :id AND user_id = :userId
                        """)
                .param("id", conversationId)
                .param("userId", userId)
                .param("muted", muted, Types.BOOLEAN)
                .param("archived", archived, Types.BOOLEAN)
                .update();
    }

    /** The other participants of every conversation of {@code userId} (presence notices). */
    public List<UUID> partnersOf(UUID userId) {
        return jdbc.sql(
                        """
                        SELECT DISTINCT other.user_id
                          FROM conversation_participant me
                          JOIN conversation_participant other
                            ON other.conversation_id = me.conversation_id AND other.user_id <> me.user_id
                         WHERE me.user_id = :me
                        """)
                .param("me", userId)
                .query(UUID.class)
                .list();
    }

    /**
     * Conversations whose last message came from the other participant between {@code from}
     * (inclusive) and {@code to} (exclusive): one row per waiting participant, blocked pairs and
     * SYSTEM messages excluded (Phase 7 strikes).
     */
    public List<WaitingRow> waitingBetween(Instant from, Instant to) {
        return jdbc.sql(
                        """
                        SELECT cp.user_id, c.id AS conversation_id, c.last_message_at
                          FROM conversation c
                          JOIN conversation_participant cp ON cp.conversation_id = c.id
                         WHERE c.last_message_at >= :from AND c.last_message_at < :to
                           AND c.last_message_sender_id IS NOT NULL
                           AND c.last_message_sender_id <> cp.user_id
                           AND c.last_message_kind <> 'SYSTEM'
                           AND NOT EXISTS (
                               SELECT 1 FROM user_block ub
                                WHERE (ub.blocker_id = cp.user_id AND ub.blocked_id = c.last_message_sender_id)
                                   OR (ub.blocker_id = c.last_message_sender_id AND ub.blocked_id = cp.user_id))
                        """)
                .param("from", Timestamp.from(from))
                .param("to", Timestamp.from(to))
                .query(
                        (rs, rowNum) ->
                                new WaitingRow(
                                        rs.getObject("user_id", UUID.class),
                                        rs.getObject("conversation_id", UUID.class),
                                        rs.getTimestamp("last_message_at").toInstant()))
                .list();
    }

    /** Conversation ids of an account (export). */
    public List<UUID> conversationIdsOf(UUID userId) {
        return jdbc.sql(
                        "SELECT conversation_id FROM conversation_participant WHERE user_id = :me"
                                + " ORDER BY joined_at, conversation_id")
                .param("me", userId)
                .query(UUID.class)
                .list();
    }

    private static ParticipantRow participant(ResultSet rs, int rowNum) throws SQLException {
        Timestamp lastRead = rs.getTimestamp("last_read_at");
        return new ParticipantRow(
                rs.getObject("conversation_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                lastRead == null ? null : lastRead.toInstant(),
                rs.getObject("last_read_message_id", UUID.class),
                rs.getBoolean("muted"),
                rs.getBoolean("archived"));
    }

    private static SummaryRow summary(ResultSet rs, int rowNum) throws SQLException {
        Timestamp lastMessageAt = rs.getTimestamp("last_message_at");
        Timestamp lastRead = rs.getTimestamp("last_read_at");
        Timestamp subjectSetAt = rs.getTimestamp("subject_set_at");
        return new SummaryRow(
                rs.getObject("id", UUID.class),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("sort_at").toInstant(),
                rs.getObject("other_id", UUID.class),
                rs.getObject("last_message_id", UUID.class),
                lastMessageAt == null ? null : lastMessageAt.toInstant(),
                rs.getString("last_message_preview"),
                rs.getString("last_message_kind"),
                rs.getObject("last_message_sender_id", UUID.class),
                rs.getBoolean("muted"),
                rs.getBoolean("archived"),
                lastRead == null ? null : lastRead.toInstant(),
                rs.getInt("unread_count"),
                new SubjectRef(
                        rs.getObject("subject_item_id", UUID.class),
                        rs.getObject("subject_binder_id", UUID.class),
                        subjectSetAt == null ? null : subjectSetAt.toInstant(),
                        rs.getObject("subject_set_by", UUID.class)),
                rs.getString("last_system"));
    }

    /** A participant waiting to answer since {@code since}. */
    public record WaitingRow(UUID userId, UUID conversationId, Instant since) {}

    /** Result of {@link #createDirect}. */
    public record Created(UUID conversationId, boolean created) {}

    /** A participant row. */
    public record ParticipantRow(
            UUID conversationId,
            UUID userId,
            @Nullable Instant lastReadAt,
            @Nullable UUID lastReadMessageId,
            boolean muted,
            boolean archived) {}

    /** A conversation as seen by one participant. */
    public record SummaryRow(
            UUID id,
            Instant createdAt,
            Instant sortAt,
            UUID otherId,
            @Nullable UUID lastMessageId,
            @Nullable Instant lastMessageAt,
            @Nullable String lastMessagePreview,
            @Nullable String lastMessageKind,
            @Nullable UUID lastMessageSenderId,
            boolean muted,
            boolean archived,
            @Nullable Instant lastReadAt,
            int unreadCount,
            SubjectRef subject,
            @Nullable String lastSystemJson) {}

    /**
     * The stored subject of a conversation (stage R4): at most one of the item and the binder.
     *
     * @param itemId the card
     * @param binderId the deck core
     * @param setAt when it was pinned
     * @param setBy who pinned it
     */
    public record SubjectRef(
            @Nullable UUID itemId,
            @Nullable UUID binderId,
            @Nullable Instant setAt,
            @Nullable UUID setBy) {

        public boolean isEmpty() {
            return itemId == null && binderId == null;
        }
    }
}
