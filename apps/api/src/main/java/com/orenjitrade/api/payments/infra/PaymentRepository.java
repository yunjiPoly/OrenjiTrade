package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.PaymentRows.PaymentEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.RefundRow;
import com.orenjitrade.api.payments.domain.PaymentStatus;
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
 * {@code payment}, {@code payment_event} and {@code payment_refund} access (explicit SQL); used
 * only inside the payments module.
 */
@Repository
public class PaymentRepository {

    private static final String COLUMNS =
            """
            p.id, p.trade_id, p.buyer_id, p.seller_id, p.provider, p.provider_ref, p.status,
            p.amount, p.currency, p.fee_percent, p.platform_fee, p.seller_amount,
            p.refunded_amount, p.payout_amount, p.payout_ref, p.payout_frozen, p.checkout_url,
            p.failure_code, p.secured_at, p.payout_released_at, p.refunded_at,
            p.dispute_window_ends_at, p.release_reminded_at, p.created_at, p.updated_at, p.version
            """;

    /** Disputes still waiting for a decision (the payout stays frozen). */
    static final String OPEN_DISPUTE =
            "EXISTS (SELECT 1 FROM dispute d WHERE d.payment_id = p.id AND d.status IN ('OPEN',"
                    + " 'UNDER_REVIEW', 'FROZEN'))";

    private final JdbcClient jdbc;

    public PaymentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // payment writes
    // ---------------------------------------------------------------------------------------

    /** A new REQUIRES_ACTION payment. */
    public void insert(
            UUID id,
            UUID tradeId,
            UUID buyerId,
            UUID sellerId,
            String provider,
            String providerRef,
            BigDecimal amount,
            String currency,
            BigDecimal feePercent,
            BigDecimal platformFee,
            BigDecimal sellerAmount,
            @Nullable String checkoutUrl,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO payment (id, trade_id, buyer_id, seller_id, provider,
                            provider_ref, status, amount, currency, fee_percent, platform_fee,
                            seller_amount, checkout_url, created_at, updated_at)
                        VALUES (:id, :tradeId, :buyerId, :sellerId, :provider, :ref,
                            'REQUIRES_ACTION', :amount, :currency, :feePercent, :fee,
                            :sellerAmount, :checkoutUrl, :now, :now)
                        """)
                .param("id", id)
                .param("tradeId", tradeId)
                .param("buyerId", buyerId)
                .param("sellerId", sellerId)
                .param("provider", provider)
                .param("ref", providerRef)
                .param("amount", amount)
                .param("currency", currency)
                .param("feePercent", feePercent)
                .param("fee", platformFee)
                .param("sellerAmount", sellerAmount)
                .param("checkoutUrl", checkoutUrl, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** A new checkout attempt of a FAILED or CANCELLED payment (new provider reference). */
    public void restart(
            UUID id,
            String provider,
            String providerRef,
            BigDecimal feePercent,
            BigDecimal platformFee,
            BigDecimal sellerAmount,
            @Nullable String checkoutUrl,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET provider = :provider, provider_ref = :ref,
                               status = 'REQUIRES_ACTION', fee_percent = :feePercent,
                               platform_fee = :fee, seller_amount = :sellerAmount,
                               checkout_url = :checkoutUrl, failure_code = NULL,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("provider", provider)
                .param("ref", providerRef)
                .param("feePercent", feePercent)
                .param("fee", platformFee)
                .param("sellerAmount", sellerAmount)
                .param("checkoutUrl", checkoutUrl, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markSecured(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET status = 'SECURED', secured_at = :now,
                               checkout_url = NULL, failure_code = NULL, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markFailed(UUID id, @Nullable String failureCode, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET status = 'FAILED', failure_code = :code,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("code", failureCode, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markCancelled(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET status = 'CANCELLED', checkout_url = NULL,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The seller shipped: the dispute window starts. */
    public void startWindow(UUID id, Instant windowEndsAt, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET dispute_window_ends_at = :ends, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("ends", Timestamp.from(windowEndsAt))
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setFrozen(UUID id, boolean frozen, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET payout_frozen = :frozen, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("frozen", frozen)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The payout was released (PAYOUT_PENDING or PAID_OUT). */
    public void markPayout(
            UUID id, BigDecimal amount, String payoutRef, PaymentStatus status, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET status = :status, payout_amount = :amount,
                               payout_ref = :ref, payout_released_at = :now, payout_frozen = false,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("amount", amount)
                .param("ref", payoutRef)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** A refund succeeded or was requested: {@code refunded_amount += amount}. */
    public void addRefund(UUID id, BigDecimal amount, PaymentStatus status, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET refunded_amount = refunded_amount + :amount,
                               status = :status, refunded_at = :now, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("amount", amount)
                .param("status", status.name())
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setStatus(UUID id, PaymentStatus status, Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment SET status = :status, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Marks the buyer reminded of the automatic release (first time only). */
    public boolean markReminded(UUID id, Instant now) {
        return jdbc.sql(
                                """
                                UPDATE payment SET release_reminded_at = :now, updated_at = :now,
                                       version = version + 1
                                 WHERE id = :id AND release_reminded_at IS NULL
                                """)
                        .param("id", id)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    // ---------------------------------------------------------------------------------------
    // payment reads
    // ---------------------------------------------------------------------------------------

    public Optional<PaymentRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM payment p WHERE p.id = :id")
                .param("id", id)
                .query(PaymentRepository::map)
                .optional();
    }

    public Optional<PaymentRow> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM payment p WHERE p.id = :id FOR UPDATE")
                .param("id", id)
                .query(PaymentRepository::map)
                .optional();
    }

    public Optional<PaymentRow> findByTrade(UUID tradeId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM payment p WHERE p.trade_id = :tradeId")
                .param("tradeId", tradeId)
                .query(PaymentRepository::map)
                .optional();
    }

    public Optional<PaymentRow> lockByTrade(UUID tradeId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM payment p WHERE p.trade_id = :tradeId FOR UPDATE")
                .param("tradeId", tradeId)
                .query(PaymentRepository::map)
                .optional();
    }

    public Optional<PaymentRow> findByRef(String provider, String providerRef) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM payment p WHERE p.provider = :provider AND"
                                + " p.provider_ref = :ref")
                .param("provider", provider)
                .param("ref", providerRef)
                .query(PaymentRepository::map)
                .optional();
    }

    /** Payments of several trades, by trade id. */
    public Map<UUID, PaymentRow> byTrades(Collection<UUID> tradeIds) {
        Map<UUID, PaymentRow> result = new LinkedHashMap<>();
        if (tradeIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT " + COLUMNS + " FROM payment p WHERE p.trade_id IN (:ids)")
                .param("ids", List.copyOf(tradeIds))
                .query(PaymentRepository::map)
                .list()
                .forEach(row -> result.put(row.tradeId(), row));
        return result;
    }

    /**
     * Secured payments whose dispute window ends between {@code now} and {@code until} and whose
     * buyer was not reminded yet (auto-release reminder).
     */
    public List<UUID> reminderCandidates(Instant now, Instant until, int limit) {
        return jdbc.sql(
                        "SELECT p.id FROM payment p WHERE p.status = 'SECURED' AND NOT"
                                + " p.payout_frozen AND p.release_reminded_at IS NULL AND"
                                + " p.dispute_window_ends_at > :now AND p.dispute_window_ends_at"
                                + " <= :until AND NOT "
                                + OPEN_DISPUTE
                                + " ORDER BY p.dispute_window_ends_at, p.id LIMIT :limit")
                .param("now", Timestamp.from(now))
                .param("until", Timestamp.from(until))
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    /** Secured payments whose dispute window has ended without a dispute (auto-release). */
    public List<UUID> releaseCandidates(Instant now, int limit) {
        return jdbc.sql(
                        "SELECT p.id FROM payment p WHERE p.status = 'SECURED' AND NOT"
                                + " p.payout_frozen AND p.dispute_window_ends_at <= :now AND NOT "
                                + OPEN_DISPUTE
                                + " ORDER BY p.dispute_window_ends_at, p.id LIMIT :limit")
                .param("now", Timestamp.from(now))
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    /** One page of payments, newest activity first ({@code status} optional). */
    public List<PaymentRow> page(@Nullable PaymentStatus status, int page, int size) {
        String where = status == null ? "" : " WHERE p.status = :status";
        var spec =
                jdbc.sql(
                                "SELECT "
                                        + COLUMNS
                                        + " FROM payment p"
                                        + where
                                        + " ORDER BY p.updated_at DESC, p.id DESC LIMIT :limit"
                                        + " OFFSET :offset")
                        .param("limit", size)
                        .param("offset", (long) page * size);
        if (status != null) {
            spec = spec.param("status", status.name());
        }
        return spec.query(PaymentRepository::map).list();
    }

    public long count(@Nullable PaymentStatus status) {
        if (status == null) {
            return jdbc.sql("SELECT count(*) FROM payment").query(Long.class).single();
        }
        return jdbc.sql("SELECT count(*) FROM payment WHERE status = :status")
                .param("status", status.name())
                .query(Long.class)
                .single();
    }

    /** Secured payments of PAID trades not shipped yet, oldest first (admin). */
    public List<PaymentRow> pendingShipment(int page, int size) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM payment p WHERE "
                                + PENDING_SHIPMENT
                                + " ORDER BY p.secured_at, p.id LIMIT :limit OFFSET :offset")
                .param("limit", size)
                .param("offset", (long) page * size)
                .query(PaymentRepository::map)
                .list();
    }

    public long countPendingShipment() {
        return jdbc.sql("SELECT count(*) FROM payment p WHERE " + PENDING_SHIPMENT)
                .query(Long.class)
                .single();
    }

    /** Secured payments of shipped trades waiting for the buyer, window end first (admin). */
    public List<PaymentRow> pendingConfirmation(int page, int size) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM payment p WHERE "
                                + PENDING_CONFIRMATION
                                + " ORDER BY p.dispute_window_ends_at, p.id LIMIT :limit OFFSET"
                                + " :offset")
                .param("limit", size)
                .param("offset", (long) page * size)
                .query(PaymentRepository::map)
                .list();
    }

    public long countPendingConfirmation() {
        return jdbc.sql("SELECT count(*) FROM payment p WHERE " + PENDING_CONFIRMATION)
                .query(Long.class)
                .single();
    }

    private static final String PENDING_SHIPMENT =
            "p.status = 'SECURED' AND NOT EXISTS (SELECT 1 FROM shipment s WHERE s.trade_id ="
                    + " p.trade_id) AND NOT EXISTS (SELECT 1 FROM dispute d WHERE d.payment_id ="
                    + " p.id)";

    private static final String PENDING_CONFIRMATION =
            "p.status = 'SECURED' AND EXISTS (SELECT 1 FROM shipment s WHERE s.trade_id ="
                    + " p.trade_id AND s.delivered_at IS NULL) AND NOT EXISTS (SELECT 1 FROM"
                    + " dispute d WHERE d.payment_id = p.id)";

    /** Payments of an account as buyer or seller, newest first (export). */
    public List<PaymentRow> ofUser(UUID userId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM payment p WHERE p.buyer_id = :id OR p.seller_id = :id"
                                + " ORDER BY p.created_at DESC, p.id DESC LIMIT :limit")
                .param("id", userId)
                .param("limit", limit)
                .query(PaymentRepository::map)
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // payment_event
    // ---------------------------------------------------------------------------------------

    /**
     * Appends a history entry; with a provider event id a repeated change is skipped (returns
     * false).
     */
    public boolean insertEvent(
            UUID paymentId,
            String event,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            String detailsJson,
            Instant at) {
        return jdbc.sql(
                                """
                                INSERT INTO payment_event (payment_id, event, provider_event_id,
                                    actor_id, details, created_at)
                                VALUES (:paymentId, :event, :providerEventId, :actorId,
                                    CAST(:details AS jsonb), :at)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("paymentId", paymentId)
                        .param("event", event)
                        .param("providerEventId", providerEventId, Types.VARCHAR)
                        .param("actorId", actorId, Types.OTHER)
                        .param("details", detailsJson)
                        .param("at", Timestamp.from(at))
                        .update()
                > 0;
    }

    public List<PaymentEventRow> events(UUID paymentId) {
        return jdbc.sql(
                        """
                        SELECT id, payment_id, event, provider_event_id, actor_id, details::text
                               AS details, created_at
                          FROM payment_event WHERE payment_id = :id ORDER BY created_at, seq
                        """)
                .param("id", paymentId)
                .query(
                        (rs, rowNum) ->
                                new PaymentEventRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("payment_id", UUID.class),
                                        rs.getString("event"),
                                        rs.getString("provider_event_id"),
                                        rs.getObject("actor_id", UUID.class),
                                        rs.getString("details"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // payment_refund
    // ---------------------------------------------------------------------------------------

    public UUID insertRefund(
            UUID paymentId,
            @Nullable String providerRefundId,
            BigDecimal amount,
            String currency,
            String reason,
            String source,
            String status,
            @Nullable UUID requestedBy,
            Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO payment_refund (id, payment_id, provider_refund_id, amount,
                            currency, reason, source, status, requested_by, created_at,
                            completed_at)
                        VALUES (:id, :paymentId, :ref, :amount, :currency, :reason, :source,
                            :status, :requestedBy, :now,
                            CASE WHEN :status = 'PENDING' THEN NULL ELSE CAST(:now AS timestamptz)
                            END)
                        """)
                .param("id", id)
                .param("paymentId", paymentId)
                .param("ref", providerRefundId, Types.VARCHAR)
                .param("amount", amount)
                .param("currency", currency)
                .param("reason", reason)
                .param("source", source)
                .param("status", status)
                .param("requestedBy", requestedBy, Types.OTHER)
                .param("now", Timestamp.from(now))
                .update();
        return id;
    }

    /** A provider confirmed or failed a refund; returns the refund's payment id when changed. */
    public Optional<UUID> completeRefund(String providerRefundId, String status, Instant now) {
        return jdbc.sql(
                        """
                        UPDATE payment_refund SET status = :status, completed_at = :now
                         WHERE provider_refund_id = :ref AND status = 'PENDING'
                        RETURNING payment_id
                        """)
                .param("ref", providerRefundId)
                .param("status", status)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .optional();
    }

    public List<RefundRow> refunds(UUID paymentId) {
        return jdbc.sql(
                        """
                        SELECT id, payment_id, provider_refund_id, amount, currency, reason, source,
                               status, requested_by, created_at, completed_at
                          FROM payment_refund WHERE payment_id = :id ORDER BY created_at, id
                        """)
                .param("id", paymentId)
                .query(
                        (rs, rowNum) ->
                                new RefundRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("payment_id", UUID.class),
                                        rs.getString("provider_refund_id"),
                                        rs.getBigDecimal("amount"),
                                        rs.getString("currency").trim(),
                                        rs.getString("reason"),
                                        rs.getString("source"),
                                        rs.getString("status"),
                                        rs.getObject("requested_by", UUID.class),
                                        rs.getTimestamp("created_at").toInstant(),
                                        instant(rs, "completed_at")))
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    static PaymentRow map(ResultSet rs, int rowNum) throws SQLException {
        return new PaymentRow(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_id", UUID.class),
                rs.getObject("buyer_id", UUID.class),
                rs.getObject("seller_id", UUID.class),
                rs.getString("provider"),
                rs.getString("provider_ref"),
                PaymentStatus.valueOf(rs.getString("status")),
                rs.getBigDecimal("amount"),
                rs.getString("currency").trim(),
                rs.getBigDecimal("fee_percent"),
                rs.getBigDecimal("platform_fee"),
                rs.getBigDecimal("seller_amount"),
                rs.getBigDecimal("refunded_amount"),
                rs.getBigDecimal("payout_amount"),
                rs.getString("payout_ref"),
                rs.getBoolean("payout_frozen"),
                rs.getString("checkout_url"),
                rs.getString("failure_code"),
                instant(rs, "secured_at"),
                instant(rs, "payout_released_at"),
                instant(rs, "refunded_at"),
                instant(rs, "dispute_window_ends_at"),
                instant(rs, "release_reminded_at"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getInt("version"));
    }

    static @Nullable Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
