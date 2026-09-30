package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.PaymentRows.WebhookEventRow;
import com.orenjitrade.api.payments.domain.WebhookStatus;
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

/** {@code payment_webhook_event} access (explicit SQL); used only inside the payments module. */
@Repository
public class WebhookEventRepository {

    private static final String COLUMNS =
            "id, provider, provider_event_id, type, signature_valid, status, payment_id, error,"
                    + " received_at, processed_at";

    private final JdbcClient jdbc;

    public WebhookEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Stores a verified event unless the provider already sent it (idempotency by provider event
     * id); returns the new row's id, empty for a duplicate.
     */
    public Optional<UUID> insertVerified(
            String provider, String providerEventId, String type, String payloadJson, Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO payment_webhook_event (provider, provider_event_id, type,
                            signature_valid, status, payload, received_at)
                        VALUES (:provider, :eventId, :type, true, 'RECEIVED',
                            CAST(:payload AS jsonb), :now)
                        ON CONFLICT (provider, provider_event_id)
                            WHERE provider_event_id IS NOT NULL DO NOTHING
                        RETURNING id
                        """)
                .param("provider", provider)
                .param("eventId", providerEventId)
                .param("type", type)
                .param("payload", payloadJson)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .optional();
    }

    /** Stores a rejected event (invalid signature or unreadable body) as IGNORED. */
    public UUID insertRejected(
            String provider, String type, String payloadJson, String error, Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO payment_webhook_event (provider, provider_event_id, type,
                            signature_valid, status, payload, error, received_at, processed_at)
                        VALUES (:provider, NULL, :type, false, 'IGNORED', CAST(:payload AS jsonb),
                            :error, :now, :now)
                        RETURNING id
                        """)
                .param("provider", provider)
                .param("type", type)
                .param("payload", payloadJson)
                .param("error", error)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .single();
    }

    /** Stores a correctly signed but unreadable event as IGNORED. */
    public UUID insertUnreadable(
            String provider, String type, String payloadJson, String error, Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO payment_webhook_event (provider, provider_event_id, type,
                            signature_valid, status, payload, error, received_at, processed_at)
                        VALUES (:provider, NULL, :type, true, 'IGNORED', CAST(:payload AS jsonb),
                            :error, :now, :now)
                        RETURNING id
                        """)
                .param("provider", provider)
                .param("type", type)
                .param("payload", payloadJson)
                .param("error", error)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .single();
    }

    public Optional<WebhookEventRow> lock(UUID id) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", NULL AS payload FROM payment_webhook_event WHERE id = :id"
                                + " FOR UPDATE")
                .param("id", id)
                .query(WebhookEventRepository::map)
                .optional();
    }

    public Optional<WebhookEventRow> find(UUID id) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", payload::text AS payload FROM payment_webhook_event WHERE id"
                                + " = :id")
                .param("id", id)
                .query(WebhookEventRepository::map)
                .optional();
    }

    /** Records the processing outcome. */
    public void finish(
            UUID id,
            WebhookStatus status,
            @Nullable UUID paymentId,
            @Nullable String error,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE payment_webhook_event SET status = :status,
                               payment_id = COALESCE(:paymentId, payment_id), error = :error,
                               processed_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("paymentId", paymentId, Types.OTHER)
                .param("error", error, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** One page of events, newest first (status and provider optional). */
    public List<WebhookEventRow> page(
            @Nullable WebhookStatus status, @Nullable String provider, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(status, provider, params);
        params.put("limit", size);
        params.put("offset", (long) page * size);
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", NULL AS payload FROM payment_webhook_event"
                                + where
                                + " ORDER BY received_at DESC, id DESC LIMIT :limit OFFSET"
                                + " :offset")
                .params(params)
                .query(WebhookEventRepository::map)
                .list();
    }

    public long count(@Nullable WebhookStatus status, @Nullable String provider) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(status, provider, params);
        return jdbc.sql("SELECT count(*) FROM payment_webhook_event" + where)
                .params(params)
                .query(Long.class)
                .single();
    }

    /** Webhook events linked to a payment, oldest first. */
    public List<WebhookEventRow> ofPayment(UUID paymentId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", NULL AS payload FROM payment_webhook_event WHERE payment_id"
                                + " = :id ORDER BY received_at, id")
                .param("id", paymentId)
                .query(WebhookEventRepository::map)
                .list();
    }

    private static String where(
            @Nullable WebhookStatus status, @Nullable String provider, Map<String, Object> params) {
        StringBuilder where = new StringBuilder();
        if (status != null) {
            where.append(" WHERE status = :status");
            params.put("status", status.name());
        }
        if (provider != null) {
            where.append(where.isEmpty() ? " WHERE" : " AND").append(" provider = :provider");
            params.put("provider", provider);
        }
        return where.toString();
    }

    static WebhookEventRow map(ResultSet rs, int rowNum) throws SQLException {
        return new WebhookEventRow(
                rs.getObject("id", UUID.class),
                rs.getString("provider"),
                rs.getString("provider_event_id"),
                rs.getString("type"),
                rs.getBoolean("signature_valid"),
                WebhookStatus.valueOf(rs.getString("status")),
                rs.getObject("payment_id", UUID.class),
                rs.getString("payload"),
                rs.getString("error"),
                rs.getTimestamp("received_at").toInstant(),
                PaymentRepository.instant(rs, "processed_at"));
    }
}
