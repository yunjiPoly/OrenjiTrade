package com.orenjitrade.api.trades.infra;

import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeStatus;
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

/** {@code trade} access (explicit SQL); used only inside the trades module. */
@Repository
public class TradeRepository {

    private static final String COLUMNS =
            """
            t.id, t.offer_id, t.item_id, t.seller_id, t.buyer_id, t.kind, t.cash_amount,
            t.currency, t.status, t.protection_enabled, t.meetup, t.buyer_meetup_at,
            t.seller_meetup_at, t.buyer_confirmed_at, t.seller_confirmed_at, t.cancelled_by,
            t.cancel_reason, t.cancelled_at, t.created_at, t.updated_at, t.completed_at, t.version
            """;

    private final JdbcClient jdbc;

    public TradeRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    public void insert(
            UUID id,
            UUID offerId,
            UUID itemId,
            UUID sellerId,
            UUID buyerId,
            OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            TradeStatus status,
            boolean protectionEnabled,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO trade (id, offer_id, item_id, seller_id, buyer_id, kind,
                            cash_amount, currency, status, protection_enabled, created_at,
                            updated_at)
                        VALUES (:id, :offerId, :itemId, :sellerId, :buyerId, :kind, :cash,
                            :currency, :status, :protection, :now, :now)
                        """)
                .param("id", id)
                .param("offerId", offerId)
                .param("itemId", itemId)
                .param("sellerId", sellerId)
                .param("buyerId", buyerId)
                .param("kind", kind.name())
                .param("cash", cashAmount, Types.NUMERIC)
                .param("currency", currency, Types.CHAR)
                .param("status", status.name())
                .param("protection", protectionEnabled)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Marks the party's in-person meetup (first mark only). */
    public boolean markMeetup(UUID id, OfferRole role, Instant now) {
        String column = role == OfferRole.BUYER ? "buyer_meetup_at" : "seller_meetup_at";
        return jdbc.sql(
                                "UPDATE trade SET "
                                        + column
                                        + " = :now, updated_at = :now, version = version + 1"
                                        + " WHERE id = :id AND "
                                        + column
                                        + " IS NULL")
                        .param("id", id)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /**
     * Both parties marked the meetup: {@code meetup = true}; payment protection is dropped and an
     * AWAITING_PAYMENT trade goes back to AGREED.
     */
    public void agreeMeetup(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE trade SET meetup = true, protection_enabled = false,
                               status = CASE WHEN status = 'AWAITING_PAYMENT' THEN 'AGREED'
                                             ELSE status END,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Records the party's confirmation of the exchange (first confirmation only). */
    public boolean confirm(UUID id, OfferRole role, Instant now) {
        String column = role == OfferRole.BUYER ? "buyer_confirmed_at" : "seller_confirmed_at";
        return jdbc.sql(
                                "UPDATE trade SET "
                                        + column
                                        + " = :now, updated_at = :now, version = version + 1"
                                        + " WHERE id = :id AND "
                                        + column
                                        + " IS NULL")
                        .param("id", id)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void complete(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE trade SET status = 'COMPLETED', completed_at = :now,
                               updated_at = :now, version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void cancel(UUID id, UUID cancelledBy, @Nullable String reason, Instant now) {
        jdbc.sql(
                        """
                        UPDATE trade SET status = 'CANCELLED', cancelled_by = :by,
                               cancel_reason = :reason, cancelled_at = :now, updated_at = :now,
                               version = version + 1
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("by", cancelledBy)
                .param("reason", reason, Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Erases the cancel reasons a (deleted) collector wrote; returns the rows changed. */
    public int eraseCancelReasonsOf(UUID userId) {
        return jdbc.sql(
                        "UPDATE trade SET cancel_reason = NULL WHERE cancelled_by = :id AND"
                                + " cancel_reason IS NOT NULL")
                .param("id", userId)
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    public Optional<TradeRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM trade t WHERE t.id = :id")
                .param("id", id)
                .query(TradeRepository::map)
                .optional();
    }

    public Optional<TradeRow> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM trade t WHERE t.id = :id FOR UPDATE")
                .param("id", id)
                .query(TradeRepository::map)
                .optional();
    }

    /**
     * Serialises acceptances on one item until the end of the transaction (a transaction-scoped
     * advisory lock), so two offers accepted at once cannot promise the same last copy.
     */
    public void lockItem(UUID itemId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "trade-item:" + itemId)
                .query()
                .listOfRows();
    }

    /** Open trades on an item (copies already promised); locks them against a racing accept. */
    public int countOpenForItem(UUID itemId) {
        return jdbc.sql(
                        "SELECT id FROM trade WHERE item_id = :itemId AND status NOT IN"
                                + " ('COMPLETED', 'CANCELLED') FOR UPDATE")
                .param("itemId", itemId)
                .query(UUID.class)
                .list()
                .size();
    }

    /** The trades of accepted proposals, by proposal id. */
    public Map<UUID, UUID> idsByOffer(Collection<UUID> offerIds) {
        Map<UUID, UUID> result = new LinkedHashMap<>();
        if (offerIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT offer_id, id FROM trade WHERE offer_id IN (:ids)")
                .param("ids", List.copyOf(offerIds))
                .query(
                        rs -> {
                            result.put(
                                    rs.getObject("offer_id", UUID.class),
                                    rs.getObject("id", UUID.class));
                        });
        return result;
    }

    /** One slice of a collector's trades, most recent activity first. */
    public List<TradeRow> page(
            UUID userId,
            @Nullable OfferRole role,
            Collection<TradeStatus> statuses,
            @Nullable TimeCursor cursor,
            int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("me", userId);
        params.put("limit", limit);
        StringBuilder where = new StringBuilder();
        if (role == OfferRole.BUYER) {
            where.append(" WHERE t.buyer_id = :me");
        } else if (role == OfferRole.SELLER) {
            where.append(" WHERE t.seller_id = :me");
        } else {
            where.append(" WHERE (t.buyer_id = :me OR t.seller_id = :me)");
        }
        if (!statuses.isEmpty()) {
            where.append(" AND t.status IN (:statuses)");
            params.put("statuses", statuses.stream().map(Enum::name).toList());
        }
        if (cursor != null) {
            where.append(" AND (t.updated_at, t.id) < (:cursorAt, :cursorId)");
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM trade t"
                                + where
                                + " ORDER BY t.updated_at DESC, t.id DESC LIMIT :limit")
                .params(params)
                .query(TradeRepository::map)
                .list();
    }

    /** Open trades of a collector (account deletion blockers). */
    public int countOpenOf(UUID userId) {
        return jdbc.sql(
                        "SELECT count(*) FROM trade WHERE (buyer_id = :id OR seller_id = :id) AND"
                                + " status NOT IN ('COMPLETED', 'CANCELLED')")
                .param("id", userId)
                .query(Integer.class)
                .single();
    }

    /** Trades of a collector, newest first (export). */
    public List<TradeRow> ofUser(UUID userId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM trade t WHERE t.buyer_id = :id OR t.seller_id = :id"
                                + " ORDER BY t.created_at DESC, t.id DESC LIMIT :limit")
                .param("id", userId)
                .param("limit", limit)
                .query(TradeRepository::map)
                .list();
    }

    static TradeRow map(ResultSet rs, int rowNum) throws SQLException {
        String currency = rs.getString("currency");
        return new TradeRow(
                rs.getObject("id", UUID.class),
                rs.getObject("offer_id", UUID.class),
                rs.getObject("item_id", UUID.class),
                rs.getObject("seller_id", UUID.class),
                rs.getObject("buyer_id", UUID.class),
                OfferKind.valueOf(rs.getString("kind")),
                rs.getBigDecimal("cash_amount"),
                currency == null ? null : currency.trim(),
                TradeStatus.valueOf(rs.getString("status")),
                rs.getBoolean("protection_enabled"),
                rs.getBoolean("meetup"),
                instant(rs, "buyer_meetup_at"),
                instant(rs, "seller_meetup_at"),
                instant(rs, "buyer_confirmed_at"),
                instant(rs, "seller_confirmed_at"),
                rs.getObject("cancelled_by", UUID.class),
                rs.getString("cancel_reason"),
                instant(rs, "cancelled_at"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                instant(rs, "completed_at"),
                rs.getInt("version"));
    }

    private static @Nullable Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
