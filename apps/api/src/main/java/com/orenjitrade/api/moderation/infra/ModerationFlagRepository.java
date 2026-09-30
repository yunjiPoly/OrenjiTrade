package com.orenjitrade.api.moderation.infra;

import com.orenjitrade.api.moderation.domain.FlagReason;
import com.orenjitrade.api.moderation.domain.FlagSubjectType;
import com.orenjitrade.api.moderation.domain.ModerationFlagView;
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

/** {@code moderation_flag} access; used only inside the moderation module. */
@Repository
public class ModerationFlagRepository {

    private static final String COLUMNS =
            "id, subject_type, subject_id, rule_id, reason, author_id, created_at, resolved_at,"
                    + " resolved_by, resolution_note";

    private final JdbcClient jdbc;

    public ModerationFlagRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Opens a flag unless an open one already exists for the same subject and reason.
     *
     * @return whether a row was inserted
     */
    public boolean open(
            FlagSubjectType subjectType,
            UUID subjectId,
            @Nullable UUID ruleId,
            FlagReason reason,
            @Nullable UUID authorId,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO moderation_flag (id, subject_type, subject_id, rule_id,
                                    reason, author_id, created_at)
                                VALUES (:id, :subjectType, :subjectId, :ruleId, :reason,
                                    :authorId, :now)
                                ON CONFLICT (subject_type, subject_id, reason)
                                    WHERE resolved_at IS NULL DO NOTHING
                                """)
                        .param("id", UUID.randomUUID())
                        .param("subjectType", subjectType.name())
                        .param("subjectId", subjectId)
                        .param("ruleId", ruleId, Types.OTHER)
                        .param("reason", reason.name())
                        .param("authorId", authorId, Types.OTHER)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public Optional<ModerationFlagView> findById(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM moderation_flag WHERE id = :id")
                .param("id", id)
                .query(ModerationFlagRepository::map)
                .optional();
    }

    /** A page of flags, newest first. {@code open}: true = open, false = resolved, null = all. */
    public Page page(
            @Nullable Boolean open, @Nullable FlagSubjectType subjectType, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE true");
        if (open != null) {
            where.append(open ? " AND resolved_at IS NULL" : " AND resolved_at IS NOT NULL");
        }
        if (subjectType != null) {
            where.append(" AND subject_type = :subjectType");
            params.put("subjectType", subjectType.name());
        }
        long total =
                jdbc.sql("SELECT count(*) FROM moderation_flag" + where)
                        .params(params)
                        .query(Long.class)
                        .single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<ModerationFlagView> rows =
                jdbc.sql(
                                "SELECT "
                                        + COLUMNS
                                        + " FROM moderation_flag"
                                        + where
                                        + " ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET"
                                        + " :offset")
                        .params(params)
                        .query(ModerationFlagRepository::map)
                        .list();
        return new Page(rows, total);
    }

    /** Resolves one open flag; empty when it does not exist or is already resolved. */
    public Optional<ModerationFlagView> resolve(
            UUID id, UUID resolvedBy, @Nullable String note, Instant now) {
        return jdbc.sql(
                        "UPDATE moderation_flag SET resolved_at = :now, resolved_by = :by,"
                                + " resolution_note = :note WHERE id = :id AND resolved_at IS NULL"
                                + " RETURNING "
                                + COLUMNS)
                .param("id", id)
                .param("by", resolvedBy)
                .param("note", note, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .query(ModerationFlagRepository::map)
                .optional();
    }

    /** Resolves every open flag of a subject (the content was removed); returns their number. */
    public int resolveSubject(
            FlagSubjectType subjectType,
            UUID subjectId,
            UUID resolvedBy,
            String note,
            Instant now) {
        return jdbc.sql(
                        "UPDATE moderation_flag SET resolved_at = :now, resolved_by = :by,"
                                + " resolution_note = :note WHERE subject_type = :type AND"
                                + " subject_id = :subjectId AND resolved_at IS NULL")
                .param("type", subjectType.name())
                .param("subjectId", subjectId)
                .param("by", resolvedBy)
                .param("note", note)
                .param("now", Timestamp.from(now))
                .update();
    }

    private static ModerationFlagView map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp resolvedAt = rs.getTimestamp("resolved_at");
        return new ModerationFlagView(
                rs.getObject("id", UUID.class),
                FlagSubjectType.valueOf(rs.getString("subject_type")),
                rs.getObject("subject_id", UUID.class),
                rs.getObject("rule_id", UUID.class),
                FlagReason.valueOf(rs.getString("reason")),
                rs.getObject("author_id", UUID.class),
                rs.getTimestamp("created_at").toInstant(),
                resolvedAt == null ? null : resolvedAt.toInstant(),
                rs.getObject("resolved_by", UUID.class),
                rs.getString("resolution_note"));
    }

    /** One page of flags with the total count. */
    public record Page(List<ModerationFlagView> rows, long total) {}
}
