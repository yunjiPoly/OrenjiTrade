package com.orenjitrade.api.ratings.infra;

import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.ratings.domain.RatingModerationState;
import com.orenjitrade.api.ratings.domain.ReferenceRow;
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

/** {@code reference} access; used only inside the ratings module. */
@Repository
public class ReferenceRepository {

    private static final String COLUMNS =
            "id, author_id, subject_id, body, created_at, updated_at, moderation_state,"
                    + " hidden_reason, hidden_by, hidden_at";

    private final JdbcClient jdbc;

    public ReferenceRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Inserts a reference unless the author already wrote one about the subject.
     *
     * @return whether a row was inserted
     */
    public boolean insertIfAbsent(
            UUID id, UUID authorId, UUID subjectId, String body, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO reference (id, author_id, subject_id, body, created_at,
                                    updated_at)
                                VALUES (:id, :author, :subject, :body, :now, :now)
                                ON CONFLICT (author_id, subject_id) DO NOTHING
                                """)
                        .param("id", id)
                        .param("author", authorId)
                        .param("subject", subjectId)
                        .param("body", body)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public Optional<ReferenceRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM reference WHERE id = :id")
                .param("id", id)
                .query(ReferenceRepository::map)
                .optional();
    }

    public void setModeration(
            UUID id,
            RatingModerationState state,
            @Nullable String reason,
            @Nullable UUID moderatorId,
            Instant now) {
        boolean hidden = state == RatingModerationState.HIDDEN;
        jdbc.sql(
                        "UPDATE reference SET moderation_state = :state, hidden_reason = :reason,"
                                + " hidden_by = :by, hidden_at = :at WHERE id = :id")
                .param("id", id)
                .param("state", state.name())
                .param("reason", hidden ? reason : null, Types.VARCHAR)
                .param("by", hidden ? moderatorId : null, Types.OTHER)
                .param("at", hidden ? Timestamp.from(now) : null, Types.TIMESTAMP)
                .update();
    }

    /** Visible references about a collector, newest first, strictly older than the cursor. */
    public List<ReferenceRow> visiblePage(UUID subjectId, @Nullable TimeCursor cursor, int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("subject", subjectId);
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
                                + " FROM reference WHERE subject_id = :subject AND"
                                + " moderation_state = 'OK'"
                                + keyset
                                + " ORDER BY created_at DESC, id DESC LIMIT :limit")
                .params(params)
                .query(ReferenceRepository::map)
                .list();
    }

    /** Every reference written or received by an account (export), newest first. */
    public List<ReferenceRow> allOf(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM reference WHERE author_id = :id OR subject_id = :id"
                                + " ORDER BY created_at DESC, id DESC")
                .param("id", userId)
                .query(ReferenceRepository::map)
                .list();
    }

    /** Deletes the references written by or about an account (deletion). */
    public int deleteOf(UUID userId) {
        return jdbc.sql("DELETE FROM reference WHERE author_id = :id OR subject_id = :id")
                .param("id", userId)
                .update();
    }

    static ReferenceRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp hiddenAt = rs.getTimestamp("hidden_at");
        return new ReferenceRow(
                rs.getObject("id", UUID.class),
                rs.getObject("author_id", UUID.class),
                rs.getObject("subject_id", UUID.class),
                rs.getString("body"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                RatingModerationState.valueOf(rs.getString("moderation_state")),
                rs.getString("hidden_reason"),
                rs.getObject("hidden_by", UUID.class),
                hiddenAt == null ? null : hiddenAt.toInstant());
    }
}
