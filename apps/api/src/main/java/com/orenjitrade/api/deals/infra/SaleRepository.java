package com.orenjitrade.api.deals.infra;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code sale} access (stage R4); used only inside the deals module. The sale row references the
 * card or binder it sold: the transaction that inserts it already holds them {@code FOR NO KEY
 * UPDATE} (the key-share lock of the foreign key check is compatible), so the insert waits for no
 * other write.
 */
@Repository
public class SaleRepository {

    private static final String COLUMNS =
            "id, conversation_id, seller_id, buyer_id, kind, inventory_item_id, binder_id, name,"
                    + " quantity, tracking_number, item_removed, removed_item_ids, created_at,"
                    + " undone_at";

    private final JdbcClient jdbc;

    public SaleRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(SaleRow row) {
        jdbc.sql(
                        """
                        INSERT INTO sale (id, conversation_id, seller_id, buyer_id, kind,
                            inventory_item_id, binder_id, name, quantity, tracking_number,
                            item_removed, removed_item_ids, created_at)
                        VALUES (:id, :conversationId, :sellerId, :buyerId, :kind, :itemId,
                            :binderId, :name, :quantity, :tracking, :itemRemoved,
                            CAST(:removedItemIds AS uuid[]), :createdAt)
                        """)
                .param("id", row.id())
                .param("conversationId", row.conversationId())
                .param("sellerId", row.sellerId())
                .param("buyerId", row.buyerId())
                .param("kind", row.kind())
                .param("itemId", row.itemId(), Types.OTHER)
                .param("binderId", row.binderId(), Types.OTHER)
                .param("name", row.name())
                .param("quantity", row.quantity())
                .param("tracking", row.trackingNumber(), Types.VARCHAR)
                .param("itemRemoved", row.itemRemoved())
                .param("removedItemIds", uuidArray(row.removedItemIds()))
                .param("createdAt", Timestamp.from(row.createdAt()))
                .update();
    }

    public Optional<SaleRow> find(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM sale WHERE id = :id")
                .param("id", id)
                .query(SaleRepository::map)
                .optional();
    }

    /** The sale, locked {@code FOR UPDATE} (its undo; the caller holds the seller's owner lock). */
    public Optional<SaleRow> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM sale WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(SaleRepository::map)
                .optional();
    }

    /**
     * The newest live sale of the same card, made after {@code after}, that took its last copies
     * (review fix 1, F4: the undo of an older sale that left copies), locked {@code FOR UPDATE};
     * the caller holds the seller's owner lock, as every write of these rows.
     */
    public Optional<SaleRow> lockLaterRemoval(UUID itemId, Instant after, UUID excludedId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM sale WHERE inventory_item_id = :itemId AND id <> :id"
                                + " AND undone_at IS NULL AND item_removed AND created_at >="
                                + " :after ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE")
                .param("itemId", itemId)
                .param("id", excludedId)
                .param("after", Timestamp.from(after))
                .query(SaleRepository::map)
                .optional();
    }

    /**
     * The sale no longer took the card's last copies: an older sale's undo brought the card back
     * with its own copies, so this sale's undo adds its copies back instead of restoring the card.
     */
    public void keepItem(UUID id) {
        jdbc.sql("UPDATE sale SET item_removed = false WHERE id = :id").param("id", id).update();
    }

    public void markUndone(UUID id, Instant now) {
        jdbc.sql("UPDATE sale SET undone_at = :now WHERE id = :id AND undone_at IS NULL")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The sales not undone of these conversations (the pinned bars' "Sold"). */
    public List<SaleRow> liveIn(Collection<UUID> conversationIds) {
        if (conversationIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM sale WHERE conversation_id IN (:ids) AND undone_at IS"
                                + " NULL")
                .param("ids", conversationIds)
                .query(SaleRepository::map)
                .list();
    }

    /** The sales of these ids that still exist (the rating form's deal line, stage R14). */
    public List<SaleRow> findAll(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT " + COLUMNS + " FROM sale WHERE id IN (:ids)")
                .param("ids", ids)
                .query(SaleRepository::map)
                .list();
    }

    /** Sales where the account sold or bought, newest first (export). */
    public List<SaleRow> of(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM sale WHERE seller_id = :id OR buyer_id = :id"
                                + " ORDER BY created_at DESC, id DESC")
                .param("id", userId)
                .query(SaleRepository::map)
                .list();
    }

    /** Deletes the account's sales, sold and bought (account purge). */
    public int deleteOf(UUID userId) {
        return jdbc.sql("DELETE FROM sale WHERE seller_id = :id OR buyer_id = :id")
                .param("id", userId)
                .update();
    }

    private static String uuidArray(List<UUID> ids) {
        StringBuilder text = new StringBuilder("{");
        for (int index = 0; index < ids.size(); index++) {
            if (index > 0) {
                text.append(',');
            }
            text.append(ids.get(index));
        }
        return text.append('}').toString();
    }

    private static SaleRow map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp undoneAt = rs.getTimestamp("undone_at");
        List<UUID> removed = new ArrayList<>();
        @Nullable Array array = rs.getArray("removed_item_ids");
        if (array != null) {
            for (Object id : (Object[]) array.getArray()) {
                removed.add(id instanceof UUID uuid ? uuid : UUID.fromString(String.valueOf(id)));
            }
        }
        return new SaleRow(
                rs.getObject("id", UUID.class),
                rs.getObject("conversation_id", UUID.class),
                rs.getObject("seller_id", UUID.class),
                rs.getObject("buyer_id", UUID.class),
                rs.getString("kind"),
                rs.getObject("inventory_item_id", UUID.class),
                rs.getObject("binder_id", UUID.class),
                rs.getString("name"),
                rs.getInt("quantity"),
                rs.getString("tracking_number"),
                rs.getBoolean("item_removed"),
                List.copyOf(removed),
                rs.getTimestamp("created_at").toInstant(),
                undoneAt == null ? null : undoneAt.toInstant());
    }

    /**
     * A stored sale.
     *
     * @param kind CARD or DECK_CORE
     * @param itemId the card sold (null once purged with its account)
     * @param binderId the deck core sold (null once deleted)
     * @param itemRemoved the sale took the card's last copy
     * @param removedItemIds deck cores: the cards that left with it
     */
    public record SaleRow(
            UUID id,
            UUID conversationId,
            UUID sellerId,
            UUID buyerId,
            String kind,
            @Nullable UUID itemId,
            @Nullable UUID binderId,
            String name,
            int quantity,
            @Nullable String trackingNumber,
            boolean itemRemoved,
            List<UUID> removedItemIds,
            Instant createdAt,
            @Nullable Instant undoneAt) {}
}
