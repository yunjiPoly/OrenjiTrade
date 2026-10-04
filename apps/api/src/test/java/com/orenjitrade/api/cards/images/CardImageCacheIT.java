package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCache.Outcome;
import com.orenjitrade.api.cards.domain.images.CardImageCacheProperties;
import com.orenjitrade.api.cards.domain.images.CardImageCacheStatus;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The game-agnostic card image cache (ADR 0015) against the offline stub: one re-encoded rendition
 * per artwork, deduplication by checksum, cleanup after partial and invalid downloads, reservation
 * expiry, reconciliation and capacity release on eviction and clears. Runs with the default
 * configuration, i.e. the 5 GB limit (5120 MiB), whose byte figures exceed the int range.
 */
class CardImageCacheIT extends AbstractCardImageIT {

    @BeforeEach
    void catalog() {
        importCatalog(ImageMode.NONE, null);
    }

    private Path fileOf(String providerImageId) {
        return cache.directory().resolve((String) imageRow(providerImageId).get("storage_key"));
    }

    @Test
    void anArtworkIsStoredOnceAsAResizedJpegWithoutMetadata() throws Exception {
        CardImageCache.Result result = cache.ensureCached(imageId("900000002"));
        assertThat(result.outcome()).isEqualTo(Outcome.DOWNLOADED);
        assertThat(result.bytesDownloaded()).isEqualTo(STUB.imageBytes("900000002").length);
        Map<String, Object> row = imageRow("900000002");
        assertThat(row.get("cache_status")).isEqualTo("CACHED");
        assertThat(row.get("content_type")).isEqualTo("image/jpeg");
        assertThat(row.get("width")).isEqualTo(320);
        assertThat(row.get("height")).isEqualTo(467);
        assertThat((String) row.get("storage_key"))
                .matches("^" + GAME + "/ygoprodeck/[0-9a-f]{2}/900000002\\.jpg$");
        assertThat((String) row.get("checksum_sha256")).matches("^[0-9a-f]{64}$");
        assertThat(row.get("downloaded_at")).isNotNull();
        byte[] stored = Files.readAllBytes(fileOf("900000002"));
        assertThat(((Number) row.get("file_size_bytes")).longValue()).isEqualTo(stored.length);
        assertThat(usedBytes()).isEqualTo(stored.length);
        assertThat(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1))
                .doesNotContain("Exif");
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(stored));
        assertThat(decoded.getWidth()).isEqualTo(320);
        assertThat(tempFiles()).isEmpty();
        assertThat(reservedBytes()).isZero();

        // Already cached: no second request, no second file.
        int hits = STUB.hits("/images/cards/900000002.jpg");
        assertThat(cache.ensureCached(imageId("900000002")).outcome())
                .isEqualTo(Outcome.ALREADY_CACHED);
        assertThat(STUB.hits("/images/cards/900000002.jpg")).isEqualTo(hits);
    }

    @Test
    void theDefaultFiveGigabyteLimitIsAccountedIn64Bits() throws Exception {
        long mib = 1024L * 1024L;
        long limit = 5120L * mib;
        assertThat(cacheProperties.maxMb())
                .as("application.yml default")
                .isEqualTo(CardImageCacheProperties.MAX_ALLOWED_MB)
                .isEqualTo(5120);
        assertThat(cache.limitBytes()).isEqualTo(limit).isGreaterThan(Integer.MAX_VALUE);

        // Usage and reservations beyond the int range without writing gigabytes: 2.5 GiB of
        // (pretended) files and a phantom download holding all but 8 KiB of the rest (bigint).
        long used = 2560L * mib;
        long reserved = limit - used - 8 * 1024;
        assertThat(reserved).isGreaterThan(Integer.MAX_VALUE);
        UUID phantom = UUID.randomUUID();
        try {
            testUsers.update("UPDATE card_image_cache_usage SET used_bytes = ? WHERE id = 1", used);
            testUsers.update(
                    "INSERT INTO card_image_cache_reservation (id, bytes, owner, created_at,"
                            + " expires_at) VALUES (?, ?, 'phantom-instance', now(), now() +"
                            + " interval '5 minutes')",
                    phantom,
                    reserved);

            CardImageCacheStatus status = cache.status();
            assertThat(status.usedBytes()).isEqualTo(used);
            assertThat(status.reservedBytes()).isEqualTo(reserved);
            assertThat(status.remainingBytes()).isEqualTo(8 * 1024);
            assertThat(status.limitBytes()).isEqualTo(limit);
            assertThat(status.limitMb()).isEqualTo(5120);
            assertThat(status.usedMb()).isEqualTo(2560.0);
            assertThat(cache.remainingBytes()).isEqualTo(8 * 1024);

            // The admin console receives the same exact 64-bit figures.
            String admin = uniqueUid("img-admin");
            provisionWithRoles(admin, Role.ADMIN);
            JsonNode json =
                    callJson(HttpMethod.GET, "/api/v1/admin/card-images/status", admin, null, 200);
            assertThat(json.path("limitBytes").asLong()).isEqualTo(5_368_709_120L);
            assertThat(json.path("limitMb").asInt()).isEqualTo(5120);
            assertThat(json.path("usedBytes").asLong()).isEqualTo(used);
            assertThat(json.path("reservedBytes").asLong()).isEqualTo(reserved);
            assertThat(json.path("remainingBytes").asLong()).isEqualTo(8 * 1024);

            // 8 KiB left: no download starts.
            int hits = STUB.hits("/images/cards/900000002.jpg");
            assertThat(cache.ensureCached(imageId("900000002")).outcome())
                    .isEqualTo(Outcome.CACHE_FULL);
            assertThat(STUB.hits("/images/cards/900000002.jpg")).isEqualTo(hits);

            // Without the phantom, 2.5 GiB remain: the reservation and commit compare and add
            // 64-bit figures (an int-sized limit would wrap to 1 GiB and refuse it).
            testUsers.update("DELETE FROM card_image_cache_reservation WHERE id = ?", phantom);
            assertThat(cache.ensureCached(imageId("900000002")).outcome())
                    .isEqualTo(Outcome.DOWNLOADED);
            long file = Files.size(fileOf("900000002"));
            assertThat(usedBytes()).isEqualTo(used + file);
            assertThat(cache.status().remainingBytes()).isEqualTo(limit - used - file);
        } finally {
            testUsers.update("DELETE FROM card_image_cache_reservation WHERE id = ?", phantom);
            cache.reconcile();
        }
        assertThat(usedBytes()).as("recomputed from the disk").isEqualTo(bytesOnDisk());
    }

    @Test
    void identicalRenditionsShareOneFile() {
        STUB.sameAs("900000011", "900000001");
        assertThat(cache.ensureCached(imageId("900000001")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        long afterFirst = usedBytes();
        assertThat(cache.ensureCached(imageId("900000011")).outcome())
                .isEqualTo(Outcome.DEDUPLICATED);
        Map<String, Object> primary = imageRow("900000001");
        Map<String, Object> alternate = imageRow("900000011");
        assertThat(alternate.get("cache_status")).isEqualTo("CACHED");
        assertThat(alternate.get("checksum_sha256")).isEqualTo(primary.get("checksum_sha256"));
        assertThat(alternate.get("storage_key")).isEqualTo(primary.get("storage_key"));
        assertThat(usedBytes()).as("no second file").isEqualTo(afterFirst);
        assertThat(cacheFiles()).hasSize(1);
        CardImageCacheStatus status = cache.status();
        assertThat(status.files()).isEqualTo(1);
        assertThat(status.games())
                .filteredOn(game -> GAME.equals(game.game()))
                .singleElement()
                .satisfies(
                        game -> {
                            assertThat(game.images().get("CACHED")).isEqualTo(2L);
                            assertThat(game.cachedBytes())
                                    .as("the shared file counts once")
                                    .isEqualTo(afterFirst);
                        });

        // Evicting one keeps the shared file for the other.
        assertThat(cache.evict(imageId("900000001"))).isTrue();
        assertThat(cacheFiles()).hasSize(1);
        assertThat(usedBytes()).isEqualTo(afterFirst);
        assertThat(cache.evict(imageId("900000011"))).isTrue();
        assertThat(cacheFiles()).isEmpty();
        assertThat(usedBytes()).isZero();
    }

    @Test
    void aConnectionDroppedMidStreamLeavesNothingBehind() {
        STUB.behave("900000003", YgoProDeckStub.Behaviour.TRUNCATED);
        int hits = STUB.hits("/images/cards/900000003.jpg");
        CardImageCache.Result result = cache.ensureCached(imageId("900000003"));
        assertThat(result.outcome()).isEqualTo(Outcome.FAILED);
        assertThat(result.error()).containsAnyOf("dropped", "truncated", "connection");
        assertThat(STUB.hits("/images/cards/900000003.jpg") - hits)
                .as("retried with a fresh request")
                .isEqualTo(cacheProperties.maxAttempts());
        Map<String, Object> row = imageRow("900000003");
        assertThat(row.get("cache_status")).isEqualTo("FAILED");
        assertThat(row.get("last_error")).isNotNull();
        assertThat(((Number) row.get("attempt_count")).intValue()).isEqualTo(1);
        assertThat(tempFiles()).isEmpty();
        assertThat(cacheFiles()).isEmpty();
        assertThat(reservedBytes()).isZero();
        assertThat(usedBytes()).isZero();
    }

    @Test
    void invalidContentIsRefusedAndCleanedUp() {
        STUB.behave("900000004", YgoProDeckStub.Behaviour.HTML);
        STUB.behave("900000005", YgoProDeckStub.Behaviour.EMPTY);
        STUB.behave("900000006", YgoProDeckStub.Behaviour.NOT_FOUND);
        assertThat(cache.ensureCached(imageId("900000004")).error()).contains("text/html");
        CardImageCache.Result empty = cache.ensureCached(imageId("900000005"));
        assertThat(empty.outcome()).isEqualTo(Outcome.FAILED);
        assertThat(empty.error()).contains("empty");
        assertThat(cache.ensureCached(imageId("900000006")).outcome())
                .isEqualTo(Outcome.MISSING_AT_SOURCE);
        assertThat(imageRow("900000004").get("cache_status")).isEqualTo("FAILED");
        assertThat(imageRow("900000005").get("cache_status")).isEqualTo("FAILED");
        assertThat(imageRow("900000006").get("cache_status")).isEqualTo("MISSING_AT_SOURCE");
        assertThat(cacheFiles()).isEmpty();
        assertThat(reservedBytes()).isZero();
        assertThat(usedBytes()).isZero();
    }

    @Test
    void expiredReservationsAreReclaimedSoACrashCannotLeakCapacity() throws Exception {
        // A crashed download holding the whole capacity: nothing else fits while it is alive.
        UUID crashed = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO card_image_cache_reservation (id, bytes, owner, created_at,"
                        + " expires_at) VALUES (?, ?, 'crashed-instance', now() - interval '20"
                        + " minutes', now() + interval '5 minutes')",
                crashed,
                cache.limitBytes());
        Path orphan = cache.directory().resolve(".tmp").resolve(crashed + ".part");
        Files.write(orphan, new byte[4096]);
        assertThat(cache.ensureCached(imageId("900000002")).outcome())
                .isEqualTo(Outcome.CACHE_FULL);
        assertThat(imageRow("900000002").get("cache_status")).isEqualTo("NOT_CACHED");

        // Once it expires, the next reservation reclaims it (and its temporary file).
        testUsers.update(
                "UPDATE card_image_cache_reservation SET expires_at = now() - interval '1 minute'"
                        + " WHERE id = ?",
                crashed);
        assertThat(cache.ensureCached(imageId("900000002")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        assertThat(count("SELECT count(*) FROM card_image_cache_reservation")).isZero();
        assertThat(Files.exists(orphan)).isFalse();
    }

    @Test
    void aDownloadWhoseReservationExpiredKeepsCountingItsTemporaryFile() throws Exception {
        // A download stalls mid-body and its reservation expires meanwhile: the partial file is
        // still on disk, so it must keep counting against the limit, and the late download may
        // not commit.
        STUB.behave("900000002", YgoProDeckStub.Behaviour.STALL);
        CompletableFuture<CardImageCache.Result> request = cache.request(imageId("900000002"));
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        long partial = 0;
        while (partial == 0 && System.nanoTime() < deadline) {
            partial = tempFiles().stream().mapToLong(CardImageCacheIT::sizeOrZero).sum();
            if (partial == 0) {
                Thread.sleep(20);
            }
        }
        assertThat(partial).as("the partial download is on disk").isPositive();
        assertThat(cache.status().remainingBytes())
                .as("covered by the live reservation")
                .isLessThanOrEqualTo(cache.limitBytes() - partial);

        testUsers.update(
                "UPDATE card_image_cache_reservation SET created_at = now() - interval '20"
                        + " minutes', expires_at = now() - interval '1 minute'");
        assertThat(reservedBytes()).isZero();
        assertThat(cache.remainingBytes())
                .as("an expired reservation no longer covers it: the file itself counts")
                .isLessThanOrEqualTo(cache.limitBytes() - usedBytes() - partial);
        assertThat(cache.status().remainingBytes())
                .isLessThanOrEqualTo(cache.limitBytes() - usedBytes() - partial);

        STUB.releaseStalled();
        CardImageCache.Result result = request.get(30, TimeUnit.SECONDS);
        assertThat(result.cached()).as("an expired reservation cannot commit").isFalse();
        assertThat(imageRow("900000002").get("cache_status")).isNotEqualTo("CACHED");
        assertThat(tempFiles()).isEmpty();
        assertThat(count("SELECT count(*) FROM card_image_cache_reservation")).isZero();
        assertThat(usedBytes()).isZero().isEqualTo(bytesOnDisk());
    }

    private static long sizeOrZero(Path path) {
        try {
            return Files.size(path);
        } catch (java.io.IOException e) {
            return 0;
        }
    }

    @Test
    void reconciliationRepairsFilesRowsAndAccounting() throws Exception {
        cache.ensureCached(imageId("900000002"));
        cache.ensureCached(imageId("900000003"));
        long kept = Files.size(fileOf("900000003"));
        Files.delete(fileOf("900000002"));
        Path orphanTemp = cache.directory().resolve(".tmp").resolve(UUID.randomUUID() + ".part");
        Files.write(orphanTemp, new byte[1000]);
        Path stray = cache.directory().resolve(GAME + "/ygoprodeck/ab/123456.jpg");
        Files.createDirectories(stray.getParent());
        Files.write(stray, new byte[2000]);
        testUsers.update("UPDATE card_image_cache_usage SET used_bytes = 999999 WHERE id = 1");

        CardImageCache.ReconcileResult result = cache.reconcile();
        assertThat(result.missingFiles()).isEqualTo(1);
        assertThat(result.orphanTempFiles()).isEqualTo(1);
        assertThat(result.orphanFiles()).isEqualTo(1);
        assertThat(result.usedBytes()).isEqualTo(kept);
        assertThat(imageRow("900000002").get("cache_status")).isEqualTo("NOT_CACHED");
        assertThat(imageRow("900000003").get("cache_status")).isEqualTo("CACHED");
        assertThat(Files.exists(orphanTemp)).isFalse();
        assertThat(Files.exists(stray)).isFalse();
        assertThat(usedBytes()).isEqualTo(kept).isEqualTo(bytesOnDisk());
    }

    @Test
    void reconciliationKeepsCountingFilesItCannotDelete() throws Exception {
        cache.ensureCached(imageId("900000002"));
        Path stray = cache.directory().resolve(GAME + "/ygoprodeck/cd/654321.jpg");
        Files.createDirectories(stray.getParent());
        Files.write(stray, new byte[3000]);
        // java.io.RandomAccessFile opens without FILE_SHARE_DELETE on Windows, so the deletion
        // fails while it is open there (elsewhere it succeeds): either way the accounting must
        // never fall below the bytes actually on disk.
        try (RandomAccessFile open = new RandomAccessFile(stray.toFile(), "r")) {
            CardImageCache.ReconcileResult result = cache.reconcile();
            assertThat(result.usedBytes()).isEqualTo(bytesOnDisk());
            assertThat(usedBytes()).isEqualTo(bytesOnDisk());
            assertThat(cache.status().remainingBytes())
                    .isEqualTo(cache.limitBytes() - bytesOnDisk());
        }
        CardImageCache.ReconcileResult after = cache.reconcile();
        assertThat(Files.exists(stray)).isFalse();
        assertThat(after.usedBytes()).isEqualTo(Files.size(fileOf("900000002")));
        assertThat(usedBytes()).isEqualTo(bytesOnDisk());
    }

    @Test
    void evictionAndClearsReleaseCapacityButKeepTheCatalog() throws Exception {
        cache.ensureCached(imageId("900000002"));
        cache.ensureCached(imageId("900000003"));
        cache.ensureCached(imageId("900000004"));
        long before = usedBytes();
        long one = Files.size(fileOf("900000002"));
        assertThat(cache.evict(imageId("900000002"))).isTrue();
        assertThat(cache.evict(imageId("900000002"))).as("not cached any more").isFalse();
        assertThat(usedBytes()).isEqualTo(before - one);
        assertThat(cache.status().remainingBytes()).isEqualTo(cache.limitBytes() - (before - one));

        CardImageCache.ClearResult cleared = cache.clear(GAME);
        assertThat(cleared.images()).isEqualTo(2);
        assertThat(cleared.bytesReleased()).isEqualTo(before - one);
        assertThat(usedBytes()).isZero();
        assertThat(cacheFiles()).isEmpty();
        assertThat(
                        count(
                                "SELECT count(*) FROM card_image WHERE provider = 'ygoprodeck' AND"
                                        + " cache_status = 'CACHED'"))
                .isZero();
        assertThat(
                        count(
                                "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id WHERE"
                                        + " g.slug = ?",
                                GAME))
                .isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        assertThat(imageRow("900000002").get("source_url")).isNotNull();
    }
}
