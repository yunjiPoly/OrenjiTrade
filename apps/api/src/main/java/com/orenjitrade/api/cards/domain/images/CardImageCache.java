package com.orenjitrade.api.cards.domain.images;

import com.orenjitrade.api.cards.domain.ImageMode;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.domain.provider.ImageDownload;
import com.orenjitrade.api.cards.domain.provider.ImageHostingPolicy;
import com.orenjitrade.api.cards.domain.provider.ImageMissingAtSourceException;
import com.orenjitrade.api.cards.domain.provider.ProviderRequestException;
import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import com.orenjitrade.api.cards.infra.images.CardImageCacheRepository;
import com.orenjitrade.api.cards.infra.images.CardImageCacheRepository.ImageRow;
import com.orenjitrade.api.cards.infra.images.CardImageCacheRepository.Usage;
import com.orenjitrade.api.cards.infra.images.CardImageFileStore;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.common.storage.ObjectSummary;
import com.orenjitrade.api.common.storage.StoredObject;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Game-agnostic capped cache of provider card artworks (ADR 0015). Renditions live behind the
 * {@code cardImageStorage} {@link ObjectStorage}: local files under the cache directory (one
 * directory per database, the default) or objects under a bucket prefix in the cloud, where the
 * local disk is wiped on every restart; the PostgreSQL accounting and the local {@code .tmp/}
 * staging of downloads are the same in both cases.
 *
 * <p><b>Capacity.</b> Stored renditions, temporary download files and outstanding reservations
 * together never exceed {@link CardImageCacheProperties#limitBytes()} (at most 5 GB = 5120 MiB; all
 * byte accounting is {@code long}). Every capacity change locks the single {@code
 * card_image_cache_usage} row ({@code SELECT ... FOR UPDATE}):
 *
 * <ol>
 *   <li>after the provider answered, bytes are <b>reserved</b> (the announced {@code
 *       Content-Length}, bounded by the maximum download size, else that maximum); {@code used +
 *       reserved + request > limit} is refused (cache full);
 *   <li>the body streams into {@code .tmp/<reservation>.part} and is aborted as soon as it exceeds
 *       the reservation; the bytes must decode as an image (HTML, empty bodies, wrong types are
 *       refused), are resized/re-encoded and hashed (SHA-256); the raw file is deleted;
 *   <li>an identical checksum reuses the existing file (no second file); otherwise the rendition is
 *       written to {@code .tmp/<reservation>.jpg.tmp} (the reservation grows under the lock if
 *       needed), then {@code used += size} and the reservation is released in one locked
 *       transaction, and only then the file is stored at its deterministic key (an atomic move into
 *       the local directory, an upload to the bucket);
 *   <li>on any failure the temporary files are deleted first and the reservation released.
 * </ol>
 *
 * Objects the cache could not delete still occupy capacity, so they keep counting: temporary files
 * no live reservation covers are added to every capacity check, and reconciliation keeps
 * unreferenced objects it failed to delete in the usage.
 *
 * <p>Reservations expire ({@code reservation-ttl}), so a crashed process cannot leak capacity.
 * Downloads are single-flight per image and bounded ({@code max-parallel-downloads}); provider
 * pacing and retries live in the provider adapter. {@link #reconcile()} (start-up and on demand)
 * deletes orphan temporary files, marks CACHED rows whose object vanished NOT_CACHED, deletes
 * objects no row references, recomputes the usage from the objects actually stored and evicts the
 * least recently used images when the limit was lowered. It never deletes an unreferenced object
 * younger than the reservation TTL: it may belong to a commit in flight in another process (the
 * previous revision during a Cloud Run rollout), so it is counted instead and removed by a later
 * reconciliation if it stays unreferenced.
 */
@Service
public class CardImageCache implements DisposableBean {

    /** How one image request ended. */
    public enum Outcome {
        ALREADY_CACHED,
        DOWNLOADED,
        DEDUPLICATED,
        CACHE_FULL,
        FAILED,
        MISSING_AT_SOURCE,
        NOT_DOWNLOADABLE
    }

    /**
     * Result of one image request.
     *
     * @param outcome what happened
     * @param bytesDownloaded bytes received from the provider
     * @param error client-safe reason for FAILED / MISSING_AT_SOURCE / NOT_DOWNLOADABLE
     */
    public record Result(Outcome outcome, long bytesDownloaded, @Nullable String error) {

        static Result of(Outcome outcome) {
            return new Result(outcome, 0, null);
        }

        static Result failed(Outcome outcome, String error, long bytes) {
            return new Result(outcome, bytes, error);
        }

        public boolean cached() {
            return outcome == Outcome.ALREADY_CACHED
                    || outcome == Outcome.DOWNLOADED
                    || outcome == Outcome.DEDUPLICATED;
        }
    }

    /**
     * A cached rendition ready to be served; {@link #read(CachedFile)} fetches its bytes.
     *
     * @param imageId image row
     * @param key storage key
     * @param size bytes
     * @param checksum SHA-256 (ETag)
     * @param contentType MIME type
     */
    public record CachedFile(
            UUID imageId, String key, long size, String checksum, String contentType) {}

    /**
     * Outcome of a reconciliation.
     *
     * @param expiredReservations expired reservations reclaimed
     * @param orphanTempFiles temporary files without a live reservation deleted
     * @param missingFiles CACHED rows whose file was missing (now NOT_CACHED)
     * @param orphanFiles files no row referenced (deleted)
     * @param evicted images evicted because the content exceeded a lowered limit
     * @param usedBytes recomputed usage
     * @param files final files
     */
    @io.swagger.v3.oas.annotations.media.Schema(name = "CardImageCacheReconcileResult")
    public record ReconcileResult(
            int expiredReservations,
            int orphanTempFiles,
            int missingFiles,
            int orphanFiles,
            int evicted,
            long usedBytes,
            int files) {}

    /**
     * Outcome of a clear.
     *
     * @param images rows set back to NOT_CACHED
     * @param filesDeleted files deleted
     * @param bytesReleased capacity released
     */
    public record ClearResult(int images, int filesDeleted, long bytesReleased) {}

    /** Name of the {@link ObjectStorage} bean holding the renditions (never the media one). */
    public static final String STORAGE_BEAN = "cardImageStorage";

    static final String STATUS_CACHED = "CACHED";
    static final String STATUS_NOT_CACHED = "NOT_CACHED";
    static final String STATUS_FAILED = "FAILED";
    static final String STATUS_MISSING = "MISSING_AT_SOURCE";

    /** Below this remaining capacity no download is started at all (avoids pointless requests). */
    static final long MIN_HEADROOM_BYTES = 16 * 1024;

    static final int MAX_REPORTED_ERRORS = 20;

    private static final Logger log = LoggerFactory.getLogger(CardImageCache.class);

    /**
     * Files between their accounting commit and the CACHED mark, by key with their size, JVM-wide
     * (several application contexts may share one cache directory in tests). Reconciliation counts
     * them and never deletes them.
     */
    private static final Map<String, Long> COMMITTING = new ConcurrentHashMap<>();

    /**
     * Reservations of this JVM whose bytes were already moved into the usage while their rendition
     * still waits in {@code .tmp/} for the move into place: that temporary file is counted by the
     * usage, so it is neither untracked nor an orphan. A temporary file whose reservation expired
     * while its download was still running is in neither set and counts in full.
     */
    private static final Set<UUID> COMMITTED_RESERVATIONS = ConcurrentHashMap.newKeySet();

    /** Striped locks serialising deduplication per checksum. */
    private static final Object[] CHECKSUM_LOCKS = new Object[64];

    static {
        for (int i = 0; i < CHECKSUM_LOCKS.length; i++) {
            CHECKSUM_LOCKS[i] = new Object();
        }
    }

    private final CardImageCacheProperties properties;
    private final CardImageOnDemandProperties onDemand;
    private final CardImageCacheRepository repository;
    private final CardImageFileStore files;
    private final ObjectStorage storage;
    private final CardImageProcessor processor;
    private final Map<String, CardProvider> providers = new LinkedHashMap<>();
    private final List<CardImageReferenceSource> referenceSources;
    private final TimeProvider timeProvider;
    private final TransactionTemplate tx;
    private final ExecutorService downloads;
    private final ScheduledExecutorService watchdog;
    private final Map<UUID, CompletableFuture<Result>> inFlight = new ConcurrentHashMap<>();
    private final String owner = "api-" + UUID.randomUUID();
    private final AtomicLong nextOnDemandSlot = new AtomicLong(0);
    private final long onDemandIntervalNanos;
    private final AtomicBoolean reconcileRequested = new AtomicBoolean(false);

    /**
     * Moving average of the raw download sizes: no request is started while less capacity than that
     * remains (the provider would only be asked for an image the cache cannot stage).
     */
    private final AtomicLong typicalDownloadBytes = new AtomicLong(MIN_HEADROOM_BYTES);

    public CardImageCache(
            CardImageCacheProperties properties,
            CardImageOnDemandProperties onDemand,
            CardImageCacheRepository repository,
            List<CardProvider> providers,
            List<CardImageReferenceSource> referenceSources,
            TimeProvider timeProvider,
            PlatformTransactionManager transactionManager,
            @Qualifier(STORAGE_BEAN) ObjectStorage storage) {
        this.properties = properties;
        this.onDemand = onDemand;
        this.repository = repository;
        this.files = new CardImageFileStore(Path.of(properties.dir()));
        this.files.init();
        this.storage = storage;
        this.processor = new CardImageProcessor(properties.targetWidth(), properties.jpegQuality());
        providers.forEach(provider -> this.providers.put(provider.providerId(), provider));
        this.referenceSources = List.copyOf(referenceSources);
        this.timeProvider = timeProvider;
        this.tx = new TransactionTemplate(transactionManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.downloads =
                Executors.newFixedThreadPool(
                        properties.maxParallelDownloads(), daemonThreads("card-image-download-"));
        this.watchdog =
                Executors.newSingleThreadScheduledExecutor(daemonThreads("card-image-watchdog-"));
        this.onDemandIntervalNanos = (long) Math.ceil(1_000_000_000.0 / onDemand.maxPerSecond());
        log.info(
                "Card image cache: temporary files in {} (limit {} MB, {} px wide JPEG, {} parallel"
                        + " downloads)",
                files.root(),
                properties.maxMb(),
                properties.targetWidth(),
                properties.maxParallelDownloads());
    }

    public long limitBytes() {
        return properties.limitBytes();
    }

    /**
     * The local cache directory: the renditions with the local provider, only the {@code .tmp/}
     * staging of downloads with the gcs provider.
     */
    public Path directory() {
        return files.root();
    }

    /** Hosting policy of a provider; unknown providers are treated as re-host only. */
    public ImageHostingPolicy policyOf(@Nullable String providerId) {
        CardProvider provider = providerId == null ? null : providers.get(providerId);
        return provider == null
                ? ImageHostingPolicy.REHOST_REQUIRED
                : provider.imageHostingPolicy();
    }

    // -------------------------------------------------------------------------------------
    // Requests
    // -------------------------------------------------------------------------------------

    /** Caches one artwork (single-flight) and waits for the outcome. */
    public Result ensureCached(UUID imageId) {
        try {
            return request(imageId).get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Result.failed(Outcome.FAILED, "interrupted", 0);
        } catch (ExecutionException e) {
            return Result.failed(Outcome.FAILED, "internal error", 0);
        }
    }

    /** Starts (or joins) the download of one artwork. */
    public CompletableFuture<Result> request(UUID imageId) {
        CompletableFuture<Result> existing = inFlight.get(imageId);
        if (existing != null) {
            return existing;
        }
        CompletableFuture<Result> created = new CompletableFuture<>();
        CompletableFuture<Result> raced = inFlight.putIfAbsent(imageId, created);
        if (raced != null) {
            return raced;
        }
        try {
            downloads.execute(
                    () -> {
                        Result result;
                        try {
                            result = download(imageId);
                        } catch (RuntimeException e) {
                            log.error("Card image {} could not be cached", imageId, e);
                            result = Result.failed(Outcome.FAILED, "internal error", 0);
                        } finally {
                            inFlight.remove(imageId);
                        }
                        created.complete(result);
                    });
        } catch (RuntimeException e) {
            inFlight.remove(imageId);
            created.complete(Result.failed(Outcome.FAILED, "download queue unavailable", 0));
        }
        return created;
    }

    /** The cached rendition of an image, when it is CACHED and its object exists. */
    public Optional<CachedFile> cachedFile(UUID imageId) {
        Optional<ImageRow> row = repository.findImage(imageId);
        if (row.isEmpty() || !STATUS_CACHED.equals(row.get().cacheStatus())) {
            return Optional.empty();
        }
        return cachedFile(row.get());
    }

    /** The rendition of a CACHED row after checking that its object exists (repairs the row). */
    private Optional<CachedFile> cachedFile(ImageRow row) {
        Optional<CachedFile> described = describe(row);
        if (described.isEmpty()) {
            return Optional.empty();
        }
        if (!storage.exists(described.get().key())) {
            markLost(row);
            return Optional.empty();
        }
        return described;
    }

    /** The rendition a CACHED row describes, without touching the storage. */
    private Optional<CachedFile> describe(ImageRow row) {
        String key = row.storageKey();
        if (key == null || row.checksum() == null || !CardImageFileStore.isValidKey(key)) {
            return Optional.empty();
        }
        return Optional.of(
                new CachedFile(
                        row.id(),
                        key,
                        row.fileSizeBytes() == null ? 0 : row.fileSizeBytes(),
                        row.checksum(),
                        row.contentType() == null
                                ? CardImageProcessor.CONTENT_TYPE
                                : row.contentType()));
    }

    /**
     * The bytes of a cached rendition. Empty when the object vanished (evicted by another process,
     * bucket restored from a backup, local disk wiped): the row is then marked NOT_CACHED and the
     * usage corrected, so the next {@link #serving} fills it on demand or serves the placeholder.
     */
    public Optional<byte[]> read(CachedFile file) {
        Optional<StoredObject> object;
        try {
            object = storage.get(file.key());
        } catch (RuntimeException e) {
            log.warn("Cached card image {} could not be read", file.imageId(), e);
            return Optional.empty();
        }
        if (object.isEmpty()) {
            repository.findImage(file.imageId()).ifPresent(this::markLost);
            return Optional.empty();
        }
        return Optional.of(object.get().content());
    }

    /** A CACHED row whose object is gone: back to NOT_CACHED, usage corrected (once). */
    private void markLost(ImageRow row) {
        String key = row.storageKey();
        if (key == null
                || !STATUS_CACHED.equals(row.cacheStatus())
                || COMMITTING.containsKey(key)) {
            return;
        }
        log.warn("Cached card image {} lost its object; marking it NOT_CACHED", row.id());
        tx.executeWithoutResult(
                status -> {
                    repository.lockUsage();
                    Optional<ImageRow> current = repository.findImage(row.id());
                    if (current.isEmpty() || !STATUS_CACHED.equals(current.get().cacheStatus())) {
                        return; // repaired meanwhile
                    }
                    if (!storage.exists(key) && repository.countReferences(key, row.id()) == 0) {
                        repository.addUsage(
                                -(row.fileSizeBytes() == null ? 0 : row.fileSizeBytes()),
                                -1,
                                timeProvider.now());
                    }
                    repository.markNotCached(List.of(row.id()), timeProvider.now());
                });
    }

    /** What {@code GET /api/v1/public/card-images/{id}} answers. */
    public sealed interface Serving permits ServeFile, ServePlaceholder, ServeRedirect {}

    /** The cached rendition (long immutable caching). */
    public record ServeFile(CachedFile file) implements Serving {}

    /** The card's placeholder (short caching: the artwork may be cached later). */
    public record ServePlaceholder(String gameSlug, String cardName) implements Serving {}

    /** A provider that allows hotlinking: its own URL. */
    public record ServeRedirect(String url) implements Serving {}

    /**
     * Serving decision for an image id: the cached rendition (described from the row; the caller
     * reads it with {@link #read} and asks again when the object turned out to be gone); for a
     * re-host-only artwork that is not cached, an on-demand fill when allowed (otherwise the
     * placeholder); never a re-host-only provider's URL. Empty for unknown ids.
     */
    public Optional<Serving> serving(UUID imageId) {
        Optional<ImageRow> found = repository.findImage(imageId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        ImageRow row = found.get();
        if (row.providerImageId() == null) {
            return Optional.of(new ServePlaceholder(row.game(), row.cardName()));
        }
        if (policyOf(row.provider()) == ImageHostingPolicy.HOTLINK_ALLOWED
                && row.sourceUrl() != null) {
            return Optional.of(new ServeRedirect(row.sourceUrl()));
        }
        if (STATUS_CACHED.equals(row.cacheStatus())) {
            // No existence check here: the read that follows is the one round trip to the
            // storage, and it repairs the row when the object is gone.
            Optional<CachedFile> file = describe(row);
            if (file.isPresent()) {
                touch(imageId);
                return Optional.of(new ServeFile(file.get()));
            }
        }
        Optional<CachedFile> filled = fillOnDemand(imageId);
        if (filled.isPresent()) {
            touch(imageId);
            return Optional.of(new ServeFile(filled.get()));
        }
        return Optional.of(new ServePlaceholder(row.game(), row.cardName()));
    }

    /** Records that a cached image was served (LRU eviction order). */
    public void touch(UUID imageId) {
        try {
            repository.touch(imageId, timeProvider.now());
        } catch (RuntimeException e) {
            log.debug("Could not record the access to card image {}", imageId, e);
        }
    }

    /**
     * Serving path: when a re-host-only artwork is not cached, starts (or joins) a download if
     * on-demand fills are enabled, the image is downloadable, capacity remains and the on-demand
     * rate allows it, then waits at most {@code wait-timeout}. Empty means "serve the placeholder".
     */
    public Optional<CachedFile> fillOnDemand(UUID imageId) {
        if (!onDemand.enabled()) {
            return Optional.empty();
        }
        Optional<ImageRow> found = repository.findImage(imageId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        ImageRow row = found.get();
        if (!downloadable(row)) {
            return Optional.empty();
        }
        if (STATUS_MISSING.equals(row.cacheStatus())) {
            return Optional.empty();
        }
        if (STATUS_FAILED.equals(row.cacheStatus())
                && row.lastAttemptAt() != null
                && row.lastAttemptAt()
                        .isAfter(timeProvider.now().minus(properties.failedRetryAfter()))) {
            return Optional.empty();
        }
        CompletableFuture<Result> future = inFlight.get(imageId);
        if (future == null) {
            if (!hasHeadroom() || !tryOnDemandSlot()) {
                return Optional.empty();
            }
            future = request(imageId);
        }
        try {
            Result result = future.get(onDemand.waitTimeout().toMillis(), TimeUnit.MILLISECONDS);
            return result.cached() ? cachedFile(imageId) : Optional.empty();
        } catch (TimeoutException e) {
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (ExecutionException e) {
            return Optional.empty();
        }
    }

    private boolean tryOnDemandSlot() {
        while (true) {
            long now = System.nanoTime();
            long next = nextOnDemandSlot.get();
            if (next != 0 && now < next) {
                return false;
            }
            if (nextOnDemandSlot.compareAndSet(next, now + onDemandIntervalNanos)) {
                return true;
            }
        }
    }

    private boolean downloadable(ImageRow row) {
        if (row.provider() == null || row.providerImageId() == null || row.sourceUrl() == null) {
            return false;
        }
        CardProvider provider = providers.get(row.provider());
        return provider != null
                && provider.supportsImageDownloads()
                && provider.imageHostingPolicy() == ImageHostingPolicy.REHOST_REQUIRED;
    }

    // -------------------------------------------------------------------------------------
    // Import fill
    // -------------------------------------------------------------------------------------

    /**
     * Caches the artworks of {@code providerId} for game {@code gameId} that {@code mode} selects,
     * in a deterministic order (referenced artworks first, then by card name). Never throws for
     * download problems: they are counted. Stops starting downloads once the cache is full.
     */
    public ImageFillResult fillForImport(
            UUID gameId, String providerId, ImageMode mode, @Nullable Integer limit) {
        if (mode == ImageMode.NONE) {
            return ImageFillResult.none();
        }
        List<CardImageCacheRepository.Candidate> all = repository.candidates(gameId, providerId);
        if (all.isEmpty()) {
            return ImageFillResult.none();
        }
        Set<UUID> referenced = referencedImageIds(gameId);
        List<CardImageCacheRepository.Candidate> ordered = new ArrayList<>(all.size());
        all.stream().filter(c -> referenced.contains(c.id())).forEach(ordered::add);
        if (mode != ImageMode.REFERENCED) {
            all.stream().filter(c -> !referenced.contains(c.id())).forEach(ordered::add);
        }
        if (mode == ImageMode.LIMIT && limit != null && ordered.size() > limit) {
            ordered = ordered.subList(0, limit);
        }

        AtomicInteger alreadyCached = new AtomicInteger();
        AtomicInteger downloaded = new AtomicInteger();
        AtomicInteger deduplicated = new AtomicInteger();
        AtomicInteger skippedFull = new AtomicInteger();
        AtomicInteger failed = new AtomicInteger();
        AtomicInteger missing = new AtomicInteger();
        AtomicInteger notDownloadable = new AtomicInteger();
        AtomicLong bytes = new AtomicLong();
        AtomicBoolean full = new AtomicBoolean(false);
        List<String> errors = Collections.synchronizedList(new ArrayList<>());
        Semaphore slots = new Semaphore(properties.maxParallelDownloads());
        List<CompletableFuture<Void>> pending = new ArrayList<>();
        // One listing of the storage instead of one existence check per CACHED candidate (14,764
        // metadata requests per Yu-Gi-Oh! import against a bucket). An object stored after the
        // snapshot is simply re-checked by the download, which reports ALREADY_CACHED.
        @Nullable Set<String> stored = null;

        for (CardImageCacheRepository.Candidate candidate : ordered) {
            if (STATUS_CACHED.equals(candidate.cacheStatus())
                    && candidate.storageKey() != null
                    && CardImageFileStore.isValidKey(candidate.storageKey())) {
                if (stored == null) {
                    stored = storedKeys();
                }
                if (stored.contains(candidate.storageKey())) {
                    alreadyCached.incrementAndGet();
                    continue;
                }
            }
            if (STATUS_MISSING.equals(candidate.cacheStatus())) {
                missing.incrementAndGet();
                continue;
            }
            if (full.get()) {
                skippedFull.incrementAndGet();
                continue;
            }
            try {
                slots.acquire();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            if (full.get()) {
                slots.release();
                skippedFull.incrementAndGet();
                continue;
            }
            pending.add(
                    request(candidate.id())
                            .thenAccept(
                                    result -> {
                                        bytes.addAndGet(result.bytesDownloaded());
                                        switch (result.outcome()) {
                                            case ALREADY_CACHED -> alreadyCached.incrementAndGet();
                                            case DOWNLOADED -> downloaded.incrementAndGet();
                                            case DEDUPLICATED -> deduplicated.incrementAndGet();
                                            case CACHE_FULL -> {
                                                full.set(true);
                                                skippedFull.incrementAndGet();
                                            }
                                            case MISSING_AT_SOURCE -> missing.incrementAndGet();
                                            case NOT_DOWNLOADABLE ->
                                                    notDownloadable.incrementAndGet();
                                            case FAILED -> {
                                                failed.incrementAndGet();
                                                if (errors.size() < MAX_REPORTED_ERRORS) {
                                                    errors.add(
                                                            "image "
                                                                    + candidate.id()
                                                                    + ": "
                                                                    + result.error());
                                                }
                                            }
                                        }
                                    })
                            .whenComplete((ignored, error) -> slots.release()));
        }
        CompletableFuture.allOf(pending.toArray(CompletableFuture[]::new)).join();
        if (reconcileRequested.getAndSet(false)) {
            reconcile();
        }
        return new ImageFillResult(
                ordered.size(),
                alreadyCached.get(),
                downloaded.get(),
                deduplicated.get(),
                skippedFull.get(),
                failed.get(),
                missing.get(),
                notDownloadable.get(),
                bytes.get(),
                full.get(),
                List.copyOf(errors));
    }

    /** Provider artworks known for a game (cached or not). */
    public long countProviderImages(UUID gameId, String providerId) {
        return repository.countProviderImages(gameId, providerId);
    }

    /** Keys of every object currently stored (one listing). */
    private Set<String> storedKeys() {
        Set<String> keys = new HashSet<>();
        for (ObjectSummary object : storage.list("")) {
            keys.add(object.key());
        }
        return keys;
    }

    /** Artworks members currently see for this game (referenced printings and cards). */
    Set<UUID> referencedImageIds(UUID gameId) {
        Set<UUID> printings = new HashSet<>();
        Set<UUID> cards = new HashSet<>();
        for (CardImageReferenceSource source : referenceSources) {
            try {
                printings.addAll(source.referencedPrintingIds());
                cards.addAll(source.referencedCardIds());
            } catch (RuntimeException e) {
                log.warn("Card image references of {} unavailable", source.name(), e);
            }
        }
        return new LinkedHashSet<>(repository.displayedImageIds(gameId, printings, cards));
    }

    // -------------------------------------------------------------------------------------
    // Download pipeline
    // -------------------------------------------------------------------------------------

    private Result download(UUID imageId) {
        Optional<ImageRow> found = repository.findImage(imageId);
        if (found.isEmpty()) {
            return Result.failed(Outcome.FAILED, "unknown image", 0);
        }
        ImageRow row = found.get();
        if (!downloadable(row)) {
            return Result.failed(
                    Outcome.NOT_DOWNLOADABLE, "the provider offers no image downloads", 0);
        }
        if (STATUS_CACHED.equals(row.cacheStatus()) && cachedFile(row).isPresent()) {
            return Result.of(Outcome.ALREADY_CACHED);
        }
        if (STATUS_MISSING.equals(row.cacheStatus())) {
            return Result.failed(Outcome.MISSING_AT_SOURCE, "missing at the provider", 0);
        }
        if (!hasHeadroom()) {
            return Result.of(Outcome.CACHE_FULL);
        }
        CardProvider provider = providers.get(row.provider());
        tx.executeWithoutResult(status -> repository.markAttempt(imageId, timeProvider.now()));
        long received = 0;
        String lastError = "download failed";
        for (int attempt = 1; attempt <= properties.maxAttempts(); attempt++) {
            Attempt outcome = attempt(row, provider);
            received += outcome.bytes();
            if (outcome.result() != null) {
                Result result = outcome.result();
                return new Result(result.outcome(), received, result.error());
            }
            lastError = outcome.retryableError() == null ? lastError : outcome.retryableError();
            if (attempt < properties.maxAttempts()) {
                try {
                    Thread.sleep(Duration.ofMillis(250L * attempt));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        markFailed(imageId, STATUS_FAILED, lastError);
        return Result.failed(Outcome.FAILED, lastError, received);
    }

    /**
     * One download attempt. A non-null result ends the request; a null result with an error asks
     * for another attempt (connection dropped mid-stream).
     */
    private record Attempt(@Nullable Result result, @Nullable String retryableError, long bytes) {}

    private Attempt attempt(ImageRow row, CardProvider provider) {
        @Nullable Reservation reservation = null;
        long received = 0;
        ImageDownload download;
        try {
            download = provider.openImage(row.sourceUrl());
        } catch (ImageMissingAtSourceException e) {
            markFailed(row.id(), STATUS_MISSING, e.getMessage());
            return new Attempt(
                    Result.failed(Outcome.MISSING_AT_SOURCE, e.getMessage(), 0), null, 0);
        } catch (ProviderUnavailableException e) {
            markFailed(row.id(), STATUS_FAILED, e.getMessage());
            return new Attempt(Result.failed(Outcome.FAILED, e.getMessage(), 0), null, 0);
        } catch (ProviderRequestException e) {
            markFailed(row.id(), STATUS_FAILED, e.getMessage());
            return new Attempt(Result.failed(Outcome.FAILED, e.getMessage(), 0), null, 0);
        } catch (IOException e) {
            return new Attempt(null, "connection failed (" + e.getClass().getSimpleName() + ")", 0);
        }
        ScheduledFuture<?> deadline =
                watchdog.schedule(
                        () -> closeQuietly(download),
                        properties.downloadTimeout().toMillis(),
                        TimeUnit.MILLISECONDS);
        try {
            @Nullable String type = download.contentType();
            if (type != null && !type.toLowerCase(java.util.Locale.ROOT).startsWith("image/")) {
                String error = "unexpected content type " + safeType(type);
                markFailed(row.id(), STATUS_FAILED, error);
                return new Attempt(Result.failed(Outcome.FAILED, error, 0), null, 0);
            }
            long declared = download.contentLength();
            if (declared > properties.maxDownloadBytes()) {
                String error = "image larger than " + properties.maxDownloadBytes() + " bytes";
                markFailed(row.id(), STATUS_FAILED, error);
                return new Attempt(Result.failed(Outcome.FAILED, error, 0), null, 0);
            }
            long wanted = declared > 0 ? declared : properties.maxDownloadBytes();
            reservation = reserve(row.id(), wanted);
            if (reservation == null) {
                return new Attempt(Result.of(Outcome.CACHE_FULL), null, 0);
            }
            Path raw = files.rawTemp(reservation.id());
            long limit = Math.min(reservation.bytes(), properties.maxDownloadBytes());
            try {
                received = copy(download.body(), raw, limit);
            } catch (TooLargeException e) {
                String error = "image larger than announced (" + limit + " bytes reserved)";
                markFailed(row.id(), STATUS_FAILED, error);
                return new Attempt(Result.failed(Outcome.FAILED, error, limit), null, limit);
            } catch (IOException e) {
                return new Attempt(
                        null,
                        "connection dropped while downloading ("
                                + e.getClass().getSimpleName()
                                + ")",
                        0);
            }
            if (declared >= 0 && received != declared) {
                return new Attempt(null, "truncated download", received);
            }
            long sample = received;
            typicalDownloadBytes.updateAndGet(
                    current -> Math.max(MIN_HEADROOM_BYTES, (current * 4 + sample) / 5));
            closeQuietly(download);
            CardImageProcessor.Rendition rendition;
            try {
                rendition = processor.process(raw);
            } catch (CardImageProcessor.InvalidImageException e) {
                String error = "invalid image content: " + e.getMessage();
                markFailed(row.id(), STATUS_FAILED, error);
                return new Attempt(Result.failed(Outcome.FAILED, error, received), null, received);
            } finally {
                CardImageFileStore.deleteQuietly(raw);
            }
            if (Files.exists(raw)) {
                // The raw body could not be deleted (e.g. another process holds it open): the
                // rendition next to it could exceed the reservation, so this attempt stops here;
                // release() retries the deletion and a leftover then counts as untracked.
                String error = "could not remove the temporary download";
                markFailed(row.id(), STATUS_FAILED, error);
                return new Attempt(Result.failed(Outcome.FAILED, error, received), null, received);
            }
            Result stored = store(row, reservation, rendition);
            return new Attempt(stored, null, received);
        } catch (IOException e) {
            String error = "could not store the image (" + e.getClass().getSimpleName() + ")";
            markFailed(row.id(), STATUS_FAILED, error);
            return new Attempt(Result.failed(Outcome.FAILED, error, received), null, received);
        } finally {
            deadline.cancel(false);
            closeQuietly(download);
            if (reservation != null) {
                release(reservation.id());
            }
        }
    }

    private static final class TooLargeException extends IOException {
        TooLargeException() {
            super("too large");
        }
    }

    private static long copy(InputStream body, Path target, long limit) throws IOException {
        long total = 0;
        try (OutputStream out = Files.newOutputStream(target)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = body.read(buffer)) != -1) {
                total += read;
                if (total > limit) {
                    throw new TooLargeException();
                }
                out.write(buffer, 0, read);
            }
        }
        return total;
    }

    /** Deduplicates or writes the rendition and marks the row CACHED. */
    private Result store(
            ImageRow row, Reservation reservation, CardImageProcessor.Rendition rendition)
            throws IOException {
        Object lock =
                CHECKSUM_LOCKS[Math.floorMod(rendition.sha256().hashCode(), CHECKSUM_LOCKS.length)];
        synchronized (lock) {
            Boolean deduplicated =
                    tx.execute(
                            status -> {
                                repository.lockUsage();
                                Optional<ImageRow> same =
                                        repository.findCachedByChecksum(
                                                rendition.sha256(), row.id());
                                if (same.isEmpty()
                                        || same.get().storageKey() == null
                                        || !CardImageFileStore.isValidKey(same.get().storageKey())
                                        || !storage.exists(same.get().storageKey())) {
                                    return false;
                                }
                                ImageRow existing = same.get();
                                repository.markCached(
                                        row.id(),
                                        existing.storageKey(),
                                        CardImageProcessor.CONTENT_TYPE,
                                        existing.fileSizeBytes() == null
                                                ? rendition.jpeg().length
                                                : existing.fileSizeBytes(),
                                        rendition.sha256(),
                                        rendition.width(),
                                        rendition.height(),
                                        timeProvider.now());
                                return true;
                            });
            if (Boolean.TRUE.equals(deduplicated)) {
                return Result.of(Outcome.DEDUPLICATED);
            }

            long size = rendition.jpeg().length;
            if (size > reservation.bytes() && !grow(reservation, size)) {
                return Result.of(Outcome.CACHE_FULL);
            }
            String key =
                    CardImageFileStore.keyOf(row.game(), row.provider(), row.providerImageId());
            if (repository.countReferences(key, row.id()) > 0) {
                // Another row still shares a different file at this key: keep both distinct.
                key =
                        key.substring(0, key.length() - ".jpg".length())
                                + "-"
                                + rendition.sha256().substring(0, 8)
                                + ".jpg";
            }
            if (!COMMITTING.containsKey(key) && storage.exists(key)) {
                // A leftover of an interrupted run: its bytes may already be counted.
                reconcileRequested.set(true);
            }
            Path temp = files.writeRenditionTemp(reservation.id(), rendition.jpeg());
            String finalKey = key;
            // Registered before the accounting commit: a concurrent reconciliation then counts the
            // file (possibly twice until the next reconciliation, never zero times).
            COMMITTING.put(finalKey, size);
            Boolean committed;
            try {
                committed =
                        tx.execute(
                                status -> {
                                    Instant now = timeProvider.now();
                                    repository.lockUsage();
                                    if (repository
                                            .liveReservation(reservation.id(), now)
                                            .isEmpty()) {
                                        return false;
                                    }
                                    repository.addUsage(size, 1, now);
                                    repository.deleteReservation(reservation.id());
                                    COMMITTED_RESERVATIONS.add(reservation.id());
                                    return true;
                                });
            } catch (RuntimeException e) {
                COMMITTED_RESERVATIONS.remove(reservation.id());
                COMMITTING.remove(finalKey);
                CardImageFileStore.deleteQuietly(temp);
                throw e;
            }
            if (!Boolean.TRUE.equals(committed)) {
                COMMITTING.remove(finalKey);
                CardImageFileStore.deleteQuietly(temp);
                throw new IOException("reservation expired");
            }
            try {
                try {
                    // Local storage renames the temporary file into place atomically; a bucket
                    // receives an upload and the temporary file is deleted afterwards.
                    storage.putFile(temp, finalKey, CardImageProcessor.CONTENT_TYPE);
                } catch (IOException | RuntimeException e) {
                    CardImageFileStore.deleteQuietly(temp);
                    // From here on a leftover temporary file is no longer covered by the usage.
                    COMMITTED_RESERVATIONS.remove(reservation.id());
                    tx.executeWithoutResult(
                            status -> {
                                repository.lockUsage();
                                repository.addUsage(-size, -1, timeProvider.now());
                            });
                    throw e;
                }
                tx.executeWithoutResult(
                        status ->
                                repository.markCached(
                                        row.id(),
                                        finalKey,
                                        CardImageProcessor.CONTENT_TYPE,
                                        size,
                                        rendition.sha256(),
                                        rendition.width(),
                                        rendition.height(),
                                        timeProvider.now()));
            } finally {
                COMMITTING.remove(finalKey);
            }
            return Result.of(Outcome.DOWNLOADED);
        }
    }

    private void markFailed(UUID imageId, String status, @Nullable String error) {
        String message = error == null || error.isBlank() ? "download failed" : error;
        try {
            tx.executeWithoutResult(
                    s -> repository.markFailed(imageId, status, message, timeProvider.now()));
        } catch (RuntimeException e) {
            log.warn("Could not record the failure of card image {}", imageId, e);
        }
    }

    // -------------------------------------------------------------------------------------
    // Capacity accounting
    // -------------------------------------------------------------------------------------

    /** A capacity reservation of an in-flight download. */
    record Reservation(UUID id, long bytes) {}

    /** Whether a typical download could still be staged (no request is made otherwise). */
    private boolean hasHeadroom() {
        return remainingBytes() >= Math.max(MIN_HEADROOM_BYTES, typicalDownloadBytes.get());
    }

    /**
     * Remaining capacity (limit − used − live reservations − untracked temporary files), without
     * locking.
     */
    public long remainingBytes() {
        Instant now = timeProvider.now();
        Usage usage = repository.usage();
        return limitBytes()
                - usage.usedBytes()
                - repository.reservedBytes(now)
                - untrackedTempBytes(now);
    }

    /**
     * Bytes of temporary files that neither a live reservation nor the usage accounts for: a
     * temporary file whose deletion failed (e.g. another process held it open on Windows), the
     * leftover of a crashed process, or the file of a download whose reservation expired while it
     * was still running. They are on disk, so they count against the limit until a deletion
     * succeeds (the next reservation or reconciliation retries it). Cheap: {@code .tmp/} holds at
     * most a few files per parallel download.
     */
    private long untrackedTempBytes(Instant now) {
        List<CardImageFileStore.TempFile> temps = files.tempFiles();
        if (temps.isEmpty()) {
            return 0;
        }
        Set<UUID> live = new HashSet<>(repository.liveReservationIds(now));
        long bytes = 0;
        for (CardImageFileStore.TempFile temp : temps) {
            if (!accounted(temp.reservationId(), live)) {
                bytes += temp.size();
            }
        }
        return bytes;
    }

    /**
     * Whether a temporary file is already counted: by its live reservation, or by the usage once
     * its download committed (the rendition is about to be moved into place).
     */
    private static boolean accounted(@Nullable UUID reservation, Set<UUID> live) {
        return reservation != null
                && (live.contains(reservation) || COMMITTED_RESERVATIONS.contains(reservation));
    }

    /** Reserves {@code bytes} for an image, or {@code null} when the cache is full. */
    @Nullable Reservation reserve(@Nullable UUID imageId, long bytes) {
        Reservation reservation =
                tx.execute(
                        status -> {
                            Instant now = timeProvider.now();
                            Usage usage = repository.lockUsage();
                            reclaimExpired(now);
                            long reserved = repository.reservedBytes(now);
                            if (usage.usedBytes() + reserved + untrackedTempBytes(now) + bytes
                                    > limitBytes()) {
                                return null;
                            }
                            UUID id = UUID.randomUUID();
                            repository.insertReservation(
                                    id,
                                    imageId,
                                    bytes,
                                    owner,
                                    now,
                                    now.plus(properties.reservationTtl()));
                            return new Reservation(id, bytes);
                        });
        return reservation;
    }

    /** Grows a reservation under the lock; {@code false} when the cache cannot hold it. */
    private boolean grow(Reservation reservation, long bytes) {
        Boolean grown =
                tx.execute(
                        status -> {
                            Instant now = timeProvider.now();
                            Usage usage = repository.lockUsage();
                            Optional<Long> current =
                                    repository.liveReservation(reservation.id(), now);
                            if (current.isEmpty()) {
                                return false;
                            }
                            long others = repository.reservedBytes(now) - current.get();
                            if (usage.usedBytes() + others + untrackedTempBytes(now) + bytes
                                    > limitBytes()) {
                                return false;
                            }
                            repository.resizeReservation(reservation.id(), bytes);
                            return true;
                        });
        return Boolean.TRUE.equals(grown);
    }

    /** Deletes the reservation's temporary files first, then releases it. */
    private void release(UUID reservationId) {
        files.deleteTemps(reservationId);
        try {
            tx.executeWithoutResult(
                    status -> {
                        repository.lockUsage();
                        repository.deleteReservation(reservationId);
                    });
        } finally {
            COMMITTED_RESERVATIONS.remove(reservationId);
        }
    }

    /** Reclaims expired reservations (caller holds the usage lock). */
    private int reclaimExpired(Instant now) {
        List<UUID> expired = repository.deleteExpiredReservations(now);
        for (UUID id : expired) {
            files.deleteTemps(id);
        }
        if (!expired.isEmpty()) {
            log.warn("Reclaimed {} expired card image cache reservation(s)", expired.size());
        }
        return expired.size();
    }

    // -------------------------------------------------------------------------------------
    // Eviction, clear, reconciliation
    // -------------------------------------------------------------------------------------

    /** Evicts one image's cached rendition (the file is deleted unless another row shares it). */
    public boolean evict(UUID imageId) {
        Boolean evicted =
                tx.execute(
                        status -> {
                            repository.lockUsage();
                            Optional<ImageRow> row = repository.findImage(imageId);
                            if (row.isEmpty() || !STATUS_CACHED.equals(row.get().cacheStatus())) {
                                return false;
                            }
                            evictLocked(row.get());
                            return true;
                        });
        return Boolean.TRUE.equals(evicted);
    }

    private void evictLocked(ImageRow row) {
        Instant now = timeProvider.now();
        repository.markNotCached(List.of(row.id()), now);
        String key = row.storageKey();
        if (key != null
                && CardImageFileStore.isValidKey(key)
                && repository.countReferences(key, null) == 0
                && !COMMITTING.containsKey(key)) {
            if (storage.delete(key)) {
                repository.addUsage(
                        -(row.fileSizeBytes() == null ? 0 : row.fileSizeBytes()), -1, now);
            }
        }
    }

    /**
     * Removes every cached rendition (of one game when {@code gameSlug} is given) and releases the
     * capacity; rows go back to NOT_CACHED (metadata and source references stay).
     */
    public ClearResult clear(@Nullable String gameSlug) {
        @Nullable UUID gameId =
                gameSlug == null
                        ? null
                        : repository
                                .gameId(gameSlug)
                                .orElseThrow(() -> new IllegalArgumentException("unknown game"));
        ClearResult result =
                tx.execute(
                        status -> {
                            Instant now = timeProvider.now();
                            Usage before = repository.lockUsage();
                            List<ImageRow> cached = repository.cachedImages(gameId);
                            repository.markNotCached(
                                    cached.stream().map(ImageRow::id).toList(), now);
                            int deleted = 0;
                            Set<String> keys = new LinkedHashSet<>();
                            cached.forEach(
                                    row -> {
                                        if (row.storageKey() != null) {
                                            keys.add(row.storageKey());
                                        }
                                    });
                            for (String key : keys) {
                                if (CardImageFileStore.isValidKey(key)
                                        && repository.countReferences(key, null) == 0
                                        && !COMMITTING.containsKey(key)
                                        && storage.delete(key)) {
                                    deleted++;
                                }
                            }
                            ReconcileResult reconciled = reconcileLocked(now);
                            return new ClearResult(
                                    cached.size(),
                                    deleted + reconciled.orphanFiles(),
                                    Math.max(0, before.usedBytes() - reconciled.usedBytes()));
                        });
        files.pruneEmptyDirectories();
        log.info(
                "Card image cache cleared{}: {} image(s), {} file(s), {} bytes released",
                gameSlug == null ? "" : " for " + gameSlug,
                result.images(),
                result.filesDeleted(),
                result.bytesReleased());
        return result;
    }

    /** Reconciles stored objects, rows and accounting (start-up, admin, CLI). */
    public ReconcileResult reconcile() {
        ReconcileResult result =
                tx.execute(
                        status -> {
                            repository.lockUsage();
                            return reconcileLocked(timeProvider.now());
                        });
        if (result.orphanFiles() + result.orphanTempFiles() + result.missingFiles() > 0
                || result.evicted() > 0
                || result.expiredReservations() > 0) {
            log.info(
                    "Card image cache reconciled: {} expired reservation(s), {} orphan temporary"
                            + " file(s), {} missing file(s), {} orphan file(s), {} evicted; {}"
                            + " bytes in {} file(s)",
                    result.expiredReservations(),
                    result.orphanTempFiles(),
                    result.missingFiles(),
                    result.orphanFiles(),
                    result.evicted(),
                    result.usedBytes(),
                    result.files());
        }
        return result;
    }

    /** Reconciliation body; the caller holds the usage lock. */
    private ReconcileResult reconcileLocked(Instant now) {
        int expired = reclaimExpired(now);
        Set<UUID> live = new HashSet<>(repository.liveReservationIds(now));
        int orphanTemps = 0;
        for (CardImageFileStore.TempFile temp : files.tempFiles()) {
            if (!accounted(temp.reservationId(), live)) {
                CardImageFileStore.deleteQuietly(temp.path());
                if (!Files.exists(temp.path())) {
                    orphanTemps++;
                }
                // An orphan that could not be deleted keeps counting against the limit (see
                // untrackedTempBytes) until a later attempt removes it.
            }
        }

        List<ObjectSummary> stored = storage.list("");
        Map<String, Long> onStore = new LinkedHashMap<>();
        stored.forEach(object -> onStore.put(object.key(), object.size()));
        List<ImageRow> cached = repository.cachedImages(null);
        List<UUID> missing = new ArrayList<>();
        Map<String, Long> referenced = new LinkedHashMap<>();
        for (ImageRow row : cached) {
            String key = row.storageKey();
            Long size = key == null ? null : onStore.get(key);
            if (size == null) {
                if (key == null || !COMMITTING.containsKey(key)) {
                    missing.add(row.id());
                }
                continue;
            }
            referenced.put(key, size);
            if (row.fileSizeBytes() == null || row.fileSizeBytes() != size.longValue()) {
                repository.updateFileSize(row.id(), size);
            }
        }
        repository.markNotCached(missing, now);

        int orphans = 0;
        long undeletableBytes = 0;
        int undeletable = 0;
        int recent = 0;
        Instant keepIfNewerThan = now.minus(properties.reservationTtl());
        for (ObjectSummary object : stored) {
            String key = object.key();
            if (referenced.containsKey(key) || COMMITTING.containsKey(key)) {
                continue;
            }
            if (object.lastModified().isAfter(keepIfNewerThan)) {
                // Possibly a commit in flight in another process (the previous revision during a
                // rollout): never deleted while younger than the reservation TTL, but it occupies
                // capacity, so it counts until it is referenced or a later reconciliation removes
                // it.
                recent++;
                undeletableBytes += object.size();
                undeletable++;
                continue;
            }
            boolean deleted;
            try {
                deleted = storage.delete(key);
            } catch (RuntimeException e) {
                deleted = false; // stray name the key policy refuses, or an I/O failure
            }
            if (deleted) {
                orphans++;
            } else if (stillStored(key)) {
                // Still there (e.g. held open by another process on Windows): it occupies capacity,
                // so the usage keeps counting it until a later reconciliation deletes it.
                undeletableBytes += object.size();
                undeletable++;
            }
        }
        if (recent > 0) {
            log.info(
                    "Card image cache: {} unreferenced object(s) younger than {} kept and counted"
                            + " (a commit may be in flight elsewhere)",
                    recent,
                    properties.reservationTtl());
        }
        if (undeletable - recent > 0) {
            log.warn(
                    "Card image cache: {} unreferenced object(s) could not be deleted; they keep"
                            + " counting against the limit",
                    undeletable - recent);
        }
        long used =
                referenced.values().stream().mapToLong(Long::longValue).sum() + undeletableBytes;
        int count = referenced.size() + undeletable;
        for (Map.Entry<String, Long> committing : COMMITTING.entrySet()) {
            if (!referenced.containsKey(committing.getKey())) {
                used += committing.getValue();
                count++;
            }
        }
        repository.setUsage(used, count, now, now);

        int evicted = 0;
        if (used > limitBytes()) {
            for (ImageRow row : repository.cachedImages(null)) {
                if (repository.usage().usedBytes() <= limitBytes()) {
                    break;
                }
                evictLocked(row);
                evicted++;
            }
            Usage after = repository.usage();
            used = after.usedBytes();
            count = after.fileCount();
            log.warn(
                    "Card image cache exceeded its {} MB limit; evicted {} least recently used"
                            + " image(s)",
                    properties.maxMb(),
                    evicted);
        }
        return new ReconcileResult(
                expired, orphanTemps, missing.size(), orphans, evicted, used, count);
    }

    /** Whether an object is still stored; an unanswerable question counts as "yes" (safe side). */
    private boolean stillStored(String key) {
        try {
            return storage.exists(key);
        } catch (RuntimeException e) {
            return true;
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    void reconcileOnStartup() {
        if (!properties.reconcileOnStartup()) {
            return;
        }
        try {
            reconcile();
        } catch (RuntimeException e) {
            log.warn("Card image cache reconciliation at start-up failed", e);
        }
    }

    // -------------------------------------------------------------------------------------
    // Status
    // -------------------------------------------------------------------------------------

    public CardImageCacheStatus status() {
        Instant now = timeProvider.now();
        Usage usage = repository.usage();
        long reserved = repository.reservedBytes(now);
        long remaining =
                Math.max(0, limitBytes() - usage.usedBytes() - reserved - untrackedTempBytes(now));
        List<CardImageCacheRepository.StatusCount> counts = repository.statusCounts();
        Map<String, CardImageCacheStatus.GameImages> games = new LinkedHashMap<>();
        for (CardImageCacheRepository.StatusCount count : counts) {
            String key = count.game() + "|" + count.provider();
            CardImageCacheStatus.GameImages current =
                    games.getOrDefault(
                            key,
                            new CardImageCacheStatus.GameImages(
                                    count.game(),
                                    count.provider(),
                                    CardImageCacheRepository.byStatus(List.of()),
                                    0));
            Map<String, Long> images = new LinkedHashMap<>(current.images());
            images.merge(count.status(), count.images(), Long::sum);
            games.put(
                    key,
                    new CardImageCacheStatus.GameImages(
                            count.game(),
                            count.provider(),
                            images,
                            current.cachedBytes()
                                    + (STATUS_CACHED.equals(count.status()) ? count.bytes() : 0)));
        }
        return new CardImageCacheStatus(
                usage.usedBytes(),
                reserved,
                remaining,
                limitBytes(),
                CardImageCacheStatus.mb(usage.usedBytes()),
                CardImageCacheStatus.mb(reserved),
                CardImageCacheStatus.mb(remaining),
                properties.maxMb(),
                usage.fileCount(),
                repository.reservationCount(now),
                CardImageCacheRepository.byStatus(counts),
                List.copyOf(games.values()),
                usage.reconciledAt());
    }

    // -------------------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------------------

    @Override
    public void destroy() {
        downloads.shutdownNow();
        watchdog.shutdownNow();
    }

    /** Waits until no download of this instance is running (tests). */
    public void awaitIdle(Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        Collection<CompletableFuture<Result>> running = List.copyOf(inFlight.values());
        for (CompletableFuture<Result> future : running) {
            long left = deadline - System.nanoTime();
            if (left <= 0) {
                return;
            }
            try {
                future.get(left, TimeUnit.NANOSECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (ExecutionException | TimeoutException e) {
                // keep waiting for the others
            }
        }
    }

    private static void closeQuietly(ImageDownload download) {
        try {
            download.close();
        } catch (IOException | RuntimeException e) {
            // already closed
        }
    }

    private static String safeType(String type) {
        String cleaned = type.replaceAll("[^A-Za-z0-9/+.;= -]", "");
        return cleaned.length() > 60 ? cleaned.substring(0, 60) : cleaned;
    }

    private static ThreadFactory daemonThreads(String prefix) {
        AtomicInteger counter = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }
}
