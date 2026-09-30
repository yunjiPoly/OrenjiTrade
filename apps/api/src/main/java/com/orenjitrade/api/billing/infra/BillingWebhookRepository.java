package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.SubscriptionRows.BillingWebhookRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.WebhookState;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code billing_webhook_event} access (explicit SQL; billing only). */
@Repository
public class BillingWebhookRepository {

    private static final String COLUMNS =
            "id, provider, provider_event_id, type, signature_valid, status, subscription_id,"
                    + " error, received_at, processed_at";

    private final JdbcClient jdbc;

    public BillingWebhookRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Stores a verified event unless already received; the new id, empty for a duplicate. */
    public Optional<UUID> insertVerified(
            String provider, String providerEventId, String type, String payloadJson, Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO billing_webhook_event (provider, provider_event_id, type,
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

    /** Stores a refused event (invalid signature or unreadable body) as IGNORED. */
    public UUID insertIgnored(
            String provider,
            String type,
            boolean signatureValid,
            String payloadJson,
            String error,
            Instant now) {
        return jdbc.sql(
                        """
                        INSERT INTO billing_webhook_event (provider, provider_event_id, type,
                            signature_valid, status, payload, error, received_at, processed_at)
                        VALUES (:provider, NULL, :type, :valid, 'IGNORED', CAST(:payload AS jsonb),
                            :error, :now, :now)
                        RETURNING id
                        """)
                .param("provider", provider)
                .param("type", type)
                .param("valid", signatureValid)
                .param("payload", payloadJson)
                .param("error", error)
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .single();
    }

    public Optional<BillingWebhookRow> lock(UUID id) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", NULL AS payload FROM billing_webhook_event WHERE id = :id FOR"
                                + " UPDATE")
                .param("id", id)
                .query(BillingWebhookRepository::map)
                .optional();
    }

    /** Records the processing outcome. */
    public void finish(
            UUID id,
            WebhookState status,
            @Nullable UUID subscriptionId,
            @Nullable String error,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE billing_webhook_event SET status = :status,
                               subscription_id = COALESCE(:subscriptionId, subscription_id),
                               error = :error, processed_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("subscriptionId", subscriptionId, Types.OTHER)
                .param("error", error, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Webhooks linked to a subscription, oldest first, with payloads (admin detail). */
    public List<BillingWebhookRow> ofSubscription(UUID subscriptionId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + ", payload::text AS payload FROM billing_webhook_event WHERE"
                                + " subscription_id = :id ORDER BY received_at, id")
                .param("id", subscriptionId)
                .query(BillingWebhookRepository::map)
                .list();
    }

    /** Status of a stored webhook (tests and admin tooling). */
    public Optional<WebhookState> status(UUID id) {
        return jdbc.sql("SELECT status FROM billing_webhook_event WHERE id = :id")
                .param("id", id)
                .query((rs, rowNum) -> WebhookState.valueOf(rs.getString("status")))
                .optional();
    }

    static BillingWebhookRow map(ResultSet rs, int rowNum) throws SQLException {
        return new BillingWebhookRow(
                rs.getObject("id", UUID.class),
                rs.getString("provider"),
                rs.getString("provider_event_id"),
                rs.getString("type"),
                rs.getBoolean("signature_valid"),
                WebhookState.valueOf(rs.getString("status")),
                rs.getObject("subscription_id", UUID.class),
                rs.getString("payload"),
                rs.getString("error"),
                rs.getTimestamp("received_at").toInstant(),
                SubscriptionRepository.instant(rs, "processed_at"));
    }
}
