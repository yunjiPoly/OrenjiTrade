package com.orenjitrade.api.reports.infra;

import com.orenjitrade.api.reports.domain.ReportContext;
import com.orenjitrade.api.reports.domain.ReportReason;
import com.orenjitrade.api.reports.domain.ReportRow;
import com.orenjitrade.api.reports.domain.ReportStatus;
import com.orenjitrade.api.reports.domain.ResolutionAction;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * {@code collector_report} and {@code moderator_note} access; used only inside the reports module.
 */
@Repository
public class ReportRepository {

    private static final String COLUMNS =
            "id, reporter_id, reported_user_id, reason, details, context::text AS context, status,"
                    + " created_at, updated_at, assigned_to, assigned_at, resolved_at, resolved_by,"
                    + " resolution_note, resolution_action";

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;

    public ReportRepository(JdbcClient jdbc, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
    }

    // ---------------------------------------------------------------------------------------
    // Reports
    // ---------------------------------------------------------------------------------------

    /**
     * Inserts an OPEN report unless the reporter already has an open one against the collector.
     *
     * @return whether a row was inserted
     */
    public boolean insertIfNoneOpen(
            UUID id,
            UUID reporterId,
            UUID reportedUserId,
            ReportReason reason,
            @Nullable String details,
            ReportContext context,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO collector_report (id, reporter_id, reported_user_id,
                                    reason, details, context, status, created_at, updated_at)
                                VALUES (:id, :reporter, :reported, :reason, :details,
                                    CAST(:context AS jsonb), 'OPEN', :now, :now)
                                ON CONFLICT (reporter_id, reported_user_id)
                                    WHERE status IN ('OPEN', 'UNDER_REVIEW') DO NOTHING
                                """)
                        .param("id", id)
                        .param("reporter", reporterId)
                        .param("reported", reportedUserId)
                        .param("reason", reason.name())
                        .param("details", details, Types.VARCHAR)
                        .param("context", contextJson(context))
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public Optional<ReportRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM collector_report WHERE id = :id")
                .param("id", id)
                .query(this::map)
                .optional();
    }

    public Optional<ReportRow> findForUpdate(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM collector_report WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(this::map)
                .optional();
    }

    /** The reporter's open report against a collector, if any. */
    public Optional<ReportRow> findOpen(UUID reporterId, UUID reportedUserId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM collector_report WHERE reporter_id = :reporter AND"
                                + " reported_user_id = :reported AND status IN ('OPEN',"
                                + " 'UNDER_REVIEW')")
                .param("reporter", reporterId)
                .param("reported", reportedUserId)
                .query(this::map)
                .optional();
    }

    /** The reporter's reports, newest first. */
    public List<ReportRow> byReporter(UUID reporterId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM collector_report WHERE reporter_id = :reporter ORDER BY"
                                + " created_at DESC, id DESC LIMIT :limit")
                .param("reporter", reporterId)
                .param("limit", limit)
                .query(this::map)
                .list();
    }

    /** Reports against a collector, newest first. */
    public List<ReportRow> against(UUID reportedUserId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM collector_report WHERE reported_user_id = :reported"
                                + " ORDER BY created_at DESC, id DESC LIMIT :limit")
                .param("reported", reportedUserId)
                .param("limit", limit)
                .query(this::map)
                .list();
    }

    /** Admin list: optional filters, oldest open first within a status, newest first overall. */
    public Page adminPage(
            @Nullable ReportStatus status,
            @Nullable ReportReason reason,
            @Nullable UUID reportedUserId,
            @Nullable UUID assignedTo,
            int page,
            int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE true");
        if (status != null) {
            where.append(" AND status = :status");
            params.put("status", status.name());
        }
        if (reason != null) {
            where.append(" AND reason = :reason");
            params.put("reason", reason.name());
        }
        if (reportedUserId != null) {
            where.append(" AND reported_user_id = :reported");
            params.put("reported", reportedUserId);
        }
        if (assignedTo != null) {
            where.append(" AND assigned_to = :assignee");
            params.put("assignee", assignedTo);
        }
        long total =
                jdbc.sql("SELECT count(*) FROM collector_report" + where)
                        .params(params)
                        .query(Long.class)
                        .single();
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<ReportRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + COLUMNS
                                        + " FROM collector_report"
                                        + where
                                        + " ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET"
                                        + " :offset")
                        .params(params)
                        .query(this::map)
                        .list();
        return new Page(rows, total);
    }

    /** Distinct reporters of open reports against a collector filed since {@code since}. */
    public int distinctOpenReporters(UUID reportedUserId, Instant since) {
        Integer count =
                jdbc.sql(
                                "SELECT count(DISTINCT reporter_id) FROM collector_report WHERE"
                                        + " reported_user_id = :reported AND status IN ('OPEN',"
                                        + " 'UNDER_REVIEW') AND created_at >= :since")
                        .param("reported", reportedUserId)
                        .param("since", Timestamp.from(since))
                        .query(Integer.class)
                        .single();
        return count == null ? 0 : count;
    }

    /** Open (OPEN or UNDER_REVIEW) reports against a collector. */
    public int openAgainst(UUID reportedUserId) {
        Integer count =
                jdbc.sql(
                                "SELECT count(*) FROM collector_report WHERE reported_user_id ="
                                        + " :reported AND status IN ('OPEN', 'UNDER_REVIEW')")
                        .param("reported", reportedUserId)
                        .query(Integer.class)
                        .single();
        return count == null ? 0 : count;
    }

    /** Open reports against each collector of {@code ids}. */
    public Map<UUID, Integer> openAgainst(List<UUID> reportedUserIds) {
        Map<UUID, Integer> result = new LinkedHashMap<>();
        if (reportedUserIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT reported_user_id, count(*) AS open FROM collector_report WHERE"
                                + " reported_user_id IN (:ids) AND status IN ('OPEN',"
                                + " 'UNDER_REVIEW') GROUP BY reported_user_id")
                .param("ids", reportedUserIds)
                .query(
                        rs -> {
                            result.put(
                                    rs.getObject("reported_user_id", UUID.class),
                                    rs.getInt("open"));
                        });
        return result;
    }

    public void assign(UUID id, UUID assignee, Instant now) {
        jdbc.sql(
                        "UPDATE collector_report SET assigned_to = :assignee, assigned_at = :now,"
                                + " status = CASE WHEN status = 'OPEN' THEN 'UNDER_REVIEW' ELSE"
                                + " status END, updated_at = :now WHERE id = :id")
                .param("id", id)
                .param("assignee", assignee)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void resolve(
            UUID id,
            ReportStatus status,
            ResolutionAction action,
            String note,
            UUID resolvedBy,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE collector_report
                           SET status = :status, resolution_action = :action,
                               resolution_note = :note, resolved_by = :by, resolved_at = :now,
                               updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("action", action.name())
                .param("note", note)
                .param("by", resolvedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Deletion of a reporter: the free text of their decided reports is erased. */
    public int eraseResolvedDetailsOf(UUID reporterId) {
        return jdbc.sql(
                        "UPDATE collector_report SET details = NULL WHERE reporter_id = :id AND"
                                + " status IN ('ACTIONED', 'DISMISSED') AND details IS NOT NULL")
                .param("id", reporterId)
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Notes
    // ---------------------------------------------------------------------------------------

    public void insertNote(UUID id, UUID reportId, UUID authorId, String body, Instant now) {
        jdbc.sql(
                        "INSERT INTO moderator_note (id, report_id, author_id, body, created_at)"
                                + " VALUES (:id, :report, :author, :body, :now)")
                .param("id", id)
                .param("report", reportId)
                .param("author", authorId)
                .param("body", body)
                .param("now", Timestamp.from(now))
                .update();
    }

    public List<NoteRow> notesOf(UUID reportId) {
        return jdbc.sql(
                        "SELECT id, report_id, author_id, body, created_at FROM moderator_note"
                                + " WHERE report_id = :report ORDER BY created_at, id")
                .param("report", reportId)
                .query(
                        (rs, rowNum) ->
                                new NoteRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("report_id", UUID.class),
                                        rs.getObject("author_id", UUID.class),
                                        rs.getString("body"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    String contextJson(ReportContext context) {
        ObjectNode node = jsonMapper.createObjectNode();
        node.put("source", context.source().name());
        if (context.conversationId() != null) {
            node.put("conversationId", context.conversationId().toString());
        }
        if (context.postId() != null) {
            node.put("postId", context.postId().toString());
        }
        if (context.binderId() != null) {
            node.put("binderId", context.binderId().toString());
        }
        return jsonMapper.writeValueAsString(node);
    }

    ReportContext context(@Nullable String json) {
        if (json == null || json.isBlank()) {
            return ReportContext.PROFILE;
        }
        JsonNode node = jsonMapper.readTree(json);
        ReportContext.Source source;
        try {
            source = ReportContext.Source.valueOf(node.path("source").asString("PROFILE"));
        } catch (IllegalArgumentException e) {
            source = ReportContext.Source.PROFILE;
        }
        return new ReportContext(
                source,
                uuid(node.path("conversationId")),
                uuid(node.path("postId")),
                uuid(node.path("binderId")));
    }

    private static @Nullable UUID uuid(JsonNode node) {
        if (node == null || !node.isString()) {
            return null;
        }
        try {
            return UUID.fromString(node.asString());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private ReportRow map(ResultSet rs, int rowNum) throws SQLException {
        String action = rs.getString("resolution_action");
        return new ReportRow(
                rs.getObject("id", UUID.class),
                rs.getObject("reporter_id", UUID.class),
                rs.getObject("reported_user_id", UUID.class),
                ReportReason.valueOf(rs.getString("reason")),
                rs.getString("details"),
                context(rs.getString("context")),
                ReportStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getObject("assigned_to", UUID.class),
                instant(rs.getTimestamp("assigned_at")),
                instant(rs.getTimestamp("resolved_at")),
                rs.getObject("resolved_by", UUID.class),
                rs.getString("resolution_note"),
                action == null ? null : ResolutionAction.valueOf(action));
    }

    private static @Nullable Instant instant(@Nullable Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    /** One page of reports with the total count. */
    public record Page(List<ReportRow> rows, long total) {}

    /** A stored moderator note. */
    public record NoteRow(
            UUID id, UUID reportId, @Nullable UUID authorId, String body, Instant createdAt) {}
}
