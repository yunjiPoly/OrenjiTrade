package com.orenjitrade.api.messaging.infra;

import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code user_block} access; used only inside the messaging module. */
@Repository
public class BlockRepository {

    /**
     * SQL predicate "a block exists between {@code a} and {@code b}" for other queries of this
     * module (the columns or parameters are spliced in by the caller).
     */
    public static String blockedBetween(String a, String b) {
        return "EXISTS (SELECT 1 FROM user_block ub WHERE (ub.blocker_id = "
                + a
                + " AND ub.blocked_id = "
                + b
                + ") OR (ub.blocker_id = "
                + b
                + " AND ub.blocked_id = "
                + a
                + "))";
    }

    private final JdbcClient jdbc;

    public BlockRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Creates the block (idempotent); returns whether a row was inserted. */
    public boolean insert(UUID blockerId, UUID blockedId, @Nullable String reason, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO user_block (blocker_id, blocked_id, created_at, reason)
                                VALUES (:blocker, :blocked, :now, :reason)
                                ON CONFLICT (blocker_id, blocked_id) DO NOTHING
                                """)
                        .param("blocker", blockerId)
                        .param("blocked", blockedId)
                        .param("now", Timestamp.from(now))
                        .param("reason", reason, Types.VARCHAR)
                        .update()
                > 0;
    }

    public boolean delete(UUID blockerId, UUID blockedId) {
        return jdbc.sql(
                                "DELETE FROM user_block WHERE blocker_id = :blocker AND blocked_id"
                                        + " = :blocked")
                        .param("blocker", blockerId)
                        .param("blocked", blockedId)
                        .update()
                > 0;
    }

    /** Whether a block exists in either direction. */
    public boolean existsBetween(UUID a, UUID b) {
        return jdbc.sql("SELECT " + blockedBetween(":a", ":b"))
                .param("a", a)
                .param("b", b)
                .query(Boolean.class)
                .single();
    }

    /** Blocks created by {@code blockerId}, newest first. */
    public List<Row> blockedBy(UUID blockerId) {
        return jdbc.sql(
                        "SELECT blocked_id, created_at FROM user_block WHERE blocker_id ="
                                + " :blocker ORDER BY created_at DESC, blocked_id")
                .param("blocker", blockerId)
                .query(
                        (rs, rowNum) ->
                                new Row(
                                        rs.getObject("blocked_id", UUID.class),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    /** Accounts blocked by {@code userId} or blocking {@code userId}. */
    public List<UUID> blockedEitherWay(UUID userId) {
        return jdbc.sql(
                        "SELECT blocked_id FROM user_block WHERE blocker_id = :id UNION SELECT"
                                + " blocker_id FROM user_block WHERE blocked_id = :id")
                .param("id", userId)
                .query(UUID.class)
                .list();
    }

    /** Deletes every block involving the account (account deletion). */
    public int deleteAllOf(UUID userId) {
        return jdbc.sql("DELETE FROM user_block WHERE blocker_id = :id OR blocked_id = :id")
                .param("id", userId)
                .update();
    }

    /** One block of the caller. */
    public record Row(UUID blockedId, Instant createdAt) {}
}
