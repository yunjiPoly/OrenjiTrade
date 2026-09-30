package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.DisputeReason;
import com.orenjitrade.api.payments.domain.DisputeStatus;
import com.orenjitrade.api.payments.domain.EvidenceKind;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeMessageRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeNoteRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.EvidenceRow;
import java.math.BigDecimal;
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
 * {@code dispute}, {@code dispute_evidence}, {@code dispute_event}, {@code dispute_message} and
 * {@code dispute_note} access (explicit SQL); used only inside the payments module.
 */
@Repository
public class DisputeRepository {

    private static final String COLUMNS =
            """
            d.id, d.trade_id, d.payment_id, d.opened_by, d.reason, d.description, d.status,
            d.opened_at, d.updated_at, d.frozen_at, d.frozen_by, d.resolved_at, d.resolved_by,
            d.resolution_note, d.refund_amount, d.version
            """;

    private static final String EVIDENCE_COLUMNS =
            "id, dispute_id, submitted_by, party_role, kind, body, storage_key, url, content_type,"
                    + " size_bytes, created_at";

    private final JdbcClient jdbc;

    public DisputeRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // dispute
    // ---------------------------------------------------------------------------------------

    /** Opens a dispute; false when the trade already has one. */
    public boolean insert(
            UUID id,
            UUID tradeId,
            UUID paymentId,
            UUID openedBy,
            DisputeReason reason,
            String description,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO dispute (id, trade_id, payment_id, opened_by, reason,
                                    description, status, opened_at, updated_at)
                                VALUES (:id, :tradeId, :paymentId, :openedBy, :reason,
                                    :description, 'OPEN', :now, :now)
                                ON CONFLICT (trade_id) DO NOTHING
                                """)
                        .param("id", id)
                        .param("tradeId", tradeId)
                        .param("paymentId", paymentId)
                        .param("openedBy", openedBy)
                        .param("reason", reason.name())
                        .param("description", description)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void setStatus(UUID id, DisputeStatus status, Instant now) {
        jdbc.sql(
                        """
                        UPDATE dispute SET status = :status, updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("now", Timestamp.from(now))
                .update();
    }

    public void freeze(UUID id, UUID by, Instant now) {
        jdbc.sql(
                        """
                        UPDATE dispute SET status = 'FROZEN', frozen_at = :now, frozen_by = :by,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("by", by)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void resolve(
            UUID id,
            DisputeStatus status,
            UUID resolvedBy,
            String note,
            BigDecimal refundAmount,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE dispute SET status = :status, resolved_at = :now,
                               resolved_by = :by, resolution_note = :note,
                               refund_amount = :refund, updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("by", resolvedBy)
                .param("note", note)
                .param("refund", refundAmount)
                .param("now", Timestamp.from(now))
                .update();
    }

    public Optional<DisputeRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM dispute d WHERE d.id = :id")
                .param("id", id)
                .query(DisputeRepository::map)
                .optional();
    }

    public Optional<DisputeRow> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM dispute d WHERE d.id = :id FOR UPDATE")
                .param("id", id)
                .query(DisputeRepository::map)
                .optional();
    }

    public Optional<DisputeRow> byTrade(UUID tradeId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM dispute d WHERE d.trade_id = :tradeId")
                .param("tradeId", tradeId)
                .query(DisputeRepository::map)
                .optional();
    }

    public Map<UUID, DisputeRow> byTrades(Collection<UUID> tradeIds) {
        Map<UUID, DisputeRow> result = new LinkedHashMap<>();
        if (tradeIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT " + COLUMNS + " FROM dispute d WHERE d.trade_id IN (:ids)")
                .param("ids", List.copyOf(tradeIds))
                .query(DisputeRepository::map)
                .list()
                .forEach(row -> result.put(row.tradeId(), row));
        return result;
    }

    /** One page of disputes, newest first ({@code status} optional). */
    public List<DisputeRow> page(@Nullable DisputeStatus status, int page, int size) {
        String where = status == null ? "" : " WHERE d.status = :status";
        var spec =
                jdbc.sql(
                                "SELECT "
                                        + COLUMNS
                                        + " FROM dispute d"
                                        + where
                                        + " ORDER BY d.opened_at DESC, d.id DESC LIMIT :limit"
                                        + " OFFSET :offset")
                        .param("limit", size)
                        .param("offset", (long) page * size);
        if (status != null) {
            spec = spec.param("status", status.name());
        }
        return spec.query(DisputeRepository::map).list();
    }

    public long count(@Nullable DisputeStatus status) {
        if (status == null) {
            return jdbc.sql("SELECT count(*) FROM dispute").query(Long.class).single();
        }
        return jdbc.sql("SELECT count(*) FROM dispute WHERE status = :status")
                .param("status", status.name())
                .query(Long.class)
                .single();
    }

    /** Disputes opened by an account (export). */
    public List<DisputeRow> openedBy(UUID userId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM dispute d WHERE d.opened_by = :id ORDER BY d.opened_at"
                                + " DESC LIMIT :limit")
                .param("id", userId)
                .param("limit", limit)
                .query(DisputeRepository::map)
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // dispute_evidence
    // ---------------------------------------------------------------------------------------

    public UUID insertEvidence(
            UUID disputeId,
            UUID submittedBy,
            String partyRole,
            EvidenceKind kind,
            @Nullable String body,
            @Nullable String storageKey,
            @Nullable String url,
            @Nullable String contentType,
            @Nullable Integer sizeBytes,
            Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO dispute_evidence (id, dispute_id, submitted_by, party_role, kind,
                            body, storage_key, url, content_type, size_bytes, created_at)
                        VALUES (:id, :disputeId, :by, :role, :kind, :body, :key, :url,
                            :contentType, :size, :now)
                        """)
                .param("id", id)
                .param("disputeId", disputeId)
                .param("by", submittedBy)
                .param("role", partyRole)
                .param("kind", kind.name())
                .param("body", body, Types.VARCHAR)
                .param("key", storageKey, Types.VARCHAR)
                .param("url", url, Types.VARCHAR)
                .param("contentType", contentType, Types.VARCHAR)
                .param("size", sizeBytes, Types.INTEGER)
                .param("now", Timestamp.from(now))
                .update();
        return id;
    }

    public int countEvidence(UUID disputeId, String partyRole) {
        return jdbc.sql(
                        "SELECT count(*) FROM dispute_evidence WHERE dispute_id = :id AND"
                                + " party_role = :role")
                .param("id", disputeId)
                .param("role", partyRole)
                .query(Integer.class)
                .single();
    }

    public List<EvidenceRow> evidence(UUID disputeId) {
        return jdbc.sql(
                        "SELECT "
                                + EVIDENCE_COLUMNS
                                + " FROM dispute_evidence WHERE dispute_id = :id ORDER BY"
                                + " created_at, id")
                .param("id", disputeId)
                .query(DisputeRepository::mapEvidence)
                .list();
    }

    public Optional<EvidenceRow> evidenceItem(UUID disputeId, UUID evidenceId) {
        return jdbc.sql(
                        "SELECT "
                                + EVIDENCE_COLUMNS
                                + " FROM dispute_evidence WHERE dispute_id = :disputeId AND id ="
                                + " :id")
                .param("disputeId", disputeId)
                .param("id", evidenceId)
                .query(DisputeRepository::mapEvidence)
                .optional();
    }

    // ---------------------------------------------------------------------------------------
    // dispute_event, dispute_message, dispute_note
    // ---------------------------------------------------------------------------------------

    public void insertEvent(
            UUID disputeId, @Nullable UUID actorId, String event, String detailsJson, Instant at) {
        jdbc.sql(
                        """
                        INSERT INTO dispute_event (dispute_id, actor_id, event, details, created_at)
                        VALUES (:disputeId, :actorId, :event, CAST(:details AS jsonb), :at)
                        """)
                .param("disputeId", disputeId)
                .param("actorId", actorId, Types.OTHER)
                .param("event", event)
                .param("details", detailsJson)
                .param("at", Timestamp.from(at))
                .update();
    }

    public List<DisputeEventRow> events(UUID disputeId) {
        return jdbc.sql(
                        """
                        SELECT id, dispute_id, actor_id, event, details::text AS details, created_at
                          FROM dispute_event WHERE dispute_id = :id ORDER BY created_at, seq
                        """)
                .param("id", disputeId)
                .query(
                        (rs, rowNum) ->
                                new DisputeEventRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("dispute_id", UUID.class),
                                        rs.getObject("actor_id", UUID.class),
                                        rs.getString("event"),
                                        rs.getString("details"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    public UUID insertMessage(UUID disputeId, UUID authorId, String role, String body, Instant at) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO dispute_message (id, dispute_id, author_id, author_role, body,
                            created_at)
                        VALUES (:id, :disputeId, :authorId, :role, :body, :at)
                        """)
                .param("id", id)
                .param("disputeId", disputeId)
                .param("authorId", authorId)
                .param("role", role)
                .param("body", body)
                .param("at", Timestamp.from(at))
                .update();
        return id;
    }

    public List<DisputeMessageRow> messages(UUID disputeId) {
        return jdbc.sql(
                        """
                        SELECT id, dispute_id, author_id, author_role, body, created_at
                          FROM dispute_message WHERE dispute_id = :id ORDER BY created_at, id
                        """)
                .param("id", disputeId)
                .query(
                        (rs, rowNum) ->
                                new DisputeMessageRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("dispute_id", UUID.class),
                                        rs.getObject("author_id", UUID.class),
                                        rs.getString("author_role"),
                                        rs.getString("body"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    public UUID insertNote(UUID disputeId, UUID authorId, String body, Instant at) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO dispute_note (id, dispute_id, author_id, body, created_at)
                        VALUES (:id, :disputeId, :authorId, :body, :at)
                        """)
                .param("id", id)
                .param("disputeId", disputeId)
                .param("authorId", authorId)
                .param("body", body)
                .param("at", Timestamp.from(at))
                .update();
        return id;
    }

    public List<DisputeNoteRow> notes(UUID disputeId) {
        return jdbc.sql(
                        """
                        SELECT id, dispute_id, author_id, body, created_at
                          FROM dispute_note WHERE dispute_id = :id ORDER BY created_at, id
                        """)
                .param("id", disputeId)
                .query(
                        (rs, rowNum) ->
                                new DisputeNoteRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("dispute_id", UUID.class),
                                        rs.getObject("author_id", UUID.class),
                                        rs.getString("body"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    static DisputeRow map(ResultSet rs, int rowNum) throws SQLException {
        return new DisputeRow(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_id", UUID.class),
                rs.getObject("payment_id", UUID.class),
                rs.getObject("opened_by", UUID.class),
                DisputeReason.valueOf(rs.getString("reason")),
                rs.getString("description"),
                DisputeStatus.valueOf(rs.getString("status")),
                rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                PaymentRepository.instant(rs, "frozen_at"),
                rs.getObject("frozen_by", UUID.class),
                PaymentRepository.instant(rs, "resolved_at"),
                rs.getObject("resolved_by", UUID.class),
                rs.getString("resolution_note"),
                rs.getBigDecimal("refund_amount"),
                rs.getInt("version"));
    }

    static EvidenceRow mapEvidence(ResultSet rs, int rowNum) throws SQLException {
        int stored = rs.getInt("size_bytes");
        @Nullable Integer size = rs.wasNull() ? null : stored;
        return new EvidenceRow(
                rs.getObject("id", UUID.class),
                rs.getObject("dispute_id", UUID.class),
                rs.getObject("submitted_by", UUID.class),
                rs.getString("party_role"),
                EvidenceKind.valueOf(rs.getString("kind")),
                rs.getString("body"),
                rs.getString("storage_key"),
                rs.getString("url"),
                rs.getString("content_type"),
                size,
                rs.getTimestamp("created_at").toInstant());
    }
}
