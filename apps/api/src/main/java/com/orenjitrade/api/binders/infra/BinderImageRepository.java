package com.orenjitrade.api.binders.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code binder_image} access (V126, stage R3): the photos of a binder, like {@code
 * inventory_item_image}. Writes run with the binder row held (see {@code BinderService}).
 */
@Repository
public class BinderImageRepository {

    private final JdbcClient jdbc;

    public BinderImageRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Photos of the given binders, by binder then position. */
    public List<ImageRow> findByBinders(Collection<UUID> binderIds) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        """
                        SELECT id, binder_id, storage_key, width, height, sort_order
                          FROM binder_image
                         WHERE binder_id IN (:ids)
                         ORDER BY binder_id, sort_order, created_at, id
                        """)
                .param("ids", binderIds)
                .query(
                        (rs, rowNum) ->
                                new ImageRow(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("binder_id", UUID.class),
                                        rs.getString("storage_key"),
                                        rs.getInt("width"),
                                        rs.getInt("height"),
                                        rs.getInt("sort_order")))
                .list();
    }

    public long countByBinder(UUID binderId) {
        return jdbc.sql("SELECT count(*) FROM binder_image WHERE binder_id = :binderId")
                .param("binderId", binderId)
                .query(Long.class)
                .single();
    }

    public int nextSortOrder(UUID binderId) {
        Integer max =
                jdbc
                        .sql(
                                "SELECT max(sort_order) FROM binder_image WHERE binder_id ="
                                        + " :binderId")
                        .param("binderId", binderId)
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
            UUID binderId,
            String storageKey,
            String url,
            int width,
            int height,
            int sortOrder,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO binder_image (id, binder_id, storage_key, url, width, height,
                            sort_order, created_at)
                        VALUES (:id, :binderId, :storageKey, :url, :width, :height, :sortOrder,
                            :now)
                        """)
                .param("id", id)
                .param("binderId", binderId)
                .param("storageKey", storageKey)
                .param("url", url)
                .param("width", width)
                .param("height", height)
                .param("sortOrder", sortOrder)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Deletes one photo of a binder; returns its storage key when it existed. */
    public Optional<String> delete(UUID binderId, UUID imageId) {
        return jdbc.sql(
                        """
                        DELETE FROM binder_image WHERE id = :id AND binder_id = :binderId
                        RETURNING storage_key
                        """)
                .param("id", imageId)
                .param("binderId", binderId)
                .query(String.class)
                .optional();
    }

    /**
     * Storage keys of the photos of the given binders (read before the binders are deleted: the
     * rows go with them, {@code ON DELETE CASCADE}, the stored objects are deleted by the caller).
     */
    public List<String> keysOf(Collection<UUID> binderIds) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("SELECT storage_key FROM binder_image WHERE binder_id IN (:ids)")
                .param("ids", binderIds)
                .query(String.class)
                .list();
    }

    /** Storage keys of every photo of an owner's binders (account purge). */
    public List<String> keysOfOwner(UUID ownerId) {
        return jdbc.sql(
                        """
                        SELECT im.storage_key FROM binder_image im
                          JOIN binder b ON b.id = im.binder_id
                         WHERE b.owner_id = :ownerId
                        """)
                .param("ownerId", ownerId)
                .query(String.class)
                .list();
    }

    /** A stored photo row. */
    public record ImageRow(
            UUID id, UUID binderId, String storageKey, int width, int height, int sortOrder) {}
}
