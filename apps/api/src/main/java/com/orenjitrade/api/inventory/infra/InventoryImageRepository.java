package com.orenjitrade.api.inventory.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code inventory_item_image} access. */
@Repository
public class InventoryImageRepository {

    private final JdbcClient jdbc;

    public InventoryImageRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Images of the given items, by item then position. */
    public List<ImageRow> findByItems(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        """
                        SELECT id, item_id, storage_key, width, height, sort_order
                          FROM inventory_item_image
                         WHERE item_id IN (:ids)
                         ORDER BY item_id, sort_order, created_at, id
                        """)
                .param("ids", itemIds)
                .query(
                        (rs, rowNum) ->
                                new ImageRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("item_id", UUID.class),
                                        rs.getString("storage_key"),
                                        rs.getInt("width"),
                                        rs.getInt("height"),
                                        rs.getInt("sort_order")))
                .list();
    }

    public long countByItem(UUID itemId) {
        return jdbc.sql("SELECT count(*) FROM inventory_item_image WHERE item_id = :itemId")
                .param("itemId", itemId)
                .query(Long.class)
                .single();
    }

    public int nextSortOrder(UUID itemId) {
        Integer max =
                jdbc
                        .sql(
                                "SELECT max(sort_order) FROM inventory_item_image WHERE item_id ="
                                        + " :itemId")
                        .param("itemId", itemId)
                        .query(Integer.class)
                        .list()
                        .stream()
                        .filter(java.util.Objects::nonNull)
                        .findFirst()
                        .orElse(null);
        return max == null ? 0 : max + 1;
    }

    public void insert(
            UUID id,
            UUID itemId,
            String storageKey,
            String url,
            int width,
            int height,
            int sortOrder,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO inventory_item_image (id, item_id, storage_key, url, width,
                            height, sort_order, created_at)
                        VALUES (:id, :itemId, :storageKey, :url, :width, :height, :sortOrder, :now)
                        """)
                .param("id", id)
                .param("itemId", itemId)
                .param("storageKey", storageKey)
                .param("url", url)
                .param("width", width)
                .param("height", height)
                .param("sortOrder", sortOrder)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Deletes one image of an item; returns its storage key when it existed. */
    public Optional<String> delete(UUID itemId, UUID imageId) {
        return jdbc.sql(
                        """
                        DELETE FROM inventory_item_image WHERE id = :id AND item_id = :itemId
                        RETURNING storage_key
                        """)
                .param("id", imageId)
                .param("itemId", itemId)
                .query(String.class)
                .optional();
    }

    /** Deletes every image of the given items; returns their storage keys. */
    public List<String> deleteByItems(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "DELETE FROM inventory_item_image WHERE item_id IN (:ids) RETURNING"
                                + " storage_key")
                .param("ids", itemIds)
                .query(String.class)
                .list();
    }

    /** A stored image row. */
    public record ImageRow(
            UUID id, UUID itemId, String storageKey, int width, int height, int sortOrder) {}
}
