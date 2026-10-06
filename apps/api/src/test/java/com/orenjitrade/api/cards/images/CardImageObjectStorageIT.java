package com.orenjitrade.api.cards.images;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCache.Outcome;
import com.orenjitrade.api.cards.domain.images.CardImageCacheStatus;
import com.orenjitrade.api.cards.domain.images.CardImageOnDemandProperties;
import com.orenjitrade.api.cards.domain.images.CardImageReferenceSource;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.infra.images.CardImageCacheRepository;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.common.storage.ObjectSummary;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * The card image cache on object storage (ADR 0015, cloud profile of ADR 0016): the renditions live
 * under {@code card-images/} of the media bucket (an in-memory Google Cloud Storage here), only
 * temporary downloads touch the local disk, and the cache survives the loss of that disk: a fresh
 * instance reconciles against the bucket without deleting a single valid object. The cap still
 * counts stored objects, temporary files and reservations; deduplication, eviction and the repair
 * of a vanished object work on objects as they did on files. Provider URLs stay server-side.
 */
@TestPropertySource(
        properties = {
            "orenji.card-images.cache.provider=gcs",
            "orenji.card-images.cache.gcs-bucket=orenjitrade-test-media",
            "orenji.card-images.cache.object-prefix=card-images/",
            "orenji.card-images.cache.max-mb=1"
        })
@Import(FakeGcsConfiguration.class)
class CardImageObjectStorageIT extends AbstractCardImageIT {

    @Autowired
    @Qualifier(CardImageCache.STORAGE_BEAN)
    private ObjectStorage objects;

    @Autowired private CardImageCacheRepository repository;
    @Autowired private CardImageOnDemandProperties onDemand;
    @Autowired private List<CardProvider> providers;
    @Autowired private List<CardImageReferenceSource> referenceSources;
    @Autowired private TimeProvider timeProvider;
    @Autowired private PlatformTransactionManager transactionManager;

    @BeforeEach
    void catalog() {
        importCatalog(ImageMode.NONE, null);
    }

    private List<ObjectSummary> storedObjects() {
        return objects.list("");
    }

    private long storedBytes() {
        return storedObjects().stream().mapToLong(ObjectSummary::size).sum();
    }

    private String keyOf(String providerImageId) {
        return (String) imageRow(providerImageId).get("storage_key");
    }

    /** Empties the local cache directory: a new Cloud Run instance starts with a blank disk. */
    private void wipeLocalDisk() throws IOException {
        try (Stream<Path> walk = Files.walk(cache.directory())) {
            walk.sorted(Comparator.reverseOrder())
                    .filter(path -> !path.equals(cache.directory()))
                    .forEach(
                            path -> {
                                try {
                                    Files.delete(path);
                                } catch (IOException e) {
                                    throw new java.io.UncheckedIOException(e);
                                }
                            });
        }
    }

    private CardImageCache freshInstance() {
        return new CardImageCache(
                cacheProperties,
                onDemand,
                repository,
                providers,
                referenceSources,
                timeProvider,
                transactionManager,
                objects);
    }

    private EntityExchangeResult<byte[]> get(UUID id) {
        return http.get()
                .uri("/api/v1/public/card-images/" + id)
                .exchange()
                .expectBody()
                .returnResult();
    }

    @Test
    void renditionsAreObjectsUnderThePrefixAndNoFinalFileTouchesTheLocalDisk() throws Exception {
        assertThat(cache.ensureCached(imageId("900000002")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        Map<String, Object> row = imageRow("900000002");
        String key = (String) row.get("storage_key");
        assertThat(key).matches("^" + GAME + "/ygoprodeck/[0-9a-f]{2}/900000002\\.jpg$");
        assertThat(storedObjects()).extracting(ObjectSummary::key).containsExactly(key);
        assertThat(objects.size(key)).contains(((Number) row.get("file_size_bytes")).longValue());
        assertThat(usedBytes()).isEqualTo(storedBytes());
        assertThat(cacheFiles()).as("only .tmp/ exists locally and it is empty").isEmpty();
        assertThat(tempFiles()).isEmpty();
        assertThat(reservedBytes()).isZero();

        EntityExchangeResult<byte[]> result = get(imageId("900000002"));
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString()).isEqualTo("image/jpeg");
        assertThat(result.getResponseHeaders().getCacheControl())
                .contains("max-age=31536000", "public", "immutable");
        assertThat(result.getResponseHeaders().getETag())
                .isEqualTo("\"" + row.get("checksum_sha256") + "\"");
        assertThat(result.getResponseBody()).isEqualTo(objects.get(key).orElseThrow().content());
        assertThat(result.getResponseHeaders().getFirst(HttpHeaders.LOCATION)).isNull();
        assertThat(imageRow("900000002").get("source_url")).isNotNull();
    }

    @Test
    void aFreshInstanceAfterALostDiskKeepsEveryObjectAndServesIt() throws Exception {
        assertThat(cache.ensureCached(imageId("900000002")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        assertThat(cache.ensureCached(imageId("900000003")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        long stored = storedBytes();
        List<String> keys = storedObjects().stream().map(ObjectSummary::key).sorted().toList();
        assertThat(keys).hasSize(2);
        // A leftover temporary file of the dead instance would be gone with its disk too.
        Files.write(
                cache.directory().resolve(".tmp").resolve(UUID.randomUUID() + ".part"),
                new byte[500]);
        testUsers.update(
                "UPDATE card_image_cache_usage SET used_bytes = 42, file_count = 9 WHERE id = 1");

        wipeLocalDisk();
        CardImageCache restarted = freshInstance();
        try {
            // What Cloud Run runs at ApplicationReadyEvent of the new instance.
            CardImageCache.ReconcileResult result = restarted.reconcile();
            assertThat(result.missingFiles()).as("every object is still there").isZero();
            assertThat(result.orphanFiles()).as("no valid object is ever deleted").isZero();
            assertThat(result.orphanTempFiles()).isZero();
            assertThat(result.evicted()).isZero();
            assertThat(result.usedBytes()).isEqualTo(stored);
            assertThat(result.files()).isEqualTo(2);
            assertThat(usedBytes()).as("recomputed from the bucket").isEqualTo(storedBytes());
            assertThat(storedObjects().stream().map(ObjectSummary::key).sorted().toList())
                    .isEqualTo(keys);
            assertThat(imageRow("900000002").get("cache_status")).isEqualTo("CACHED");
            assertThat(imageRow("900000003").get("cache_status")).isEqualTo("CACHED");

            // The new instance serves from the bucket without downloading anything again.
            int hits = STUB.imageHits();
            CardImageCache.Serving serving = restarted.serving(imageId("900000002")).orElseThrow();
            assertThat(serving).isInstanceOf(CardImageCache.ServeFile.class);
            CardImageCache.CachedFile file = ((CardImageCache.ServeFile) serving).file();
            assertThat(restarted.read(file))
                    .contains(objects.get(keyOf("900000002")).orElseThrow().content());
            assertThat(restarted.ensureCached(imageId("900000003")).outcome())
                    .isEqualTo(Outcome.ALREADY_CACHED);
            assertThat(STUB.imageHits()).isEqualTo(hits);
            EntityExchangeResult<byte[]> result2 = get(imageId("900000003"));
            assertThat(result2.getStatus().value()).isEqualTo(200);
            assertThat(result2.getResponseHeaders().getContentType().toString())
                    .isEqualTo("image/jpeg");
            assertThat(STUB.imageHits()).isEqualTo(hits);
            assertThat(Files.isDirectory(cache.directory().resolve(".tmp")))
                    .as("the staging directory is recreated")
                    .isTrue();
        } finally {
            restarted.destroy();
        }
    }

    @Test
    void aVanishedObjectIsRepairedAndRefilledOnDemand() {
        UUID id = imageId("900000003");
        assertThat(cache.ensureCached(id).outcome()).isEqualTo(Outcome.DOWNLOADED);
        String key = keyOf("900000003");
        long size = usedBytes();
        assertThat(objects.delete(key))
                .as("evicted by another instance / bucket restored")
                .isTrue();

        int hits = STUB.hits("/images/cards/900000003.jpg");
        EntityExchangeResult<byte[]> result = get(id);
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getContentType().toString())
                .as("the row was repaired and the artwork filled on demand")
                .isEqualTo("image/jpeg");
        assertThat(STUB.hits("/images/cards/900000003.jpg") - hits).isEqualTo(1);
        assertThat(imageRow("900000003").get("cache_status")).isEqualTo("CACHED");
        assertThat(objects.exists(key)).isTrue();
        assertThat(usedBytes()).isEqualTo(size).isEqualTo(storedBytes());

        // Gone again and the provider no longer has it: placeholder, consistent accounting.
        assertThat(objects.delete(key)).isTrue();
        STUB.behave("900000003", YgoProDeckStub.Behaviour.NOT_FOUND);
        EntityExchangeResult<byte[]> placeholder = get(id);
        assertThat(placeholder.getStatus().value()).isEqualTo(200);
        assertThat(placeholder.getResponseHeaders().getContentType().toString())
                .startsWith("image/svg+xml");
        assertNoProviderUrl(
                new String(placeholder.getResponseBody(), java.nio.charset.StandardCharsets.UTF_8));
        cache.awaitIdle(Duration.ofSeconds(10));
        assertThat(imageRow("900000003").get("cache_status")).isEqualTo("MISSING_AT_SOURCE");
        assertThat(usedBytes()).isZero().isEqualTo(storedBytes());
    }

    @Test
    void identicalRenditionsShareOneObjectAndEvictionRemovesIt() {
        STUB.sameAs("900000011", "900000001");
        assertThat(cache.ensureCached(imageId("900000001")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        assertThat(cache.ensureCached(imageId("900000011")).outcome())
                .isEqualTo(Outcome.DEDUPLICATED);
        assertThat(storedObjects()).hasSize(1);
        assertThat(keyOf("900000011")).isEqualTo(keyOf("900000001"));
        long one = usedBytes();
        assertThat(one).isEqualTo(storedBytes());

        assertThat(cache.evict(imageId("900000001"))).isTrue();
        assertThat(storedObjects()).as("still referenced by the other row").hasSize(1);
        assertThat(usedBytes()).isEqualTo(one);
        assertThat(cache.evict(imageId("900000011"))).isTrue();
        assertThat(storedObjects()).isEmpty();
        assertThat(usedBytes()).isZero();

        assertThat(cache.ensureCached(imageId("900000001")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        CardImageCache.ClearResult cleared = cache.clear(GAME);
        assertThat(cleared.images()).isEqualTo(1);
        assertThat(storedObjects()).isEmpty();
        assertThat(usedBytes()).isZero();
    }

    @Test
    void theCapCountsObjectsTemporaryFilesAndReservations() throws Exception {
        long limit = cache.limitBytes();
        assertThat(limit).isEqualTo(1024L * 1024L);
        int cached = 0;
        for (int i = 0; i < YgoProDeckStub.FILLER_CARDS; i++) {
            Outcome outcome =
                    cache.ensureCached(imageId(String.valueOf(YgoProDeckStub.FIRST_FILLER_ID + i)))
                            .outcome();
            if (outcome == Outcome.CACHE_FULL) {
                break;
            }
            assertThat(outcome).isEqualTo(Outcome.DOWNLOADED);
            cached++;
        }
        assertThat(cached).as("some fillers fit in 1 MiB").isPositive();
        assertThat(storedObjects()).hasSize(cached);
        assertThat(usedBytes()).isEqualTo(storedBytes()).isLessThanOrEqualTo(limit);
        CardImageCacheStatus status = cache.status();
        assertThat(status.files()).isEqualTo(cached);
        assertThat(status.remainingBytes()).isEqualTo(limit - storedBytes());

        // A temporary file no reservation covers still occupies the local disk: it counts.
        Path leftover = cache.directory().resolve(".tmp").resolve(UUID.randomUUID() + ".part");
        Files.write(leftover, new byte[8 * 1024]);
        assertThat(cache.status().remainingBytes()).isEqualTo(limit - storedBytes() - 8 * 1024);
        assertThat(cache.remainingBytes()).isEqualTo(limit - storedBytes() - 8 * 1024);
        Files.delete(leftover);

        // A reservation of another instance counts until it expires.
        UUID phantom = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO card_image_cache_reservation (id, bytes, owner, created_at,"
                        + " expires_at) VALUES (?, ?, 'other-instance', now(), now() + interval '5"
                        + " minutes')",
                phantom,
                limit - storedBytes());
        assertThat(cache.status().remainingBytes()).isZero();
        testUsers.update("DELETE FROM card_image_cache_reservation WHERE id = ?", phantom);

        // Reconciliation recomputes the usage from the bucket and changes nothing valid.
        testUsers.update("UPDATE card_image_cache_usage SET used_bytes = 1 WHERE id = 1");
        CardImageCache.ReconcileResult result = cache.reconcile();
        assertThat(result.orphanFiles()).isZero();
        assertThat(result.missingFiles()).isZero();
        assertThat(result.usedBytes()).isEqualTo(storedBytes());
        assertThat(storedObjects()).hasSize(cached);
    }

    @Test
    void reconciliationNeverDeletesAFreshUnreferencedObjectButCountsIt() {
        assertThat(cache.ensureCached(imageId("900000002")).outcome())
                .isEqualTo(Outcome.DOWNLOADED);
        long referenced = storedBytes();
        // Another process (the previous revision during a rollout) has just stored an object the
        // database does not reference yet.
        objects.put(GAME + "/ygoprodeck/ab/777777.jpg", new byte[3000], "image/jpeg");
        CardImageCache.ReconcileResult result = cache.reconcile();
        assertThat(result.orphanFiles()).isZero();
        assertThat(objects.exists(GAME + "/ygoprodeck/ab/777777.jpg")).as("kept").isTrue();
        assertThat(result.usedBytes()).as("counted against the limit").isEqualTo(referenced + 3000);
        assertThat(usedBytes()).isEqualTo(storedBytes());
        assertThat(cache.status().remainingBytes())
                .isEqualTo(cache.limitBytes() - referenced - 3000);
        assertThat(objects.delete(GAME + "/ygoprodeck/ab/777777.jpg")).isTrue();
        assertThat(cache.reconcile().usedBytes()).isEqualTo(referenced);
    }
}
