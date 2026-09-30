package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionEventRow;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.domain.SubscriptionStatus;
import java.math.BigDecimal;
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

/** {@code subscription} and {@code subscription_event} access (explicit SQL; billing only). */
@Repository
public class SubscriptionRepository {

    private static final String SELECT =
            """
            SELECT s.id, s.user_id, s.plan_id, p.code AS plan_code, p.name AS plan_name, s.status,
                   s.provider, s.provider_ref, s.checkout_ref, s.checkout_url, s.amount, s.currency,
                   s.current_period_start, s.current_period_end, s.cancel_at_period_end,
                   s.cancel_requested_at, s.activated_at, s.ended_at, s.failure_code,
                   s.created_at, s.updated_at, s.version
              FROM subscription s JOIN plan p ON p.id = s.plan_id
            """;

    private static final String LIVE = "('PENDING', 'TRIAL', 'ACTIVE', 'PAST_DUE')";

    private final JdbcClient jdbc;

    public SubscriptionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Serialises subscription changes of one account (transaction-scoped advisory lock). */
    public void lockAccount(UUID userId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "subscription:" + userId)
                .query(rs -> {});
    }

    public void insertPending(
            UUID id,
            UUID userId,
            UUID planId,
            String provider,
            BigDecimal amount,
            String currency,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO subscription (id, user_id, plan_id, status, provider, amount,
                            currency, created_at, updated_at)
                        VALUES (:id, :userId, :planId, 'PENDING', :provider, :amount, :currency,
                            :now, :now)
                        """)
                .param("id", id)
                .param("userId", userId)
                .param("planId", planId)
                .param("provider", provider)
                .param("amount", amount)
                .param("currency", currency)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Inserts an ACTIVE subscription as it stands (seed data). */
    public boolean insertActiveIfAbsent(
            UUID id,
            UUID userId,
            UUID planId,
            String provider,
            String providerRef,
            String checkoutRef,
            BigDecimal amount,
            String currency,
            Instant periodStart,
            Instant periodEnd,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO subscription (id, user_id, plan_id, status, provider,
                                    provider_ref, checkout_ref, amount, currency,
                                    current_period_start, current_period_end, activated_at,
                                    created_at, updated_at)
                                VALUES (:id, :userId, :planId, 'ACTIVE', :provider, :providerRef,
                                    :checkoutRef, :amount, :currency, :start, :end, :start,
                                    :start, :now)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", id)
                        .param("userId", userId)
                        .param("planId", planId)
                        .param("provider", provider)
                        .param("providerRef", providerRef)
                        .param("checkoutRef", checkoutRef)
                        .param("amount", amount)
                        .param("currency", currency)
                        .param("start", Timestamp.from(periodStart))
                        .param("end", Timestamp.from(periodEnd))
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void setCheckout(UUID id, String checkoutRef, String checkoutUrl, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET checkout_ref = :ref, checkout_url = :url,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("ref", checkoutRef)
                .param("url", checkoutUrl)
                .param("now", Timestamp.from(now))
                .update();
    }

    public Optional<SubscriptionRow> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE s.id = :id")
                .param("id", id)
                .query(SubscriptionRepository::map)
                .optional();
    }

    public Optional<SubscriptionRow> lock(UUID id) {
        return jdbc.sql(SELECT + " WHERE s.id = :id FOR UPDATE OF s")
                .param("id", id)
                .query(SubscriptionRepository::map)
                .optional();
    }

    /** The live subscription of an account (checkout in progress or entitling), locked. */
    public Optional<SubscriptionRow> lockLive(UUID userId) {
        return jdbc.sql(
                        SELECT
                                + " WHERE s.user_id = :userId AND s.status IN "
                                + LIVE
                                + " FOR UPDATE OF s")
                .param("userId", userId)
                .query(SubscriptionRepository::map)
                .optional();
    }

    public Optional<SubscriptionRow> findLive(UUID userId) {
        return jdbc.sql(SELECT + " WHERE s.user_id = :userId AND s.status IN " + LIVE)
                .param("userId", userId)
                .query(SubscriptionRepository::map)
                .optional();
    }

    public Optional<SubscriptionRow> lockByCheckoutRef(String provider, String checkoutRef) {
        return jdbc.sql(
                        SELECT
                                + " WHERE s.provider = :provider AND s.checkout_ref = :ref FOR"
                                + " UPDATE OF s")
                .param("provider", provider)
                .param("ref", checkoutRef)
                .query(SubscriptionRepository::map)
                .optional();
    }

    public Optional<SubscriptionRow> findByCheckoutRef(String provider, String checkoutRef) {
        return jdbc.sql(SELECT + " WHERE s.provider = :provider AND s.checkout_ref = :ref")
                .param("provider", provider)
                .param("ref", checkoutRef)
                .query(SubscriptionRepository::map)
                .optional();
    }

    public Optional<SubscriptionRow> lockByProviderRef(String provider, String providerRef) {
        return jdbc.sql(
                        SELECT
                                + " WHERE s.provider = :provider AND s.provider_ref = :ref FOR"
                                + " UPDATE OF s")
                .param("provider", provider)
                .param("ref", providerRef)
                .query(SubscriptionRepository::map)
                .optional();
    }

    public void activate(
            UUID id, String providerRef, Instant periodStart, Instant periodEnd, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET status = 'ACTIVE', provider_ref = :ref,
                               current_period_start = :start, current_period_end = :end,
                               activated_at = COALESCE(activated_at, :now), failure_code = NULL,
                               checkout_url = NULL, updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("ref", providerRef)
                .param("start", Timestamp.from(periodStart))
                .param("end", Timestamp.from(periodEnd))
                .param("now", Timestamp.from(now))
                .update();
    }

    public void renew(UUID id, Instant periodStart, Instant periodEnd, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET status = 'ACTIVE', current_period_start = :start,
                               current_period_end = :end, failure_code = NULL, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("start", Timestamp.from(periodStart))
                .param("end", Timestamp.from(periodEnd))
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markPastDue(UUID id, @Nullable String failureCode, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET status = 'PAST_DUE', failure_code = :code,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("code", failureCode, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void recordCheckoutFailure(UUID id, @Nullable String failureCode, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET failure_code = :code, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("code", failureCode == null ? "checkout_failed" : failureCode)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void requestCancel(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET cancel_at_period_end = true,
                               cancel_requested_at = COALESCE(cancel_requested_at, :now),
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Ends a subscription (CANCELLED or EXPIRED). */
    public void end(UUID id, SubscriptionStatus status, Instant now) {
        jdbc.sql(
                        """
                        UPDATE subscription SET status = :status, ended_at = :now,
                               checkout_url = NULL,
                               cancel_requested_at = COALESCE(cancel_requested_at, :now),
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("status", status.name())
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Appends a history entry (a replayed provider event is a no-op). */
    public void addEvent(
            UUID subscriptionId,
            String event,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            String detailsJson,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO subscription_event (subscription_id, event, provider_event_id,
                            actor_id, details, created_at)
                        VALUES (:id, :event, :providerEventId, :actorId, CAST(:details AS jsonb),
                            :now)
                        ON CONFLICT (subscription_id, event, provider_event_id) DO NOTHING
                        """)
                .param("id", subscriptionId)
                .param("event", event)
                .param("providerEventId", providerEventId, Types.VARCHAR)
                .param("actorId", actorId, Types.OTHER)
                .param("details", detailsJson)
                .param("now", Timestamp.from(now))
                .update();
    }

    public List<SubscriptionEventRow> events(UUID subscriptionId) {
        return jdbc.sql(
                        """
                        SELECT id, event, provider_event_id, actor_id, details::text AS details,
                               created_at
                          FROM subscription_event WHERE subscription_id = :id
                         ORDER BY created_at, seq
                        """)
                .param("id", subscriptionId)
                .query(
                        (rs, rowNum) ->
                                new SubscriptionEventRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("event"),
                                        rs.getString("provider_event_id"),
                                        rs.getObject("actor_id", UUID.class),
                                        rs.getString("details"),
                                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }

    /** Every subscription of an account, newest first (export). */
    public List<SubscriptionRow> ofUser(UUID userId) {
        return jdbc.sql(SELECT + " WHERE s.user_id = :userId ORDER BY s.created_at DESC, s.id")
                .param("userId", userId)
                .query(SubscriptionRepository::map)
                .list();
    }

    /** Entitling subscriptions whose paid period ended at {@code now}, oldest first. */
    public List<SubscriptionRow> periodEnded(Instant now, int limit) {
        return jdbc.sql(
                        SELECT
                                + " WHERE s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE') AND"
                                + " s.current_period_end <= :now ORDER BY s.current_period_end"
                                + " LIMIT :limit")
                .param("now", Timestamp.from(now))
                .param("limit", limit)
                .query(SubscriptionRepository::map)
                .list();
    }

    /** One admin page, most recent change first. */
    public List<SubscriptionRow> page(
            @Nullable SubscriptionStatus status,
            @Nullable String planCode,
            @Nullable UUID userId,
            int page,
            int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(status, planCode, userId, params);
        params.put("limit", size);
        params.put("offset", (long) page * size);
        return jdbc.sql(
                        SELECT
                                + where
                                + " ORDER BY s.updated_at DESC, s.id DESC LIMIT :limit OFFSET"
                                + " :offset")
                .params(params)
                .query(SubscriptionRepository::map)
                .list();
    }

    public long count(
            @Nullable SubscriptionStatus status, @Nullable String planCode, @Nullable UUID userId) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(status, planCode, userId, params);
        return jdbc.sql(
                        "SELECT count(*) FROM subscription s JOIN plan p ON p.id = s.plan_id"
                                + where)
                .params(params)
                .query(Long.class)
                .single();
    }

    private static String where(
            @Nullable SubscriptionStatus status,
            @Nullable String planCode,
            @Nullable UUID userId,
            Map<String, Object> params) {
        StringBuilder where = new StringBuilder(" WHERE true");
        if (status != null) {
            where.append(" AND s.status = :status");
            params.put("status", status.name());
        }
        if (planCode != null) {
            where.append(" AND p.code = :planCode");
            params.put("planCode", planCode);
        }
        if (userId != null) {
            where.append(" AND s.user_id = :userId");
            params.put("userId", userId);
        }
        return where.toString();
    }

    static SubscriptionRow map(ResultSet rs, int rowNum) throws SQLException {
        return new SubscriptionRow(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getObject("plan_id", UUID.class),
                rs.getString("plan_code"),
                rs.getString("plan_name"),
                SubscriptionStatus.valueOf(rs.getString("status")),
                rs.getString("provider"),
                rs.getString("provider_ref"),
                rs.getString("checkout_ref"),
                rs.getString("checkout_url"),
                rs.getBigDecimal("amount"),
                rs.getString("currency").trim(),
                instant(rs, "current_period_start"),
                instant(rs, "current_period_end"),
                rs.getBoolean("cancel_at_period_end"),
                instant(rs, "cancel_requested_at"),
                instant(rs, "activated_at"),
                instant(rs, "ended_at"),
                rs.getString("failure_code"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getInt("version"));
    }

    static @Nullable Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
