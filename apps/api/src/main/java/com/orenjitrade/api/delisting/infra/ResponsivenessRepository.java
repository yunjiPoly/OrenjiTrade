package com.orenjitrade.api.delisting.infra;

import com.orenjitrade.api.delisting.domain.PauseSource;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code user_responsiveness} access (strikes and listing pauses). {@link #hasPublicListings} reads
 * the materialised {@code publicly_listed} flags of the inventory and binders tables read-only (the
 * delist job only pauses owners who have something public).
 */
@Repository
public class ResponsivenessRepository {

    private static final String COLUMNS =
            "user_id, unanswered_conversations_30d, strikes, strikes_reset_at, evaluated_at,"
                    + " paused_at, paused_until, pause_source, pause_reason, paused_by";

    private final JdbcClient jdbc;

    public ResponsivenessRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Row> find(UUID userId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM user_responsiveness WHERE user_id = :id")
                .param("id", userId)
                .query(ResponsivenessRepository::map)
                .optional();
    }

    /** Creates the row when missing and locks it for the caller's transaction. */
    public Row lock(UUID userId, Instant now) {
        jdbc.sql(
                        "INSERT INTO user_responsiveness (user_id, updated_at) VALUES (:id, :now)"
                                + " ON CONFLICT (user_id) DO NOTHING")
                .param("id", userId)
                .param("now", Timestamp.from(now))
                .update();
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM user_responsiveness WHERE user_id = :id FOR UPDATE")
                .param("id", userId)
                .query(ResponsivenessRepository::map)
                .single();
    }

    public void setPause(
            UUID userId,
            PauseSource source,
            @Nullable String reason,
            @Nullable Instant until,
            @Nullable UUID pausedBy,
            Instant pausedAt,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE user_responsiveness
                           SET paused_at = :pausedAt, paused_until = :until, pause_source = :source,
                               pause_reason = :reason, paused_by = :pausedBy, updated_at = :now
                         WHERE user_id = :id
                        """)
                .param("id", userId)
                .param("pausedAt", Timestamp.from(pausedAt))
                .param("until", until == null ? null : Timestamp.from(until), Types.TIMESTAMP)
                .param("source", source.name())
                .param("reason", reason, Types.VARCHAR)
                .param("pausedBy", pausedBy, Types.OTHER)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void clearPause(UUID userId, Instant now) {
        jdbc.sql(
                        "UPDATE user_responsiveness SET paused_at = NULL, paused_until = NULL,"
                                + " pause_source = NULL, pause_reason = NULL, paused_by = NULL,"
                                + " updated_at = :now WHERE user_id = :id")
                .param("id", userId)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The owner resumed: strikes start again from now. */
    public void resetStrikes(UUID userId, Instant now) {
        jdbc.sql(
                        "UPDATE user_responsiveness SET strikes = 0, strikes_reset_at = :now,"
                                + " updated_at = :now WHERE user_id = :id")
                .param("id", userId)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** {@code strikes_reset_at} of the given users that have one. */
    public Map<UUID, Instant> strikeResets(Collection<UUID> userIds) {
        Map<UUID, Instant> result = new HashMap<>();
        if (userIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT user_id, strikes_reset_at FROM user_responsiveness WHERE user_id IN"
                                + " (:ids) AND strikes_reset_at IS NOT NULL")
                .param("ids", userIds)
                .query(
                        rs -> {
                            result.put(
                                    rs.getObject("user_id", UUID.class),
                                    rs.getTimestamp("strikes_reset_at").toInstant());
                        });
        return result;
    }

    /** Stores the nightly evaluation of one collector. */
    public void saveStrikes(UUID userId, int unanswered, int strikes, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO user_responsiveness (user_id, unanswered_conversations_30d,
                            strikes, evaluated_at, updated_at)
                        VALUES (:id, :unanswered, :strikes, :now, :now)
                        ON CONFLICT (user_id) DO UPDATE
                           SET unanswered_conversations_30d = EXCLUDED.unanswered_conversations_30d,
                               strikes = EXCLUDED.strikes, evaluated_at = EXCLUDED.evaluated_at,
                               updated_at = EXCLUDED.updated_at
                        """)
                .param("id", userId)
                .param("unanswered", unanswered)
                .param("strikes", strikes)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Collectors with a count but no unanswered conversation any more: back to zero. */
    public int clearStrikesExcept(Collection<UUID> keep, Instant now) {
        String sql =
                "UPDATE user_responsiveness SET unanswered_conversations_30d = 0, strikes = 0,"
                        + " evaluated_at = :now, updated_at = :now WHERE"
                        + " (unanswered_conversations_30d > 0 OR strikes > 0)";
        JdbcClient.StatementSpec statement;
        if (keep.isEmpty()) {
            statement = jdbc.sql(sql);
        } else {
            statement = jdbc.sql(sql + " AND user_id NOT IN (:keep)").param("keep", keep);
        }
        return statement.param("now", Timestamp.from(now)).update();
    }

    /** Collectors whose timed pause ended at or before {@code now}. */
    public List<Row> expiredPauses(Instant now) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM user_responsiveness WHERE paused_at IS NOT NULL AND"
                                + " paused_until IS NOT NULL AND paused_until <= :now")
                .param("now", Timestamp.from(now))
                .query(ResponsivenessRepository::map)
                .list();
    }

    /** Owners with a pause in force at {@code now}. */
    public long countPaused(Instant now) {
        return jdbc.sql(
                        "SELECT count(*) FROM user_responsiveness WHERE paused_at IS NOT NULL AND"
                                + " (paused_until IS NULL OR paused_until > :now)")
                .param("now", Timestamp.from(now))
                .query(Long.class)
                .single();
    }

    /** Whether the collector currently has a publicly listed item or binder (read-only). */
    public boolean hasPublicListings(UUID userId) {
        Boolean listed =
                jdbc.sql(
                                "SELECT EXISTS (SELECT 1 FROM inventory_item WHERE owner_id = :id"
                                        + " AND publicly_listed AND deleted_at IS NULL) OR EXISTS"
                                        + " (SELECT 1 FROM binder WHERE owner_id = :id AND"
                                        + " publicly_listed)")
                        .param("id", userId)
                        .query(Boolean.class)
                        .single();
        return Boolean.TRUE.equals(listed);
    }

    private static Row map(ResultSet rs, int rowNum) throws SQLException {
        String source = rs.getString("pause_source");
        return new Row(
                rs.getObject("user_id", UUID.class),
                rs.getInt("unanswered_conversations_30d"),
                rs.getInt("strikes"),
                instant(rs.getTimestamp("strikes_reset_at")),
                instant(rs.getTimestamp("evaluated_at")),
                instant(rs.getTimestamp("paused_at")),
                instant(rs.getTimestamp("paused_until")),
                source == null ? null : PauseSource.valueOf(source),
                rs.getString("pause_reason"),
                rs.getObject("paused_by", UUID.class));
    }

    private static @Nullable Instant instant(@Nullable Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    /** One stored row. */
    public record Row(
            UUID userId,
            int unanswered,
            int strikes,
            @Nullable Instant strikesResetAt,
            @Nullable Instant evaluatedAt,
            @Nullable Instant pausedAt,
            @Nullable Instant pausedUntil,
            @Nullable PauseSource source,
            @Nullable String reason,
            @Nullable UUID pausedBy) {}
}
