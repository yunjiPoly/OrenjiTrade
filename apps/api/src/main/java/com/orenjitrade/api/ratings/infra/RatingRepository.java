package com.orenjitrade.api.ratings.infra;

import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.RatingModerationState;
import com.orenjitrade.api.ratings.domain.RatingRow;
import com.orenjitrade.api.ratings.domain.RatingScores;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code rating} and {@code rating_summary} access; used only inside the ratings module. */
@Repository
public class RatingRepository {

    private static final String COLUMNS =
            "r.id, r.interaction_id, x.kind AS interaction_kind, r.rater_id, r.ratee_id, r.overall,"
                    + " r.communication, r.condition_accuracy, r.shipping, r.meetup_reliability,"
                    + " r.comment, r.created_at, r.updated_at, r.moderation_state,"
                    + " r.hidden_reason, r.hidden_by, r.hidden_at";

    private static final String FROM =
            " FROM rating r JOIN interaction x ON x.id = r.interaction_id";

    private final JdbcClient jdbc;

    public RatingRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    /**
     * Inserts a rating unless the rater already rated the interaction.
     *
     * @return whether a row was inserted
     */
    public boolean insertIfAbsent(
            UUID id,
            UUID interactionId,
            UUID raterId,
            UUID rateeId,
            RatingScores scores,
            @Nullable String comment,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO rating (id, interaction_id, rater_id, ratee_id, overall,
                                    communication, condition_accuracy, shipping, meetup_reliability,
                                    comment, created_at, updated_at)
                                VALUES (:id, :interactionId, :raterId, :rateeId, :overall,
                                    :communication, :conditionAccuracy, :shipping, :meetup,
                                    :comment, :now, :now)
                                ON CONFLICT (interaction_id, rater_id) DO NOTHING
                                """)
                        .param("id", id)
                        .param("interactionId", interactionId)
                        .param("raterId", raterId)
                        .param("rateeId", rateeId)
                        .param("overall", scores.overall())
                        .param("communication", scores.communication(), Types.INTEGER)
                        .param("conditionAccuracy", scores.conditionAccuracy(), Types.INTEGER)
                        .param("shipping", scores.shipping(), Types.INTEGER)
                        .param("meetup", scores.meetupReliability(), Types.INTEGER)
                        .param("comment", comment, Types.VARCHAR)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void update(UUID id, RatingScores scores, @Nullable String comment, Instant now) {
        jdbc.sql(
                        """
                        UPDATE rating SET overall = :overall, communication = :communication,
                               condition_accuracy = :conditionAccuracy, shipping = :shipping,
                               meetup_reliability = :meetup, comment = :comment, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("overall", scores.overall())
                .param("communication", scores.communication(), Types.INTEGER)
                .param("conditionAccuracy", scores.conditionAccuracy(), Types.INTEGER)
                .param("shipping", scores.shipping(), Types.INTEGER)
                .param("meetup", scores.meetupReliability(), Types.INTEGER)
                .param("comment", comment, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Sets the moderation state (HIDDEN with reason/moderator/time, OK clears them). */
    public void setModeration(
            UUID id,
            RatingModerationState state,
            @Nullable String reason,
            @Nullable UUID moderatorId,
            Instant now) {
        boolean hidden = state == RatingModerationState.HIDDEN;
        jdbc.sql(
                        "UPDATE rating SET moderation_state = :state, hidden_reason = :reason,"
                                + " hidden_by = :by, hidden_at = :at WHERE id = :id")
                .param("id", id)
                .param("state", state.name())
                .param("reason", hidden ? reason : null, Types.VARCHAR)
                .param("by", hidden ? moderatorId : null, Types.OTHER)
                .param("at", hidden ? Timestamp.from(now) : null, Types.TIMESTAMP)
                .update();
    }

    /** Deletes the ratings written by an account; returns the collectors they rated. */
    public Set<UUID> deleteAuthoredBy(UUID raterId) {
        return new HashSet<>(
                jdbc.sql("DELETE FROM rating WHERE rater_id = :id RETURNING ratee_id")
                        .param("id", raterId)
                        .query(UUID.class)
                        .list());
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    public Optional<RatingRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + FROM + " WHERE r.id = :id")
                .param("id", id)
                .query(RatingRepository::map)
                .optional();
    }

    /** Locks a rating for an update in the caller's transaction. */
    public Optional<RatingRow> findForUpdate(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + FROM + " WHERE r.id = :id FOR UPDATE OF r")
                .param("id", id)
                .query(RatingRepository::map)
                .optional();
    }

    public Optional<RatingRow> findByInteractionAndRater(UUID interactionId, UUID raterId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE r.interaction_id = :interactionId AND r.rater_id ="
                                + " :raterId")
                .param("interactionId", interactionId)
                .param("raterId", raterId)
                .query(RatingRepository::map)
                .optional();
    }

    /** The interactions among {@code interactionIds} that {@code raterId} already rated. */
    public Set<UUID> ratedInteractions(UUID raterId, Collection<UUID> interactionIds) {
        if (interactionIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(
                jdbc.sql(
                                "SELECT interaction_id FROM rating WHERE rater_id = :raterId AND"
                                        + " interaction_id IN (:ids)")
                        .param("raterId", raterId)
                        .param("ids", interactionIds)
                        .query(UUID.class)
                        .list());
    }

    /** Visible (OK) ratings of a collector, newest first, strictly older than the cursor. */
    public List<RatingRow> visiblePage(UUID rateeId, @Nullable TimeCursor cursor, int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("ratee", rateeId);
        params.put("limit", limit);
        String keyset = "";
        if (cursor != null) {
            keyset = " AND (r.created_at, r.id) < (:cursorAt, :cursorId)";
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE r.ratee_id = :ratee AND r.moderation_state = 'OK'"
                                + keyset
                                + " ORDER BY r.created_at DESC, r.id DESC LIMIT :limit")
                .params(params)
                .query(RatingRepository::map)
                .list();
    }

    /** Admin list: optional filters, newest first. */
    public Page adminPage(
            @Nullable UUID rateeId,
            @Nullable UUID raterId,
            @Nullable RatingModerationState state,
            int page,
            int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE true");
        if (rateeId != null) {
            where.append(" AND r.ratee_id = :ratee");
            params.put("ratee", rateeId);
        }
        if (raterId != null) {
            where.append(" AND r.rater_id = :rater");
            params.put("rater", raterId);
        }
        if (state != null) {
            where.append(" AND r.moderation_state = :state");
            params.put("state", state.name());
        }
        long total =
                jdbc.sql("SELECT count(*)" + FROM + where)
                        .params(params)
                        .query(Long.class)
                        .single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<RatingRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + COLUMNS
                                        + FROM
                                        + where
                                        + " ORDER BY r.created_at DESC, r.id DESC LIMIT :limit"
                                        + " OFFSET :offset")
                        .params(params)
                        .query(RatingRepository::map)
                        .list();
        return new Page(rows, total);
    }

    /** The latest ratings a collector received (any state), newest first (moderator history). */
    public List<RatingRow> recentReceived(UUID rateeId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE r.ratee_id = :ratee ORDER BY r.created_at DESC, r.id"
                                + " DESC LIMIT :limit")
                .param("ratee", rateeId)
                .param("limit", limit)
                .query(RatingRepository::map)
                .list();
    }

    /** Every rating written or received by an account (export), newest first. */
    public List<RatingRow> allOf(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + FROM
                                + " WHERE r.rater_id = :id OR r.ratee_id = :id"
                                + " ORDER BY r.created_at DESC, r.id DESC")
                .param("id", userId)
                .query(RatingRepository::map)
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------------------

    /** Recomputes {@code rating_summary} of a collector from their OK ratings. */
    public void refreshSummary(UUID userId, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO rating_summary (user_id, average, count, communication_avg,
                            condition_accuracy_avg, shipping_avg, meetup_reliability_avg, updated_at)
                        SELECT :id, round(avg(overall), 2), count(*), round(avg(communication), 2),
                               round(avg(condition_accuracy), 2), round(avg(shipping), 2),
                               round(avg(meetup_reliability), 2), :now
                          FROM rating WHERE ratee_id = :id AND moderation_state = 'OK'
                        ON CONFLICT (user_id) DO UPDATE
                           SET average = EXCLUDED.average, count = EXCLUDED.count,
                               communication_avg = EXCLUDED.communication_avg,
                               condition_accuracy_avg = EXCLUDED.condition_accuracy_avg,
                               shipping_avg = EXCLUDED.shipping_avg,
                               meetup_reliability_avg = EXCLUDED.meetup_reliability_avg,
                               updated_at = EXCLUDED.updated_at
                        """)
                .param("id", userId)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void deleteSummary(UUID userId) {
        jdbc.sql("DELETE FROM rating_summary WHERE user_id = :id").param("id", userId).update();
    }

    public Optional<SummaryRow> summary(UUID userId) {
        return jdbc.sql(
                        "SELECT user_id, average, count, communication_avg,"
                                + " condition_accuracy_avg, shipping_avg, meetup_reliability_avg"
                                + " FROM rating_summary WHERE user_id = :id")
                .param("id", userId)
                .query(RatingRepository::summaryRow)
                .optional();
    }

    public Map<UUID, SummaryRow> summaries(Collection<UUID> userIds) {
        Map<UUID, SummaryRow> result = new HashMap<>();
        if (userIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT user_id, average, count, communication_avg,"
                                + " condition_accuracy_avg, shipping_avg, meetup_reliability_avg"
                                + " FROM rating_summary WHERE user_id IN (:ids)")
                .param("ids", userIds)
                .query(RatingRepository::summaryRow)
                .list()
                .forEach(row -> result.put(row.userId(), row));
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    static RatingRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp hiddenAt = rs.getTimestamp("hidden_at");
        return new RatingRow(
                rs.getObject("id", UUID.class),
                rs.getObject("interaction_id", UUID.class),
                InteractionKind.valueOf(rs.getString("interaction_kind")),
                rs.getObject("rater_id", UUID.class),
                rs.getObject("ratee_id", UUID.class),
                new RatingScores(
                        rs.getInt("overall"),
                        integer(rs, "communication"),
                        integer(rs, "condition_accuracy"),
                        integer(rs, "shipping"),
                        integer(rs, "meetup_reliability")),
                rs.getString("comment"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                RatingModerationState.valueOf(rs.getString("moderation_state")),
                rs.getString("hidden_reason"),
                rs.getObject("hidden_by", UUID.class),
                hiddenAt == null ? null : hiddenAt.toInstant());
    }

    private static SummaryRow summaryRow(ResultSet rs, int rowNum) throws SQLException {
        return new SummaryRow(
                rs.getObject("user_id", UUID.class),
                rs.getBigDecimal("average"),
                rs.getInt("count"),
                rs.getBigDecimal("communication_avg"),
                rs.getBigDecimal("condition_accuracy_avg"),
                rs.getBigDecimal("shipping_avg"),
                rs.getBigDecimal("meetup_reliability_avg"));
    }

    private static @Nullable Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    /** One page of ratings with the total count. */
    public record Page(List<RatingRow> rows, long total) {}

    /** A stored summary. */
    public record SummaryRow(
            UUID userId,
            @Nullable BigDecimal average,
            int count,
            @Nullable BigDecimal communication,
            @Nullable BigDecimal conditionAccuracy,
            @Nullable BigDecimal shipping,
            @Nullable BigDecimal meetupReliability) {}
}
