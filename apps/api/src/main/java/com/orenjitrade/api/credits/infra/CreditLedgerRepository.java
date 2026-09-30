package com.orenjitrade.api.credits.infra;

import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.credits.domain.CreditEntryType;
import com.orenjitrade.api.credits.domain.CreditRows.BalanceCheck;
import com.orenjitrade.api.credits.domain.CreditRows.CreditEntry;
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

/**
 * {@code credit_ledger_entry} access (explicit SQL; credits only). Inserts only: the table refuses
 * UPDATE and DELETE (trigger).
 */
@Repository
public class CreditLedgerRepository {

    private static final String COLUMNS =
            "id, user_id, amount, balance_after, type, reason, reference_type, reference_id,"
                    + " idempotency_key, details::text AS details, note, created_by, created_at";

    private final JdbcClient jdbc;

    public CreditLedgerRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Serialises the ledger of one account (transaction-scoped advisory lock, re-entrant). */
    public void lockAccount(UUID userId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "credits:" + userId)
                .query(rs -> {});
    }

    /** {@code SUM(amount)} of an account (0 without entries). */
    public long sum(UUID userId) {
        return jdbc.sql(
                        "SELECT COALESCE(SUM(amount), 0) FROM credit_ledger_entry WHERE user_id ="
                                + " :userId")
                .param("userId", userId)
                .query(Long.class)
                .single();
    }

    public Optional<CreditEntry> findByIdempotencyKey(String key) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM credit_ledger_entry WHERE idempotency_key = :key")
                .param("key", key)
                .query(CreditLedgerRepository::map)
                .optional();
    }

    public CreditEntry insert(
            UUID userId,
            int amount,
            int balanceAfter,
            CreditEntryType type,
            String reason,
            @Nullable String referenceType,
            @Nullable String referenceId,
            String idempotencyKey,
            String detailsJson,
            @Nullable String note,
            @Nullable UUID createdBy,
            Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO credit_ledger_entry (id, user_id, amount, balance_after, type,
                            reason, reference_type, reference_id, idempotency_key, details, note,
                            created_by, created_at)
                        VALUES (:id, :userId, :amount, :balanceAfter, :type, :reason,
                            :referenceType, :referenceId, :key, CAST(:details AS jsonb), :note,
                            :createdBy, :now)
                        """)
                .param("id", id)
                .param("userId", userId)
                .param("amount", amount)
                .param("balanceAfter", balanceAfter)
                .param("type", type.name())
                .param("reason", reason)
                .param("referenceType", referenceType, Types.VARCHAR)
                .param("referenceId", referenceId, Types.VARCHAR)
                .param("key", idempotencyKey)
                .param("details", detailsJson)
                .param("note", note, Types.VARCHAR)
                .param("createdBy", createdBy, Types.OTHER)
                .param("now", Timestamp.from(now))
                .update();
        return new CreditEntry(
                id,
                userId,
                amount,
                balanceAfter,
                type,
                reason,
                referenceType,
                referenceId,
                idempotencyKey,
                detailsJson,
                note,
                createdBy,
                now);
    }

    /** One slice of an account's entries, newest first, after {@code cursor}. */
    public List<CreditEntry> slice(UUID userId, @Nullable TimeCursor cursor, int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("userId", userId);
        params.put("limit", limit);
        String after = "";
        if (cursor != null) {
            after = " AND (created_at, id) < (:at, :id)";
            params.put("at", Timestamp.from(cursor.at()));
            params.put("id", cursor.id());
        }
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM credit_ledger_entry WHERE user_id = :userId"
                                + after
                                + " ORDER BY created_at DESC, id DESC LIMIT :limit")
                .params(params)
                .query(CreditLedgerRepository::map)
                .list();
    }

    /** One admin page of entries (all accounts or one), newest first. */
    public List<CreditEntry> page(@Nullable UUID userId, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = "";
        if (userId != null) {
            where = " WHERE user_id = :userId";
            params.put("userId", userId);
        }
        params.put("limit", size);
        params.put("offset", (long) page * size);
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM credit_ledger_entry"
                                + where
                                + " ORDER BY created_at DESC, seq DESC LIMIT :limit OFFSET"
                                + " :offset")
                .params(params)
                .query(CreditLedgerRepository::map)
                .list();
    }

    public long count(@Nullable UUID userId) {
        if (userId == null) {
            return jdbc.sql("SELECT count(*) FROM credit_ledger_entry").query(Long.class).single();
        }
        return jdbc.sql("SELECT count(*) FROM credit_ledger_entry WHERE user_id = :userId")
                .param("userId", userId)
                .query(Long.class)
                .single();
    }

    /** Every entry of an account, oldest first (export). */
    public List<CreditEntry> all(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM credit_ledger_entry WHERE user_id = :userId ORDER BY seq")
                .param("userId", userId)
                .query(CreditLedgerRepository::map)
                .list();
    }

    /**
     * One page of accounts holding entries with their derived balance and the running balance of
     * their latest entry (reconciliation), by account id.
     */
    public List<BalanceCheck> balanceChecks(int limit, @Nullable UUID after) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("limit", limit);
        String where = "";
        if (after != null) {
            where = " WHERE b.user_id > :after";
            params.put("after", after);
        }
        return jdbc.sql(
                        """
                        SELECT b.user_id, b.balance, latest.balance_after
                          FROM credit_balance b
                          JOIN LATERAL (SELECT balance_after FROM credit_ledger_entry e
                                         WHERE e.user_id = b.user_id
                                         ORDER BY e.seq DESC LIMIT 1) latest ON true
                        """
                                + where
                                + " ORDER BY b.user_id LIMIT :limit")
                .params(params)
                .query(
                        (rs, rowNum) ->
                                new BalanceCheck(
                                        rs.getObject("user_id", UUID.class),
                                        rs.getLong("balance"),
                                        rs.getLong("balance_after")))
                .list();
    }

    static CreditEntry map(ResultSet rs, int rowNum) throws SQLException {
        return new CreditEntry(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getInt("amount"),
                rs.getInt("balance_after"),
                CreditEntryType.valueOf(rs.getString("type")),
                rs.getString("reason"),
                rs.getString("reference_type"),
                rs.getString("reference_id"),
                rs.getString("idempotency_key"),
                rs.getString("details"),
                rs.getString("note"),
                rs.getObject("created_by", UUID.class),
                rs.getTimestamp("created_at").toInstant());
    }
}
