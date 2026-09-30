package com.orenjitrade.api.donations.infra;

import com.orenjitrade.api.donations.domain.DonationRows.CurrencyTotal;
import com.orenjitrade.api.donations.domain.DonationRows.DonationRow;
import com.orenjitrade.api.donations.domain.DonationRows.DonationStatus;
import com.orenjitrade.api.donations.domain.DonationRows.SupporterRow;
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

/** {@code donation} access (explicit SQL; donations only). */
@Repository
public class DonationRepository {

    private static final String COLUMNS =
            "id, user_id, amount, currency, provider, provider_ref, checkout_url, status, message,"
                    + " public_thanks, failure_code, succeeded_at, refunded_at, created_at,"
                    + " updated_at";

    private final JdbcClient jdbc;

    public DonationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insertPending(
            UUID id,
            UUID userId,
            BigDecimal amount,
            String currency,
            String provider,
            @Nullable String message,
            boolean publicThanks,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO donation (id, user_id, amount, currency, provider, status,
                            message, public_thanks, created_at, updated_at)
                        VALUES (:id, :userId, :amount, :currency, :provider, 'PENDING', :message,
                            :publicThanks, :now, :now)
                        """)
                .param("id", id)
                .param("userId", userId)
                .param("amount", amount)
                .param("currency", currency)
                .param("provider", provider)
                .param("message", message, Types.VARCHAR)
                .param("publicThanks", publicThanks)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Inserts a finished donation as it stands (seed); returns whether it did. */
    public boolean insertSeed(
            UUID id,
            UUID userId,
            BigDecimal amount,
            String currency,
            String provider,
            String providerRef,
            DonationStatus status,
            @Nullable String message,
            boolean publicThanks,
            Instant createdAt) {
        return jdbc.sql(
                                """
                                INSERT INTO donation (id, user_id, amount, currency, provider,
                                    provider_ref, status, message, public_thanks, succeeded_at,
                                    created_at, updated_at)
                                VALUES (:id, :userId, :amount, :currency, :provider, :ref,
                                    :status, :message, :publicThanks,
                                    CASE WHEN :status IN ('SUCCEEDED', 'REFUNDED') THEN
                                        CAST(:createdAt AS timestamptz) END,
                                    :createdAt, :createdAt)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("id", id)
                        .param("userId", userId)
                        .param("amount", amount)
                        .param("currency", currency)
                        .param("provider", provider)
                        .param("ref", providerRef)
                        .param("status", status.name())
                        .param("message", message, Types.VARCHAR)
                        .param("publicThanks", publicThanks)
                        .param("createdAt", Timestamp.from(createdAt))
                        .update()
                > 0;
    }

    public void setCheckout(UUID id, String ref, String url, Instant now) {
        jdbc.sql(
                        """
                        UPDATE donation SET provider_ref = :ref, checkout_url = :url,
                               updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("ref", ref)
                .param("url", url)
                .param("now", Timestamp.from(now))
                .update();
    }

    public Optional<DonationRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM donation WHERE id = :id")
                .param("id", id)
                .query(DonationRepository::map)
                .optional();
    }

    public Optional<DonationRow> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM donation WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(DonationRepository::map)
                .optional();
    }

    public Optional<DonationRow> findByRef(String provider, String ref) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM donation WHERE provider = :provider AND provider_ref ="
                                + " :ref")
                .param("provider", provider)
                .param("ref", ref)
                .query(DonationRepository::map)
                .optional();
    }

    public Optional<DonationRow> lockByRef(String provider, String ref) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM donation WHERE provider = :provider AND provider_ref ="
                                + " :ref FOR UPDATE")
                .param("provider", provider)
                .param("ref", ref)
                .query(DonationRepository::map)
                .optional();
    }

    public void markSucceeded(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE donation SET status = 'SUCCEEDED', succeeded_at = :now,
                               checkout_url = NULL, failure_code = NULL, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markFailed(UUID id, @Nullable String failureCode, Instant now) {
        jdbc.sql(
                        """
                        UPDATE donation SET status = 'FAILED', failure_code = :code,
                               checkout_url = NULL, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("code", failureCode == null ? "failed" : failureCode)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markRefunded(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE donation SET status = 'REFUNDED', refunded_at = :now,
                               updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The donor's donations, newest first. */
    public List<DonationRow> ofUser(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM donation WHERE user_id = :userId ORDER BY created_at"
                                + " DESC, id")
                .param("userId", userId)
                .query(DonationRepository::map)
                .list();
    }

    /** Opted-in donors of succeeded donations, most recent first (one row per donor). */
    public List<SupporterRow> supporters(int limit) {
        return jdbc.sql(
                        """
                        SELECT user_id, max(succeeded_at) AS last_succeeded_at FROM donation
                         WHERE status = 'SUCCEEDED' AND public_thanks AND user_id IS NOT NULL
                         GROUP BY user_id ORDER BY last_succeeded_at DESC LIMIT :limit
                        """)
                .param("limit", limit)
                .query(
                        (rs, rowNum) ->
                                new SupporterRow(
                                        rs.getObject("user_id", UUID.class),
                                        rs.getTimestamp("last_succeeded_at").toInstant()))
                .list();
    }

    /** Purge: the note and the public thanks of an account's donations are erased. */
    public void anonymise(UUID userId, Instant now) {
        jdbc.sql(
                        """
                        UPDATE donation SET message = NULL, public_thanks = false,
                               updated_at = :now
                         WHERE user_id = :userId
                        """)
                .param("userId", userId)
                .param("now", Timestamp.from(now))
                .update();
    }

    public List<DonationRow> page(@Nullable DonationStatus status, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = status == null ? "" : " WHERE status = :status";
        if (status != null) {
            params.put("status", status.name());
        }
        params.put("limit", size);
        params.put("offset", (long) page * size);
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM donation"
                                + where
                                + " ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset")
                .params(params)
                .query(DonationRepository::map)
                .list();
    }

    public long count(@Nullable DonationStatus status) {
        if (status == null) {
            return jdbc.sql("SELECT count(*) FROM donation").query(Long.class).single();
        }
        return jdbc.sql("SELECT count(*) FROM donation WHERE status = :status")
                .param("status", status.name())
                .query(Long.class)
                .single();
    }

    /** Succeeded donations per currency. */
    public List<CurrencyTotal> totals() {
        return jdbc.sql(
                        """
                        SELECT currency, sum(amount) AS total, count(*) AS donations
                          FROM donation WHERE status = 'SUCCEEDED'
                         GROUP BY currency ORDER BY currency
                        """)
                .query(
                        (rs, rowNum) ->
                                new CurrencyTotal(
                                        rs.getString("currency").trim(),
                                        rs.getBigDecimal("total"),
                                        rs.getLong("donations")))
                .list();
    }

    static DonationRow map(ResultSet rs, int rowNum) throws SQLException {
        return new DonationRow(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getBigDecimal("amount"),
                rs.getString("currency").trim(),
                rs.getString("provider"),
                rs.getString("provider_ref"),
                rs.getString("checkout_url"),
                DonationStatus.valueOf(rs.getString("status")),
                rs.getString("message"),
                rs.getBoolean("public_thanks"),
                rs.getString("failure_code"),
                instant(rs, "succeeded_at"),
                instant(rs, "refunded_at"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    static @Nullable Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
