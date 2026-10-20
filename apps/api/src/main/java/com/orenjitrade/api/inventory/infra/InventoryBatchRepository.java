package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.binders.domain.ListingVisibility;
import java.sql.Types;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The read of the batch add ({@code POST /inventory/items/batch}): the collector's items a line can
 * add its copies to. Writes go through {@link InventoryItemRepository}.
 */
@Repository
public class InventoryBatchRepository {

    private final JdbcClient jdbc;

    public InventoryBatchRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The owner's live items of the given printings with exactly this visibility and in this binder
     * ({@code null}: no binder), read without a row lock, the oldest first. The caller holds the
     * owner lock and compares the rest of the item (language, condition, edition, finish).
     */
    public List<EqualItem> equalItems(
            UUID ownerId,
            Collection<UUID> printingIds,
            ListingVisibility visibility,
            @Nullable UUID binderId) {
        List<EqualItem> result = new ArrayList<>();
        List<UUID> distinct = printingIds.stream().distinct().toList();
        for (int from = 0; from < distinct.size(); from += 1000) {
            jdbc.sql(
                            """
                            SELECT id, printing_id, condition, language, edition, finish, quantity
                              FROM inventory_item
                             WHERE owner_id = :ownerId AND deleted_at IS NULL
                               AND printing_id IN (:printingIds)
                               AND visibility = :visibility
                               AND binder_id IS NOT DISTINCT FROM CAST(:binderId AS uuid)
                             ORDER BY created_at, id
                            """)
                    .param("ownerId", ownerId)
                    .param(
                            "printingIds",
                            distinct.subList(from, Math.min(distinct.size(), from + 1000)))
                    .param("visibility", visibility.name())
                    .param("binderId", binderId, Types.OTHER)
                    .query(
                            rs -> {
                                result.add(
                                        new EqualItem(
                                                rs.getObject("id", UUID.class),
                                                rs.getObject("printing_id", UUID.class),
                                                rs.getString("condition"),
                                                rs.getString("language"),
                                                rs.getString("edition"),
                                                rs.getString("finish"),
                                                rs.getInt("quantity")));
                            });
        }
        return result;
    }

    /**
     * An item a batch line can raise.
     *
     * @param id item
     * @param printingId printing
     * @param condition condition code ({@code null} when not stated)
     * @param language ISO 639-1
     * @param edition edition code
     * @param finish finish code
     * @param quantity copies now
     */
    public record EqualItem(
            UUID id,
            UUID printingId,
            @Nullable String condition,
            String language,
            String edition,
            String finish,
            int quantity) {}
}
