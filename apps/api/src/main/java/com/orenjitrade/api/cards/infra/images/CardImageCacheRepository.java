package com.orenjitrade.api.cards.infra.images;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
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
 * Persistence of the card image cache (ADR 0015): the single accounting row {@code
 * card_image_cache_usage} (always locked with {@code SELECT ... FOR UPDATE} before capacity
 * changes), the reservations and the cache columns of {@code card_image}. Every method joins the
 * caller's transaction.
 */
@Repository
public class CardImageCacheRepository {

    private static final String IMAGE_COLUMNS =
            """
            i.id, i.game_id, g.slug AS game, i.card_id, c.slug AS card_slug, c.name AS card_name,
            i.provider, i.provider_image_id, i.source_url, i.cache_status, i.storage_key,
            i.content_type, i.file_size_bytes, i.checksum_sha256, i.width, i.height,
            i.attempt_count, i.last_attempt_at, i.downloaded_at, i.last_accessed_at, i.url
            """;

    private static final String IMAGE_FROM =
            """
             FROM card_image i
             JOIN card c ON c.id = i.card_id
             JOIN game g ON g.id = i.game_id
            """;

    private final JdbcClient jdbc;

    public CardImageCacheRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // -------------------------------------------------------------------------------------
    // Accounting
    // -------------------------------------------------------------------------------------

    /** Locks the accounting row until the end of the transaction and returns it. */
    public Usage lockUsage() {
        return jdbc.sql(
                        "SELECT used_bytes, file_count, reconciled_at FROM card_image_cache_usage"
                                + " WHERE id = 1 FOR UPDATE")
                .query(CardImageCacheRepository::mapUsage)
                .optional()
                .orElseGet(this::createUsage);
    }

    /** Reads the accounting row without locking. */
    public Usage usage() {
        return jdbc.sql(
                        "SELECT used_bytes, file_count, reconciled_at FROM card_image_cache_usage"
                                + " WHERE id = 1")
                .query(CardImageCacheRepository::mapUsage)
                .optional()
                .orElse(new Usage(0, 0, null));
    }

    private Usage createUsage() {
        jdbc.sql("INSERT INTO card_image_cache_usage (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
                .update();
        return jdbc.sql(
                        "SELECT used_bytes, file_count, reconciled_at FROM card_image_cache_usage"
                                + " WHERE id = 1 FOR UPDATE")
                .query(CardImageCacheRepository::mapUsage)
                .single();
    }

    public void addUsage(long bytes, int files, Instant now) {
        jdbc.sql(
                        """
                        UPDATE card_image_cache_usage
                           SET used_bytes = greatest(0, used_bytes + :bytes),
                               file_count = greatest(0, file_count + :files), updated_at = :now
                         WHERE id = 1
                        """)
                .param("bytes", bytes)
                .param("files", files)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void setUsage(long bytes, int files, @Nullable Instant reconciledAt, Instant now) {
        jdbc.sql(
                        """
                        UPDATE card_image_cache_usage
                           SET used_bytes = :bytes, file_count = :files,
                               reconciled_at = coalesce(:reconciledAt, reconciled_at),
                               updated_at = :now
                         WHERE id = 1
                        """)
                .param("bytes", bytes)
                .param("files", files)
                .param(
                        "reconciledAt",
                        reconciledAt == null ? null : Timestamp.from(reconciledAt),
                        java.sql.Types.TIMESTAMP)
                .param("now", Timestamp.from(now))
                .update();
    }

    // -------------------------------------------------------------------------------------
    // Reservations
    // -------------------------------------------------------------------------------------

    /** Bytes of the reservations alive at {@code now}. */
    public long reservedBytes(Instant now) {
        return jdbc.sql(
                        "SELECT coalesce(sum(bytes), 0) FROM card_image_cache_reservation WHERE"
                                + " expires_at > :now")
                .param("now", Timestamp.from(now))
                .query(Long.class)
                .single();
    }

    /** Deletes the expired reservations and returns their ids. */
    public List<UUID> deleteExpiredReservations(Instant now) {
        return jdbc.sql(
                        "DELETE FROM card_image_cache_reservation WHERE expires_at <= :now"
                                + " RETURNING id")
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .list();
    }

    public List<UUID> liveReservationIds(Instant now) {
        return jdbc.sql("SELECT id FROM card_image_cache_reservation WHERE expires_at > :now")
                .param("now", Timestamp.from(now))
                .query(UUID.class)
                .list();
    }

    public void insertReservation(
            UUID id,
            @Nullable UUID imageId,
            long bytes,
            String owner,
            Instant now,
            Instant expiresAt) {
        jdbc.sql(
                        """
                        INSERT INTO card_image_cache_reservation (id, image_id, bytes, owner,
                            created_at, expires_at)
                        VALUES (:id, :imageId, :bytes, :owner, :now, :expiresAt)
                        """)
                .param("id", id)
                .param("imageId", imageId, java.sql.Types.OTHER)
                .param("bytes", bytes)
                .param("owner", owner)
                .param("now", Timestamp.from(now))
                .param("expiresAt", Timestamp.from(expiresAt))
                .update();
    }

    /** Bytes of a live reservation, empty when it no longer exists or has expired. */
    public Optional<Long> liveReservation(UUID id, Instant now) {
        return jdbc.sql(
                        "SELECT bytes FROM card_image_cache_reservation WHERE id = :id AND"
                                + " expires_at > :now")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .query(Long.class)
                .optional();
    }

    public void resizeReservation(UUID id, long bytes) {
        jdbc.sql("UPDATE card_image_cache_reservation SET bytes = :bytes WHERE id = :id")
                .param("id", id)
                .param("bytes", bytes)
                .update();
    }

    public int deleteReservation(UUID id) {
        return jdbc.sql("DELETE FROM card_image_cache_reservation WHERE id = :id")
                .param("id", id)
                .update();
    }

    public long reservationCount(Instant now) {
        return jdbc.sql("SELECT count(*) FROM card_image_cache_reservation WHERE expires_at > :now")
                .param("now", Timestamp.from(now))
                .query(Long.class)
                .single();
    }

    // -------------------------------------------------------------------------------------
    // Images
    // -------------------------------------------------------------------------------------

    public Optional<ImageRow> findImage(UUID id) {
        return jdbc.sql("SELECT " + IMAGE_COLUMNS + IMAGE_FROM + " WHERE i.id = :id")
                .param("id", id)
                .query(CardImageCacheRepository::mapImage)
                .optional();
    }

    /** A CACHED row with this checksum other than {@code exceptId} (deduplication). */
    public Optional<ImageRow> findCachedByChecksum(String checksum, UUID exceptId) {
        return jdbc.sql(
                        "SELECT "
                                + IMAGE_COLUMNS
                                + IMAGE_FROM
                                + " WHERE i.checksum_sha256 = :checksum AND i.cache_status ="
                                + " 'CACHED' AND i.id <> :id ORDER BY i.downloaded_at, i.id"
                                + " LIMIT 1")
                .param("checksum", checksum)
                .param("id", exceptId)
                .query(CardImageCacheRepository::mapImage)
                .optional();
    }

    /** CACHED rows sharing the file {@code storageKey}, other than {@code exceptId}. */
    public long countReferences(String storageKey, @Nullable UUID exceptId) {
        return jdbc.sql(
                        "SELECT count(*) FROM card_image WHERE storage_key = :key AND cache_status"
                                + " = 'CACHED' AND (CAST(:id AS uuid) IS NULL OR id <> CAST(:id AS"
                                + " uuid))")
                .param("key", storageKey)
                .param("id", exceptId, java.sql.Types.OTHER)
                .query(Long.class)
                .single();
    }

    /** Every CACHED row (optionally of one game). */
    public List<ImageRow> cachedImages(@Nullable UUID gameId) {
        return jdbc.sql(
                        "SELECT "
                                + IMAGE_COLUMNS
                                + IMAGE_FROM
                                + " WHERE i.cache_status = 'CACHED' AND (CAST(:gameId AS uuid) IS"
                                + " NULL OR i.game_id = CAST(:gameId AS uuid))"
                                + " ORDER BY i.last_accessed_at NULLS FIRST, i.downloaded_at NULLS"
                                + " FIRST, i.id")
                .param("gameId", gameId, java.sql.Types.OTHER)
                .query(CardImageCacheRepository::mapImage)
                .list();
    }

    public void markAttempt(UUID id, Instant now) {
        jdbc.sql(
                        "UPDATE card_image SET attempt_count = attempt_count + 1, last_attempt_at ="
                                + " :now WHERE id = :id")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markCached(
            UUID id,
            String storageKey,
            String contentType,
            long size,
            String checksum,
            int width,
            int height,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE card_image
                           SET cache_status = 'CACHED', storage_key = :key, content_type = :type,
                               file_size_bytes = :size, checksum_sha256 = :checksum, width = :width,
                               height = :height, downloaded_at = :now, last_error = NULL,
                               updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("key", storageKey)
                .param("type", contentType)
                .param("size", size)
                .param("checksum", checksum)
                .param("width", width)
                .param("height", height)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Back to NOT_CACHED (file gone or evicted); keeps the provider reference. */
    public int markNotCached(Collection<UUID> ids, Instant now) {
        if (ids.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (List<UUID> chunk : chunks(ids)) {
            total +=
                    jdbc.sql(
                                    """
                                    UPDATE card_image
                                       SET cache_status = 'NOT_CACHED', storage_key = NULL,
                                           content_type = NULL, file_size_bytes = NULL,
                                           checksum_sha256 = NULL, width = NULL, height = NULL,
                                           downloaded_at = NULL, updated_at = :now
                                     WHERE id IN (:ids) AND provider_image_id IS NOT NULL
                                    """)
                            .param("ids", chunk)
                            .param("now", Timestamp.from(now))
                            .update();
        }
        return total;
    }

    public void markFailed(UUID id, String status, String error, Instant now) {
        jdbc.sql(
                        """
                        UPDATE card_image
                           SET cache_status = :status, last_error = :error, storage_key = NULL,
                               content_type = NULL, file_size_bytes = NULL, checksum_sha256 = NULL,
                               width = NULL, height = NULL, downloaded_at = NULL, updated_at = :now
                         WHERE id = :id AND provider_image_id IS NOT NULL
                        """)
                .param("id", id)
                .param("status", status)
                .param("error", error.length() > 500 ? error.substring(0, 500) : error)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void updateFileSize(UUID id, long size) {
        jdbc.sql("UPDATE card_image SET file_size_bytes = :size WHERE id = :id")
                .param("id", id)
                .param("size", size)
                .update();
    }

    /** Records an access at most once per hour per image (cheap, idempotent). */
    public void touch(UUID id, Instant now) {
        jdbc.sql(
                        """
                        UPDATE card_image SET last_accessed_at = :now
                         WHERE id = :id
                           AND (last_accessed_at IS NULL OR last_accessed_at < :threshold)
                        """)
                .param("id", id)
                .param("now", Timestamp.from(now))
                .param("threshold", Timestamp.from(now.minusSeconds(3600)))
                .update();
    }

    /** Provider artworks of a game ordered for a deterministic fill: name, position, id. */
    public List<Candidate> candidates(UUID gameId, String provider) {
        return jdbc.sql(
                        """
                        SELECT i.id, i.cache_status, i.storage_key
                          FROM card_image i
                          JOIN card c ON c.id = i.card_id
                         WHERE i.game_id = :gameId AND i.provider = :provider
                         ORDER BY c.normalized_name, c.id, i.position, i.provider_image_id
                        """)
                .param("gameId", gameId)
                .param("provider", provider)
                .query(
                        (rs, rowNum) ->
                                new Candidate(
                                        rs.getObject("id", UUID.class),
                                        rs.getString("cache_status"),
                                        rs.getString("storage_key")))
                .list();
    }

    public long countProviderImages(UUID gameId, String provider) {
        return jdbc.sql(
                        "SELECT count(*) FROM card_image WHERE game_id = :gameId AND provider ="
                                + " :provider")
                .param("gameId", gameId)
                .param("provider", provider)
                .query(Long.class)
                .single();
    }

    /**
     * Primary artworks shown for the given printings and cards (printing image, else the card's
     * primary image), restricted to provider artworks of a game.
     */
    public List<UUID> displayedImageIds(
            UUID gameId, Collection<UUID> printingIds, Collection<UUID> cardIds) {
        List<UUID> result = new ArrayList<>();
        for (List<UUID> chunk : chunks(printingIds)) {
            result.addAll(
                    jdbc.sql(
                                    """
                                    SELECT DISTINCT coalesce(p.image_id, c.image_id)
                                      FROM card_printing p JOIN card c ON c.id = p.card_id
                                     WHERE p.id IN (:ids) AND c.game_id = :gameId
                                       AND coalesce(p.image_id, c.image_id) IS NOT NULL
                                    """)
                            .param("ids", chunk)
                            .param("gameId", gameId)
                            .query(UUID.class)
                            .list());
        }
        for (List<UUID> chunk : chunks(cardIds)) {
            result.addAll(
                    jdbc.sql(
                                    "SELECT image_id FROM card WHERE id IN (:ids) AND game_id ="
                                            + " :gameId AND image_id IS NOT NULL")
                            .param("ids", chunk)
                            .param("gameId", gameId)
                            .query(UUID.class)
                            .list());
        }
        return result;
    }

    /**
     * Image rows by status (provider artworks only), overall and per game. {@code bytes} counts
     * each cached file once: artworks deduplicated onto one file share its size (the per-game
     * figures then add up to the usage instead of exceeding it).
     */
    public List<StatusCount> statusCounts() {
        return jdbc.sql(
                        """
                        WITH artworks AS (
                            SELECT g.slug AS game, i.provider, i.cache_status, i.file_size_bytes,
                                   row_number() OVER (PARTITION BY i.cache_status, i.storage_key
                                                      ORDER BY i.id) AS key_rank
                              FROM card_image i JOIN game g ON g.id = i.game_id
                             WHERE i.provider_image_id IS NOT NULL
                        )
                        SELECT game, provider, cache_status, count(*) AS images,
                               coalesce(sum(file_size_bytes) FILTER (WHERE key_rank = 1), 0)
                                   AS bytes
                          FROM artworks
                         GROUP BY game, provider, cache_status
                         ORDER BY game, provider, cache_status
                        """)
                .query(
                        (rs, rowNum) ->
                                new StatusCount(
                                        rs.getString("game"),
                                        rs.getString("provider"),
                                        rs.getString("cache_status"),
                                        rs.getLong("images"),
                                        rs.getLong("bytes")))
                .list();
    }

    public Optional<UUID> gameId(String slug) {
        return jdbc.sql("SELECT id FROM game WHERE slug = :slug")
                .param("slug", slug)
                .query(UUID.class)
                .optional();
    }

    // -------------------------------------------------------------------------------------
    // Mapping
    // -------------------------------------------------------------------------------------

    private static Usage mapUsage(ResultSet rs, int rowNum) throws SQLException {
        Timestamp reconciled = rs.getTimestamp("reconciled_at");
        return new Usage(
                rs.getLong("used_bytes"),
                rs.getInt("file_count"),
                reconciled == null ? null : reconciled.toInstant());
    }

    private static ImageRow mapImage(ResultSet rs, int rowNum) throws SQLException {
        long size = rs.getLong("file_size_bytes");
        boolean sizeNull = rs.wasNull();
        int width = rs.getInt("width");
        boolean widthNull = rs.wasNull();
        int height = rs.getInt("height");
        boolean heightNull = rs.wasNull();
        Timestamp lastAttempt = rs.getTimestamp("last_attempt_at");
        return new ImageRow(
                rs.getObject("id", UUID.class),
                rs.getObject("game_id", UUID.class),
                rs.getString("game"),
                rs.getObject("card_id", UUID.class),
                rs.getString("card_slug"),
                rs.getString("card_name"),
                rs.getString("provider"),
                rs.getString("provider_image_id"),
                rs.getString("source_url"),
                rs.getString("cache_status"),
                rs.getString("storage_key"),
                rs.getString("content_type"),
                sizeNull ? null : size,
                rs.getString("checksum_sha256"),
                widthNull ? null : width,
                heightNull ? null : height,
                rs.getInt("attempt_count"),
                lastAttempt == null ? null : lastAttempt.toInstant(),
                rs.getString("url"));
    }

    private static List<List<UUID>> chunks(Collection<UUID> ids) {
        List<List<UUID>> chunks = new ArrayList<>();
        List<UUID> current = new ArrayList<>();
        for (UUID id : ids) {
            current.add(id);
            if (current.size() == 1000) {
                chunks.add(current);
                current = new ArrayList<>();
            }
        }
        if (!current.isEmpty()) {
            chunks.add(current);
        }
        return chunks;
    }

    /** Status of the whole cache by status, keyed {@code status → count}. */
    public static Map<String, Long> byStatus(List<StatusCount> counts) {
        Map<String, Long> totals = new LinkedHashMap<>();
        for (String status : List.of("NOT_CACHED", "CACHED", "FAILED", "MISSING_AT_SOURCE")) {
            totals.put(status, 0L);
        }
        counts.forEach(count -> totals.merge(count.status(), count.images(), Long::sum));
        return totals;
    }

    /**
     * The accounting row.
     *
     * @param usedBytes bytes of the final files
     * @param fileCount number of final files
     * @param reconciledAt last reconciliation
     */
    public record Usage(long usedBytes, int fileCount, @Nullable Instant reconciledAt) {}

    /** A card image row with its cache columns. */
    public record ImageRow(
            UUID id,
            UUID gameId,
            String game,
            UUID cardId,
            String cardSlug,
            String cardName,
            @Nullable String provider,
            @Nullable String providerImageId,
            @Nullable String sourceUrl,
            @Nullable String cacheStatus,
            @Nullable String storageKey,
            @Nullable String contentType,
            @Nullable Long fileSizeBytes,
            @Nullable String checksum,
            @Nullable Integer width,
            @Nullable Integer height,
            int attemptCount,
            @Nullable Instant lastAttemptAt,
            @Nullable String url) {}

    /** A fill candidate. */
    public record Candidate(UUID id, @Nullable String cacheStatus, @Nullable String storageKey) {}

    /** Image count by game, provider and status. */
    public record StatusCount(
            String game, String provider, String status, long images, long bytes) {}
}
