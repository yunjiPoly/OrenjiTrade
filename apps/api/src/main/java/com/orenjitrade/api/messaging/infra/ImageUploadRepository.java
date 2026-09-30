package com.orenjitrade.api.messaging.infra;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code image_upload} access; used only inside the messaging module. */
@Repository
public class ImageUploadRepository {

    private static final String COLUMNS =
            "id, owner_id, kind, storage_key, width, height, bytes, created_at";

    private final JdbcClient jdbc;

    public ImageUploadRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(UploadRow row) {
        jdbc.sql(
                        """
                        INSERT INTO image_upload (id, owner_id, kind, storage_key, width, height,
                            bytes, created_at)
                        VALUES (:id, :ownerId, :kind, :key, :width, :height, :bytes, :createdAt)
                        """)
                .param("id", row.id())
                .param("ownerId", row.ownerId())
                .param("kind", row.kind())
                .param("key", row.storageKey())
                .param("width", row.width())
                .param("height", row.height())
                .param("bytes", row.bytes())
                .param("createdAt", Timestamp.from(row.createdAt()))
                .update();
    }

    /**
     * An unconsumed upload of the owner created after {@code notBefore}, locked for the consuming
     * transaction.
     */
    public Optional<UploadRow> lockPending(UUID id, UUID ownerId, String kind, Instant notBefore) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM image_upload WHERE id = :id AND owner_id = :ownerId AND"
                                + " kind = :kind AND consumed_at IS NULL AND created_at >"
                                + " :notBefore FOR UPDATE")
                .param("id", id)
                .param("ownerId", ownerId)
                .param("kind", kind)
                .param("notBefore", Timestamp.from(notBefore))
                .query(ImageUploadRepository::map)
                .optional();
    }

    public void markConsumed(UUID id, Instant now) {
        jdbc.sql("UPDATE image_upload SET consumed_at = :now WHERE id = :id")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Unconsumed uploads created before {@code before}, oldest first. */
    public List<UploadRow> expired(Instant before, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM image_upload WHERE consumed_at IS NULL AND created_at <"
                                + " :before ORDER BY created_at LIMIT :limit")
                .param("before", Timestamp.from(before))
                .param("limit", limit)
                .query(ImageUploadRepository::map)
                .list();
    }

    /** Deletes unconsumed uploads by id; returns the number of rows. */
    public int deletePending(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return 0;
        }
        return jdbc.sql("DELETE FROM image_upload WHERE id IN (:ids) AND consumed_at IS NULL")
                .param("ids", ids)
                .update();
    }

    /**
     * Deletes every upload row of an account (account deletion).
     *
     * @return storage keys of the unconsumed ones (consumed objects belong to messages)
     */
    public List<String> deleteByOwner(UUID ownerId) {
        List<String> keys =
                jdbc.sql(
                                "SELECT storage_key FROM image_upload WHERE owner_id = :ownerId"
                                        + " AND consumed_at IS NULL")
                        .param("ownerId", ownerId)
                        .query(String.class)
                        .list();
        jdbc.sql("DELETE FROM image_upload WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .update();
        return keys;
    }

    private static UploadRow map(ResultSet rs, int rowNum) throws SQLException {
        return new UploadRow(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getString("kind"),
                rs.getString("storage_key"),
                rs.getInt("width"),
                rs.getInt("height"),
                rs.getInt("bytes"),
                rs.getTimestamp("created_at").toInstant());
    }

    /** A stored upload. */
    public record UploadRow(
            UUID id,
            UUID ownerId,
            String kind,
            String storageKey,
            int width,
            int height,
            int bytes,
            Instant createdAt) {}
}
