package com.orenjitrade.api.community.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code community_post_photo} access (stage R11); used only inside the community module. The
 * stored objects are deleted by the caller once the rows are gone.
 */
@Repository
public class PostPhotoRepository {

    private final JdbcClient jdbc;

    public PostPhotoRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(
            UUID id,
            UUID postId,
            String storageKey,
            int width,
            int height,
            int bytes,
            int position,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO community_post_photo (id, post_id, storage_key, width, height,
                            bytes, position, created_at)
                        VALUES (:id, :postId, :key, :width, :height, :bytes, :position, :now)
                        """)
                .param("id", id)
                .param("postId", postId)
                .param("key", storageKey)
                .param("width", width)
                .param("height", height)
                .param("bytes", bytes)
                .param("position", position)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Photos of each post, in their order; posts without photos are absent. */
    public Map<UUID, List<PhotoRow>> byPosts(Collection<UUID> postIds) {
        Map<UUID, List<PhotoRow>> result = new LinkedHashMap<>();
        if (postIds.isEmpty()) {
            return result;
        }
        jdbc.sql(
                        "SELECT post_id, storage_key, width, height FROM community_post_photo"
                                + " WHERE post_id IN (:ids) ORDER BY post_id, position")
                .param("ids", postIds)
                .query(
                        (rs, rowNum) ->
                                new PhotoRow(
                                        rs.getObject("post_id", UUID.class),
                                        rs.getString("storage_key"),
                                        rs.getInt("width"),
                                        rs.getInt("height")))
                .list()
                .forEach(
                        row ->
                                result.computeIfAbsent(row.postId(), id -> new ArrayList<>())
                                        .add(row));
        return result;
    }

    /** Deletes the photos of a post; returns their storage keys. */
    public List<String> deleteOfPost(UUID postId) {
        return jdbc.sql(
                        "DELETE FROM community_post_photo WHERE post_id = :postId RETURNING"
                                + " storage_key")
                .param("postId", postId)
                .query(String.class)
                .list();
    }

    /** Deletes the photos of every post of an author (account deletion); returns their keys. */
    public List<String> deleteByAuthor(UUID authorId) {
        return jdbc.sql(
                        """
                        DELETE FROM community_post_photo ph USING community_post p
                         WHERE p.id = ph.post_id AND p.author_id = :author
                        RETURNING ph.storage_key
                        """)
                .param("author", authorId)
                .query(String.class)
                .list();
    }

    /** A stored photo. */
    public record PhotoRow(UUID postId, String storageKey, int width, int height) {}
}
