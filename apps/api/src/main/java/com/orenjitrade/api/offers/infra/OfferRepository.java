package com.orenjitrade.api.offers.infra;

import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.offers.domain.OfferRow;
import com.orenjitrade.api.offers.domain.OfferStatus;
import com.orenjitrade.api.offers.domain.OfferTradeItemRow;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
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
 * {@code offer} and {@code offer_trade_item} access (explicit SQL); used only inside the offers
 * module. The live proposal of a chain is the row without {@code superseded_by}; {@code
 * uq_offer_live_buyer_item} keeps one live negotiation per buyer and item.
 */
@Repository
public class OfferRepository {

    private static final String COLUMNS =
            """
            o.id, o.root_offer_id, o.parent_offer_id, o.superseded_by, o.item_id, o.seller_id,
            o.buyer_id, o.kind, o.cash_amount, o.currency, o.status, o.current_turn, o.message,
            o.protection_requested, o.expires_at, o.created_at, o.updated_at, o.closed_at,
            o.version
            """;

    private final JdbcClient jdbc;

    public OfferRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    /**
     * Inserts a proposal. The unique live index answers a concurrent second offer of the same buyer
     * on the same item with {@code false} (nothing inserted).
     */
    public boolean insert(NewOffer offer) {
        return jdbc.sql(
                                """
                                INSERT INTO offer (id, root_offer_id, parent_offer_id, item_id,
                                    seller_id, buyer_id, kind, cash_amount, currency, status,
                                    current_turn, message, protection_requested, item_snapshot,
                                    expires_at, created_at, updated_at, version)
                                VALUES (:id, :rootId, :parentId, :itemId, :sellerId, :buyerId,
                                    :kind, :cash, :currency, :status, :turn, :message,
                                    :protection, CAST(:snapshot AS jsonb), :expiresAt, :now, :now,
                                    0)
                                ON CONFLICT (buyer_id, item_id)
                                    WHERE status IN ('OPEN', 'COUNTERED') AND superseded_by IS NULL
                                DO NOTHING
                                """)
                        .param("id", offer.id())
                        .param("rootId", offer.rootOfferId())
                        .param("parentId", offer.parentOfferId(), Types.OTHER)
                        .param("itemId", offer.itemId())
                        .param("sellerId", offer.sellerId())
                        .param("buyerId", offer.buyerId())
                        .param("kind", offer.kind().name())
                        .param("cash", offer.cashAmount(), Types.NUMERIC)
                        .param("currency", offer.currency(), Types.CHAR)
                        .param("status", offer.status().name())
                        .param("turn", offer.currentTurn().name())
                        .param("message", offer.message(), Types.VARCHAR)
                        .param("protection", offer.protectionRequested())
                        .param("snapshot", offer.itemSnapshotJson())
                        .param("expiresAt", Timestamp.from(offer.expiresAt()))
                        .param("now", Timestamp.from(offer.createdAt()))
                        .update()
                > 0;
    }

    /** The buyer's cards of a proposal, in order. */
    public void insertTradeItems(UUID offerId, List<NewTradeItem> items) {
        int position = 0;
        for (NewTradeItem item : items) {
            jdbc.sql(
                            """
                            INSERT INTO offer_trade_item (id, offer_id, inventory_item_id, quantity,
                                position, item_snapshot)
                            VALUES (:id, :offerId, :itemId, :quantity, :position,
                                CAST(:snapshot AS jsonb))
                            """)
                    .param("id", UUID.randomUUID())
                    .param("offerId", offerId)
                    .param("itemId", item.inventoryItemId())
                    .param("quantity", item.quantity())
                    .param("position", position++)
                    .param("snapshot", item.snapshotJson())
                    .update();
        }
    }

    /**
     * Moves a proposal to {@code status} when it still has {@code expectedVersion} (optimistic
     * lock); {@code supersededBy} marks a proposal a counter-offer replaced. Leaving the live
     * states sets {@code closed_at}.
     *
     * @return whether the row changed (false = stale)
     */
    public boolean transition(
            UUID id,
            int expectedVersion,
            OfferStatus status,
            @Nullable UUID supersededBy,
            Instant now) {
        boolean closes = supersededBy != null || !status.isPending();
        return jdbc.sql(
                                """
                                UPDATE offer
                                   SET status = :status, superseded_by = :supersededBy,
                                       closed_at = :closedAt, updated_at = :now,
                                       version = version + 1
                                 WHERE id = :id AND version = :version
                                """)
                        .param("id", id)
                        .param("version", expectedVersion)
                        .param("status", status.name())
                        .param("supersededBy", supersededBy, Types.OTHER)
                        .param("closedAt", closes ? Timestamp.from(now) : null, Types.TIMESTAMP)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /** Erases the notes of the proposals a (deleted) collector made; returns the rows changed. */
    public int eraseMessagesOf(UUID userId) {
        return jdbc.sql(
                        """
                        UPDATE offer SET message = NULL
                         WHERE message IS NOT NULL
                           AND ((buyer_id = :id AND current_turn = 'SELLER')
                                OR (seller_id = :id AND current_turn = 'BUYER'))
                        """)
                .param("id", userId)
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    public Optional<OfferRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM offer o WHERE o.id = :id")
                .param("id", id)
                .query(OfferRepository::map)
                .optional();
    }

    /** The proposal, locked for the rest of the transaction. */
    public Optional<OfferRow> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM offer o WHERE o.id = :id FOR UPDATE")
                .param("id", id)
                .query(OfferRepository::map)
                .optional();
    }

    /** The buyer's live negotiation on an item, if any. */
    public Optional<OfferRow> findLive(UUID buyerId, UUID itemId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer o WHERE o.buyer_id = :buyerId AND o.item_id ="
                                + " :itemId AND o.status IN ('OPEN', 'COUNTERED') AND"
                                + " o.superseded_by IS NULL")
                .param("buyerId", buyerId)
                .param("itemId", itemId)
                .query(OfferRepository::map)
                .optional();
    }

    /** Every proposal of a chain, oldest first. */
    public List<OfferRow> chain(UUID rootOfferId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer o WHERE o.root_offer_id = :rootId"
                                + " ORDER BY o.created_at, o.id")
                .param("rootId", rootOfferId)
                .query(OfferRepository::map)
                .list();
    }

    /**
     * For each requested proposal id, the live proposal of its chain (the latest counter-offer or
     * the proposal itself), keyed by the requested id.
     */
    public Map<UUID, OfferRow> latestOfChains(Collection<UUID> offerIds) {
        Map<UUID, OfferRow> result = new LinkedHashMap<>();
        if (offerIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT requested.id AS requested_id, "
                                + COLUMNS
                                + " FROM offer requested JOIN offer o ON o.root_offer_id ="
                                + " requested.root_offer_id AND o.superseded_by IS NULL"
                                + " WHERE requested.id IN (:ids)")
                .param("ids", List.copyOf(offerIds))
                .query(
                        rs -> {
                            result.put(rs.getObject("requested_id", UUID.class), map(rs, 0));
                        });
        return result;
    }

    /**
     * One slice of a collector's offers: the live (latest) proposal of each chain where the
     * collector is the buyer and/or the seller, most recent activity first.
     */
    public List<OfferRow> page(
            UUID userId,
            @Nullable OfferRole role,
            Collection<OfferStatus> statuses,
            @Nullable TimeCursor cursor,
            int limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("me", userId);
        params.put("limit", limit);
        StringBuilder where = new StringBuilder(" WHERE o.superseded_by IS NULL");
        if (role == OfferRole.BUYER) {
            where.append(" AND o.buyer_id = :me");
        } else if (role == OfferRole.SELLER) {
            where.append(" AND o.seller_id = :me");
        } else {
            where.append(" AND (o.buyer_id = :me OR o.seller_id = :me)");
        }
        if (!statuses.isEmpty()) {
            where.append(" AND o.status IN (:statuses)");
            params.put("statuses", statuses.stream().map(Enum::name).toList());
        }
        if (cursor != null) {
            where.append(" AND (o.updated_at, o.id) < (:cursorAt, :cursorId)");
            params.put("cursorAt", Timestamp.from(cursor.at()));
            params.put("cursorId", cursor.id());
        }
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer o"
                                + where
                                + " ORDER BY o.updated_at DESC, o.id DESC LIMIT :limit")
                .params(params)
                .query(OfferRepository::map)
                .list();
    }

    /** Live pending proposals past their expiry, locked (other runners skip them). */
    public List<OfferRow> lockDue(Instant now, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer o WHERE o.status IN ('OPEN', 'COUNTERED') AND"
                                + " o.superseded_by IS NULL AND o.expires_at <= :now"
                                + " ORDER BY o.expires_at LIMIT :limit FOR UPDATE SKIP LOCKED")
                .param("now", Timestamp.from(now))
                .param("limit", limit)
                .query(OfferRepository::map)
                .list();
    }

    /** Live pending proposals where the collector is a party (account deletion). */
    public List<OfferRow> pendingOf(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer o WHERE (o.buyer_id = :id OR o.seller_id = :id)"
                                + " AND o.status IN ('OPEN', 'COUNTERED') AND o.superseded_by IS"
                                + " NULL FOR UPDATE")
                .param("id", userId)
                .query(OfferRepository::map)
                .list();
    }

    /** Proposals where the collector is a party, newest first (export). */
    public List<OfferRow> ofUser(UUID userId, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer o WHERE o.buyer_id = :id OR o.seller_id = :id"
                                + " ORDER BY o.created_at DESC, o.id DESC LIMIT :limit")
                .param("id", userId)
                .param("limit", limit)
                .query(OfferRepository::map)
                .list();
    }

    /** The stored public snapshot of a proposal's target item (JSON object). */
    public String itemSnapshot(UUID offerId) {
        return jdbc.sql("SELECT item_snapshot::text FROM offer WHERE id = :id")
                .param("id", offerId)
                .query(String.class)
                .optional()
                .orElse("{}");
    }

    /** The buyer's cards of the given proposals, in order, by proposal id. */
    public Map<UUID, List<OfferTradeItemRow>> tradeItems(Collection<UUID> offerIds) {
        Map<UUID, List<OfferTradeItemRow>> result = new LinkedHashMap<>();
        if (offerIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT offer_id, inventory_item_id, quantity, position FROM"
                                + " offer_trade_item WHERE offer_id IN (:ids) ORDER BY offer_id,"
                                + " position")
                .param("ids", List.copyOf(offerIds))
                .query(
                        rs -> {
                            OfferTradeItemRow row =
                                    new OfferTradeItemRow(
                                            rs.getObject("offer_id", UUID.class),
                                            rs.getObject("inventory_item_id", UUID.class),
                                            rs.getInt("quantity"),
                                            rs.getInt("position"));
                            result.computeIfAbsent(row.offerId(), id -> new ArrayList<>()).add(row);
                        });
        return result;
    }

    /** The stored public snapshots of a proposal's trade cards, by position. */
    public Map<Integer, String> tradeItemSnapshots(UUID offerId) {
        Map<Integer, String> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT position, item_snapshot::text AS snapshot FROM offer_trade_item"
                                + " WHERE offer_id = :id ORDER BY position")
                .param("id", offerId)
                .query(
                        rs -> {
                            result.put(rs.getInt("position"), rs.getString("snapshot"));
                        });
        return result;
    }

    static OfferRow map(ResultSet rs, int rowNum) throws SQLException {
        String currency = rs.getString("currency");
        Timestamp closedAt = rs.getTimestamp("closed_at");
        BigDecimal cash = rs.getBigDecimal("cash_amount");
        return new OfferRow(
                rs.getObject("id", UUID.class),
                rs.getObject("root_offer_id", UUID.class),
                rs.getObject("parent_offer_id", UUID.class),
                rs.getObject("superseded_by", UUID.class),
                rs.getObject("item_id", UUID.class),
                rs.getObject("seller_id", UUID.class),
                rs.getObject("buyer_id", UUID.class),
                OfferKind.valueOf(rs.getString("kind")),
                cash,
                currency == null ? null : currency.trim(),
                OfferStatus.valueOf(rs.getString("status")),
                OfferRole.valueOf(rs.getString("current_turn")),
                rs.getString("message"),
                rs.getBoolean("protection_requested"),
                rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                closedAt == null ? null : closedAt.toInstant(),
                rs.getInt("version"));
    }

    /**
     * A proposal to insert.
     *
     * @param id proposal id
     * @param rootOfferId chain root (= id for a new offer)
     * @param parentOfferId answered proposal (counter-offers)
     * @param itemId the seller's item
     * @param sellerId the item's owner
     * @param buyerId the offering collector
     * @param kind kind
     * @param cashAmount cash part
     * @param currency currency of the cash part
     * @param status OPEN (new offers) or COUNTERED (counter-offers)
     * @param currentTurn the party expected to answer
     * @param message the proposing party's note
     * @param protectionRequested payment protection asked by the buyer
     * @param itemSnapshotJson public form of the item (JSON object)
     * @param expiresAt expiry
     * @param createdAt creation
     */
    public record NewOffer(
            UUID id,
            UUID rootOfferId,
            @Nullable UUID parentOfferId,
            UUID itemId,
            UUID sellerId,
            UUID buyerId,
            OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            OfferStatus status,
            OfferRole currentTurn,
            @Nullable String message,
            boolean protectionRequested,
            String itemSnapshotJson,
            Instant expiresAt,
            Instant createdAt) {}

    /**
     * A card of the buyer to insert with a proposal.
     *
     * @param inventoryItemId the buyer's item
     * @param quantity copies offered
     * @param snapshotJson public form of the item (JSON object)
     */
    public record NewTradeItem(UUID inventoryItemId, int quantity, String snapshotJson) {}
}
