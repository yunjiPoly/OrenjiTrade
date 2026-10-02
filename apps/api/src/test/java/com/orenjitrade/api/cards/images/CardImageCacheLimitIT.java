package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.CatalogImportReport;
import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The hard capacity limit (ADR 0015) with a tiny 1 MB cache and noisy filler images of a few
 * hundred KB: under many parallel downloads the bytes on disk (final + temporary files) plus the
 * outstanding reservations never exceed the limit at any sampled moment, nor does the database
 * accounting; a full cache never fails the catalog import (all metadata is imported, the limit is
 * reported) and the image endpoint falls back to the placeholder.
 */
@TestPropertySource(
        properties = {
            "orenji.card-images.cache.max-mb=1",
            "orenji.card-images.cache.max-parallel-downloads=8"
        })
class CardImageCacheLimitIT extends AbstractCardImageIT {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;

    @BeforeEach
    void catalog() {
        importCatalog(ImageMode.NONE, null);
    }

    private List<UUID> fillerImages() {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < YgoProDeckStub.FILLER_CARDS; i++) {
            ids.add(imageId(String.valueOf(YgoProDeckStub.FIRST_FILLER_ID + i)));
        }
        return ids;
    }

    /**
     * One consistent sample, taken while holding the accounting lock (no reservation or commit can
     * change meanwhile): final files are counted first, then temporary files; a temporary file is
     * covered by its live reservation (and must never exceed it), anything else counts in full.
     *
     * @return {@code [storage measure, db used + reserved]}
     */
    private long[] sample() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        long[] result =
                tx.execute(
                        status -> {
                            long used =
                                    jdbc.queryForObject(
                                            "SELECT used_bytes FROM card_image_cache_usage WHERE id"
                                                    + " = 1 FOR UPDATE",
                                            Long.class);
                            Map<UUID, Long> live = new HashMap<>();
                            jdbc.query(
                                    "SELECT id, bytes FROM card_image_cache_reservation WHERE"
                                            + " expires_at > now()",
                                    rs -> {
                                        live.put(
                                                rs.getObject("id", UUID.class),
                                                rs.getLong("bytes"));
                                    });
                            long reserved = live.values().stream().mapToLong(Long::longValue).sum();
                            long[] files = walk(cache.directory());
                            long finalBytes = files[0];
                            Map<UUID, Long> temps = temps(cache.directory().resolve(".tmp"));
                            long uncovered = 0;
                            for (Map.Entry<UUID, Long> temp : temps.entrySet()) {
                                Long reservation = live.get(temp.getKey());
                                if (reservation == null) {
                                    uncovered += temp.getValue();
                                } else {
                                    assertThat(temp.getValue())
                                            .as("a temporary file never exceeds its reservation")
                                            .isLessThanOrEqualTo(reservation);
                                }
                            }
                            return new long[] {finalBytes + uncovered + reserved, used + reserved};
                        });
        return result;
    }

    private static long[] walk(Path root) {
        long[] total = {0};
        try {
            Files.walkFileTree(
                    root,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult preVisitDirectory(
                                Path dir, BasicFileAttributes attrs) {
                            return dir.getFileName() != null
                                            && dir.getFileName().toString().equals(".tmp")
                                    ? FileVisitResult.SKIP_SUBTREE
                                    : FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                            total[0] += attrs.size();
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult visitFileFailed(Path file, IOException exc) {
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return total;
    }

    /** Temporary files grouped by reservation id (bytes per reservation). */
    private static Map<UUID, Long> temps(Path dir) {
        Map<UUID, Long> temps = new HashMap<>();
        if (!Files.isDirectory(dir)) {
            return temps;
        }
        try (var files = Files.list(dir)) {
            files.forEach(
                    file -> {
                        String name = file.getFileName().toString();
                        try {
                            UUID id = UUID.fromString(name.substring(0, 36));
                            temps.merge(id, Files.size(file), Long::sum);
                        } catch (RuntimeException | IOException e) {
                            // vanished meanwhile or foreign: ignored (cannot be ours)
                        }
                    });
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return temps;
    }

    @Test
    void parallelDownloadsNeverExceedTheLimit() throws Exception {
        long limit = cache.limitBytes();
        assertThat(limit).isEqualTo(1024L * 1024L);
        AtomicBoolean running = new AtomicBoolean(true);
        AtomicLong maxMeasure = new AtomicLong();
        AtomicLong maxAccounting = new AtomicLong();
        AtomicInteger samples = new AtomicInteger();
        AtomicReference<Throwable> samplerFailure = new AtomicReference<>();
        Thread sampler =
                new Thread(
                        () -> {
                            try {
                                while (running.get()) {
                                    long[] sample = sample();
                                    maxMeasure.accumulateAndGet(sample[0], Math::max);
                                    maxAccounting.accumulateAndGet(sample[1], Math::max);
                                    samples.incrementAndGet();
                                    assertThat(sample[0])
                                            .as("files on disk + reservations")
                                            .isLessThanOrEqualTo(limit);
                                    assertThat(sample[1])
                                            .as("used + reserved in the database")
                                            .isLessThanOrEqualTo(limit);
                                    Thread.sleep(2);
                                }
                            } catch (Throwable t) {
                                samplerFailure.compareAndSet(null, t);
                            }
                        },
                        "cache-limit-sampler");
        sampler.start();

        List<CompletableFuture<CardImageCache.Result>> requests = new ArrayList<>();
        for (UUID id : fillerImages()) {
            requests.add(cache.request(id));
        }
        CompletableFuture.allOf(requests.toArray(CompletableFuture[]::new))
                .get(120, TimeUnit.SECONDS);
        running.set(false);
        sampler.join(10_000);

        assertThat(samplerFailure.get()).as("sampler").isNull();
        assertThat(samples.get()).as("samples taken during the downloads").isGreaterThan(10);
        Map<CardImageCache.Outcome, Long> outcomes = new HashMap<>();
        for (CompletableFuture<CardImageCache.Result> request : requests) {
            outcomes.merge(request.get().outcome(), 1L, Long::sum);
        }
        System.out.printf(
                "cache limit sampler: %d samples, max storage %d, max accounting %d, limit %d,"
                        + " outcomes %s%n",
                samples.get(), maxMeasure.get(), maxAccounting.get(), limit, outcomes);
        assertThat(outcomes.get(CardImageCache.Outcome.DOWNLOADED)).as("some fit").isPositive();
        assertThat(outcomes.get(CardImageCache.Outcome.CACHE_FULL)).as("most do not").isPositive();
        assertThat(maxMeasure.get()).isLessThanOrEqualTo(limit);
        assertThat(maxAccounting.get()).isLessThanOrEqualTo(limit);

        // At rest: no temporary files, no reservations, accounting = files on disk <= limit.
        assertThat(tempFiles()).isEmpty();
        assertThat(reservedBytes()).isZero();
        assertThat(usedBytes()).isEqualTo(bytesOnDisk()).isLessThanOrEqualTo(limit);
        assertThat(cache.reconcile().usedBytes()).isEqualTo(usedBytes());
    }

    @Test
    void temporaryFilesWithoutAReservationCountAgainstTheLimit() throws Exception {
        // A temporary file no live reservation covers (its deletion failed, or a crashed process
        // left it behind) still occupies the disk: no reservation may ignore it.
        Path leftover = cache.directory().resolve(".tmp").resolve(UUID.randomUUID() + ".part");
        Files.write(leftover, new byte[(int) (cache.limitBytes() - 8 * 1024)]);
        UUID image = fillerImages().get(0);
        int hits = STUB.imageHits();
        assertThat(cache.ensureCached(image).outcome())
                .isEqualTo(CardImageCache.Outcome.CACHE_FULL);
        assertThat(STUB.imageHits()).as("no download without capacity").isEqualTo(hits);
        assertThat(cache.status().remainingBytes()).isLessThanOrEqualTo(8 * 1024);
        assertThat(cache.remainingBytes()).isLessThanOrEqualTo(8 * 1024);

        // Once the file is gone, the capacity is available again.
        Files.delete(leftover);
        assertThat(cache.ensureCached(image).outcome())
                .isEqualTo(CardImageCache.Outcome.DOWNLOADED);
        assertThat(usedBytes()).isEqualTo(bytesOnDisk()).isLessThanOrEqualTo(cache.limitBytes());
    }

    @Test
    void aFullCacheNeverFailsTheImportAndIsReported() {
        SyncRunView run = importCatalog(ImageMode.ALL, null);
        assertThat(run.status()).as(String.valueOf(run.error())).isEqualTo(SyncRunStatus.SUCCEEDED);
        CatalogImportReport report = run.report();
        assertThat(report.totalCardsProcessed()).isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        assertThat(report.cacheLimitReached()).isTrue();
        assertThat(report.imagesSkippedCacheFull()).isPositive();
        assertThat(report.imagesDownloaded()).isPositive();
        assertThat(report.cacheLimitMb()).isEqualTo(1);
        assertThat(report.cacheUsedMb()).isLessThanOrEqualTo(1.0);
        assertThat(
                        count(
                                "SELECT count(*) FROM card c JOIN game g ON g.id = c.game_id WHERE"
                                        + " g.slug = ?",
                                GAME))
                .as("all metadata imported")
                .isEqualTo(YgoProDeckStub.TOTAL_CARDS);
        assertThat(
                        count(
                                "SELECT count(*) FROM card_image WHERE provider = 'ygoprodeck' AND"
                                        + " source_url IS NOT NULL AND game_id = ?",
                                gameId()))
                .as("source references stored even when not cached")
                .isEqualTo(YgoProDeckStub.TOTAL_IMAGES);
        assertThat(usedBytes()).isLessThanOrEqualTo(cache.limitBytes());
        assertThat(cache.status().remainingBytes()).isEqualTo(cache.limitBytes() - usedBytes());
    }

    @Test
    void theImageEndpointServesThePlaceholderWhenTheCacheIsFull() {
        List<UUID> fillers = fillerImages();
        for (UUID id : fillers) {
            if (cache.ensureCached(id).outcome() == CardImageCache.Outcome.CACHE_FULL) {
                break;
            }
        }
        UUID notCached =
                fillers.stream()
                        .filter(
                                id ->
                                        !"CACHED"
                                                .equals(
                                                        testUsers
                                                                .query(
                                                                        "SELECT cache_status FROM"
                                                                            + " card_image WHERE id"
                                                                            + " = ?",
                                                                        id)
                                                                .get(0)
                                                                .get("cache_status")))
                        .findFirst()
                        .orElseThrow();
        int hits = STUB.imageHits();
        EntityExchangeResult<byte[]> result =
                http.get()
                        .uri("/api/v1/public/card-images/" + notCached)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        assertThat(result.getResponseHeaders().getContentType().toString())
                .startsWith("image/svg+xml");
        assertThat(result.getResponseHeaders().getCacheControl()).contains("max-age=300");
        assertThat(result.getResponseHeaders().getFirst(HttpHeaders.LOCATION)).isNull();
        assertNoProviderUrl(
                new String(result.getResponseBody(), java.nio.charset.StandardCharsets.UTF_8));
        assertThat(STUB.imageHits()).as("no download without capacity").isEqualTo(hits);
        cache.awaitIdle(Duration.ofSeconds(10));
    }
}
