package com.orenjitrade.api.cards.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.domain.images.CardImageCache;
import com.orenjitrade.api.cards.domain.images.CardImageCacheStatus;
import com.orenjitrade.api.cards.domain.images.ImageFillResult;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderMarketPrice;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderRequestException;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.ProviderUnavailableException;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.domain.provider.SyncOptions;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.events.CatalogImportedEvent;
import com.orenjitrade.api.cards.events.CatalogSyncRequestedEvent;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository.CardImageLink;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository.CardWrite;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository.PrintingState;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository.PrintingValues;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository.PrintingWrite;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository.ProviderImageWrite;
import com.orenjitrade.api.cards.infra.SyncRunRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Imports a provider catalog into {@code card_set}, {@code card}, {@code card_printing} and {@code
 * card_image} idempotently: rows are keyed by {@code external_ref} (sets by game + code; printings
 * fall back to their variant key, artworks to provider + image id), only rewritten when a value
 * differs, and card slugs never change once assigned (stable image and page URLs). A second import
 * of the same data changes nothing and reports zero upserts.
 *
 * <p>Admin and internal syncs are asynchronous: {@link #requestSync} records a QUEUED {@code
 * catalog_sync_run} and publishes {@link CatalogSyncRequestedEvent} in the same transaction; the
 * module listener then calls {@link #execute} (idempotent: only a QUEUED run starts). The local/dev
 * seed imports synchronously through {@link #importNow}.
 *
 * <p>A run (ADR 0015) fetches the provider catalog (a provider outage marks the run FAILED with a
 * clear message; the catalog already imported stays untouched), imports the metadata in chunks of
 * {@value #CHUNK_SIZE} cards (one transaction each under a per-game advisory lock; a failing chunk
 * is retried card by card, so one bad card never fails the catalog), then fills the local image
 * cache according to the run's {@link ImageMode} (never failing the run: a full cache is reported
 * as {@code cacheLimitReached}). The run stores a {@link CatalogImportReport}.
 */
@Service
public class CatalogImportService {

    public static final String ACTION_SYNC = "catalog.sync.request";
    public static final String TARGET_CATALOG = "CATALOG";

    static final int CHUNK_SIZE = 500;

    /** QUEUED runs older than this are considered lost (their event is republished anyway). */
    static final Duration QUEUED_RUN_WINDOW = Duration.ofMinutes(10);

    private static final Logger log = LoggerFactory.getLogger(CatalogImportService.class);

    private static final Pattern SET_CODE = Pattern.compile("^[A-Z0-9]{2,10}$");
    private static final Pattern CODE = Pattern.compile("^[A-Z][A-Z0-9_]{1,31}$");
    private static final Pattern LANGUAGE = Pattern.compile("^[a-z]{2}$");
    private static final Pattern CURRENCY = Pattern.compile("^[A-Z]{3}$");

    private final Map<String, CardProvider> providers = new LinkedHashMap<>();
    private final GameService gameService;
    private final CatalogWriteRepository writes;
    private final SyncRunRepository runs;
    private final AuditService auditService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final CardImageCache imageCache;
    private final TransactionTemplate newTransaction;
    private final Map<String, ReentrantLock> gameLocks = new ConcurrentHashMap<>();

    public CatalogImportService(
            List<CardProvider> providers,
            GameService gameService,
            CatalogWriteRepository writes,
            SyncRunRepository runs,
            AuditService auditService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            CardImageCache imageCache,
            PlatformTransactionManager transactionManager) {
        providers.forEach(provider -> this.providers.put(provider.providerId(), provider));
        this.gameService = gameService;
        this.writes = writes;
        this.runs = runs;
        this.auditService = auditService;
        this.events = events;
        this.timeProvider = timeProvider;
        this.imageCache = imageCache;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Registered providers by id with the games they serve. */
    public Map<String, List<String>> providers() {
        Map<String, List<String>> result = new LinkedHashMap<>();
        providers.forEach(
                (id, provider) ->
                        result.put(id, provider.supportedGameSlugs().stream().sorted().toList()));
        return result;
    }

    /** REFERENCED for providers whose artworks can be cached, NONE otherwise. */
    public ImageMode defaultImageMode(String providerId) {
        CardProvider provider = providers.get(providerId);
        return provider != null && provider.supportsImageDownloads()
                ? ImageMode.REFERENCED
                : ImageMode.NONE;
    }

    // ---------------------------------------------------------------------------------------
    // Requests
    // ---------------------------------------------------------------------------------------

    /** Queues an asynchronous sync without image downloads (admin, audited). */
    @Transactional
    public SyncRunView requestSync(
            AuthenticatedUser actor, String gameSlug, String providerId, SyncMode mode) {
        return requestSync(actor, gameSlug, providerId, mode, ImageMode.NONE, null);
    }

    /** Queues an asynchronous sync (admin, audited); returns the QUEUED run. */
    @Transactional
    public SyncRunView requestSync(
            AuthenticatedUser actor,
            String gameSlug,
            String providerId,
            SyncMode mode,
            ImageMode imageMode,
            @Nullable Integer imageLimit) {
        return queue(
                ActorType.ADMIN, actor.userId(), gameSlug, providerId, mode, imageMode, imageLimit);
    }

    /** Queues an asynchronous sync for an internal job (service token; audited as SYSTEM). */
    @Transactional
    public SyncRunView requestSystemSync(
            String gameSlug,
            String providerId,
            SyncMode mode,
            ImageMode imageMode,
            @Nullable Integer imageLimit) {
        return queue(ActorType.SYSTEM, null, gameSlug, providerId, mode, imageMode, imageLimit);
    }

    private SyncRunView queue(
            ActorType actorType,
            @Nullable UUID actorId,
            String gameSlug,
            String providerId,
            SyncMode mode,
            ImageMode imageMode,
            @Nullable Integer imageLimit) {
        String slug = gameSlug.trim().toLowerCase(Locale.ROOT);
        CardProvider provider = provider(providerId, slug);
        validateImageMode(imageMode, imageLimit);
        GameView game =
                gameService
                        .find(slug)
                        .orElseThrow(() -> invalid("gameSlug", "unknown game " + slug));
        Instant now = timeProvider.now();
        ReentrantLock running = gameLocks.get(game.slug());
        if ((running != null && running.isLocked())
                || runs.queuedRun(game.id(), now.minus(QUEUED_RUN_WINDOW)).isPresent()) {
            throw ApiException.conflict("An import of this game is already queued or running");
        }
        UUID runId = UUID.randomUUID();
        runs.insertQueued(
                runId, provider.providerId(), game.id(), mode, actorId, now, imageMode, imageLimit);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("game", game.slug());
        details.put("provider", provider.providerId());
        details.put("mode", mode.name());
        details.put("imageMode", imageMode.name());
        if (imageMode == ImageMode.LIMIT) {
            details.put("imageLimit", imageLimit);
        }
        auditService.record(
                actorType, actorId, ACTION_SYNC, TARGET_CATALOG, runId.toString(), details);
        events.publishEvent(new CatalogSyncRequestedEvent(runId, now));
        return runs.find(runId).orElseThrow();
    }

    /** Imports synchronously without image downloads (local/dev seed, tests). */
    public SyncRunView importNow(String providerId, String gameSlug, SyncMode mode) {
        return importNow(providerId, gameSlug, mode, ImageMode.NONE, null);
    }

    /** Imports synchronously (tests, tools) and returns the finished run. */
    public SyncRunView importNow(
            String providerId,
            String gameSlug,
            SyncMode mode,
            ImageMode imageMode,
            @Nullable Integer imageLimit) {
        CardProvider provider = provider(providerId, gameSlug);
        validateImageMode(imageMode, imageLimit);
        GameView game =
                gameService
                        .find(gameSlug)
                        .orElseThrow(
                                () -> new IllegalArgumentException("Unknown game " + gameSlug));
        UUID runId = UUID.randomUUID();
        newTransaction.executeWithoutResult(
                status ->
                        runs.insertQueued(
                                runId,
                                provider.providerId(),
                                game.id(),
                                mode,
                                null,
                                timeProvider.now(),
                                imageMode,
                                imageLimit));
        execute(runId);
        return runs.find(runId).orElseThrow();
    }

    private static void validateImageMode(ImageMode imageMode, @Nullable Integer imageLimit) {
        if (imageMode == ImageMode.LIMIT && (imageLimit == null || imageLimit < 1)) {
            throw invalid("imageLimit", "required (at least 1) with imageMode LIMIT");
        }
        if (imageMode != ImageMode.LIMIT && imageLimit != null) {
            throw invalid("imageLimit", "only allowed with imageMode LIMIT");
        }
        if (imageLimit != null && imageLimit > 1_000_000) {
            throw invalid("imageLimit", "at most 1000000");
        }
    }

    // ---------------------------------------------------------------------------------------
    // Execution
    // ---------------------------------------------------------------------------------------

    /**
     * Runs a QUEUED import; does nothing when the run was already started (redelivered event).
     * Never throws for provider or data errors: they are recorded on the run.
     */
    public void execute(UUID runId) {
        Boolean started =
                newTransaction.execute(status -> runs.markRunning(runId, timeProvider.now()));
        if (!Boolean.TRUE.equals(started)) {
            log.debug("Catalog sync run {} already started; skipping", runId);
            return;
        }
        SyncRunView run = runs.find(runId).orElseThrow();
        Instant start = timeProvider.now();
        Report report = new Report(run.provider(), run.imageMode(), run.imageLimit());
        ReentrantLock lock = gameLocks.computeIfAbsent(run.game(), slug -> new ReentrantLock());
        lock.lock();
        try {
            CardProvider provider = provider(run.provider(), run.game());
            GameView game = gameService.find(run.game()).orElseThrow();
            // Runs of this game still RUNNING were interrupted (this JVM holds the game's lock).
            newTransaction.executeWithoutResult(
                    status -> runs.failInterrupted(game.id(), runId, timeProvider.now()));
            Optional<Instant> since = runs.lastSuccessfulStart(run.provider(), game.id());
            SyncResult result =
                    provider.syncCards(
                            run.game(),
                            new SyncOptions(
                                    run.mode(),
                                    run.mode() == SyncMode.INCREMENTAL
                                            ? since.orElse(null)
                                            : null));
            report.providerDbVersion = result.providerVersion();
            result.warnings().forEach(report::warning);
            report.totalCards = result.cards().size();
            progress(runId, "METADATA", report, start);

            Counts counts = importMetadata(provider, game, result, report);
            log.info(
                    "Catalog sync {} {} {}: {} sets, {} cards ({} new, {} updated), {} printings"
                            + " upserted",
                    run.provider(),
                    run.game(),
                    run.mode(),
                    counts.sets(),
                    counts.cards(),
                    report.cardsCreated,
                    report.cardsUpdated,
                    counts.printings());
            try {
                events.publishEvent(
                        new CatalogImportedEvent(
                                runId, run.provider(), run.game(), timeProvider.now()));
            } catch (RuntimeException e) {
                log.warn("A listener of the catalog import of {} failed", run.game(), e);
                report.error("post-import hook failed (" + e.getClass().getSimpleName() + ")");
            }

            report.imagesReferenced = imageCache.countProviderImages(game.id(), run.provider());
            if (run.imageMode() != ImageMode.NONE && provider.supportsImageDownloads()) {
                progress(runId, "IMAGES", report, start);
                try {
                    report.fill =
                            imageCache.fillForImport(
                                    game.id(), run.provider(), run.imageMode(), run.imageLimit());
                    report.fill.errors().forEach(report::error);
                } catch (RuntimeException e) {
                    log.error("Image cache fill of run {} failed", runId, e);
                    report.error(
                            "image cache fill interrupted (" + e.getClass().getSimpleName() + ")");
                }
            }
            CatalogImportReport finalReport =
                    report.build(imageCache.status(), start, timeProvider.now());
            newTransaction.executeWithoutResult(
                    status ->
                            runs.markSucceeded(
                                    runId,
                                    counts.sets(),
                                    counts.cards(),
                                    counts.printings(),
                                    timeProvider.now(),
                                    finalReport));
        } catch (ProviderUnavailableException e) {
            log.error("Catalog sync run {} failed: provider unavailable", runId, e);
            fail(
                    runId,
                    run.provider()
                            + " is unavailable: "
                            + e.getMessage()
                            + ". The catalog already imported was kept; retry later.",
                    report,
                    start);
        } catch (ProviderRequestException e) {
            log.error("Catalog sync run {} failed: provider refused", runId, e);
            fail(
                    runId,
                    run.provider()
                            + " request failed: "
                            + e.getMessage()
                            + ". The catalog already imported was kept.",
                    report,
                    start);
        } catch (RuntimeException e) {
            log.error("Catalog sync run {} failed", runId, e);
            fail(
                    runId,
                    "Import failed ("
                            + e.getClass().getSimpleName().replaceAll("[^A-Za-z]", "")
                            + ")",
                    report,
                    start);
        } finally {
            lock.unlock();
        }
    }

    private void fail(UUID runId, String message, Report report, Instant start) {
        report.error(message);
        CatalogImportReport partial;
        try {
            partial = report.build(imageCache.status(), start, timeProvider.now());
        } catch (RuntimeException e) {
            partial = null;
        }
        CatalogImportReport finalReport = partial;
        newTransaction.executeWithoutResult(
                status -> runs.markFailed(runId, message, timeProvider.now(), finalReport));
    }

    private void progress(UUID runId, String phase, Report report, Instant start) {
        try {
            CatalogImportReport snapshot = report.build(null, start, timeProvider.now());
            newTransaction.executeWithoutResult(
                    status -> runs.markProgress(runId, phase, report.providerDbVersion, snapshot));
        } catch (RuntimeException e) {
            log.debug("Could not record the progress of run {}", runId, e);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Metadata
    // ---------------------------------------------------------------------------------------

    private Counts importMetadata(
            CardProvider provider, GameView game, SyncResult result, Report report) {
        String providerId = provider.providerId();
        Instant now = timeProvider.now();
        Map<String, UUID> setIds =
                newTransaction.execute(
                        status -> {
                            writes.lockGameImport(game.id());
                            return importSets(providerId, game, result.sets(), now, report);
                        });
        if (setIds == null) {
            throw new IllegalStateException("Set import returned nothing");
        }
        State state = loadState(game.id(), providerId);
        List<ProviderCard> cards = result.cards();
        for (int from = 0; from < cards.size(); from += CHUNK_SIZE) {
            List<ProviderCard> chunk =
                    cards.subList(from, Math.min(cards.size(), from + CHUNK_SIZE));
            try {
                Plan plan = writeChunk(chunk, providerId, game, setIds, state, now);
                state.apply(plan);
                report.add(plan);
            } catch (RuntimeException e) {
                log.warn(
                        "Catalog chunk {}..{} of {} failed ({}); retrying card by card",
                        from,
                        from + chunk.size(),
                        game.slug(),
                        e.getClass().getSimpleName());
                for (ProviderCard card : chunk) {
                    try {
                        Plan plan = writeChunk(List.of(card), providerId, game, setIds, state, now);
                        state.apply(plan);
                        report.add(plan);
                    } catch (RuntimeException single) {
                        report.cardsFailed++;
                        report.error(
                                "card "
                                        + card.externalId()
                                        + " ("
                                        + abbreviate(card.name())
                                        + ") skipped: "
                                        + single.getClass().getSimpleName());
                    }
                }
            }
        }
        return new Counts(
                report.setsUpserted,
                report.cardsCreated + report.cardsUpdated,
                report.printingsUpserted);
    }

    private Map<String, UUID> importSets(
            String providerId, GameView game, List<ProviderSet> sets, Instant now, Report report) {
        Map<String, UUID> setIds = new HashMap<>();
        for (ProviderSet set : sets) {
            String code = set.code().trim().toUpperCase(Locale.ROOT);
            if (!SET_CODE.matcher(code).matches()) {
                report.warning("set " + abbreviate(code) + " skipped: invalid set code");
                continue;
            }
            String name = set.name() == null ? "" : set.name().trim();
            if (name.isEmpty()) {
                name = code;
            }
            if (name.length() > 120) {
                name = name.substring(0, 120).trim();
            }
            Optional<CatalogWriteRepository.SetRef> existing = writes.findSetRef(game.id(), code);
            if (existing.isPresent()
                    && existing.get().provider() != null
                    && !providerId.equals(existing.get().provider())) {
                report.warning(
                        "set "
                                + code
                                + " skipped: the code belongs to provider "
                                + existing.get().provider());
                continue;
            }
            CatalogWriteRepository.Upsert upsert =
                    writes.upsertSet(
                            game.id(),
                            code,
                            name,
                            set.releaseDate(),
                            set.totalCards() == null || set.totalCards() < 0
                                    ? null
                                    : set.totalCards(),
                            set.series(),
                            set.metadata(),
                            ref(providerId, set.externalId()),
                            now);
            setIds.put(code, upsert.id());
            if (upsert.changed()) {
                report.setsUpserted++;
            }
        }
        return setIds;
    }

    private State loadState(UUID gameId, String providerId) {
        State state = new State();
        state.cardIds.putAll(writes.cardIdsByExternalRef(gameId, providerId));
        state.cardImages.putAll(writes.cardImageIds(gameId));
        state.slugs.addAll(writes.slugs(gameId));
        for (PrintingState printing : writes.printingStates(gameId)) {
            state.variants.put(printing.variantKey(), printing);
            if (providerId.equals(printing.provider()) && printing.externalId() != null) {
                state.printings.put(printing.externalId(), printing);
            }
        }
        state.images.putAll(writes.providerImageIds(providerId));
        return state;
    }

    /** Plans one chunk against the state and writes it in one transaction. */
    private Plan writeChunk(
            List<ProviderCard> chunk,
            String providerId,
            GameView game,
            Map<String, UUID> setIds,
            State state,
            Instant now) {
        Plan plan = new Plan(state, providerId, game);
        for (ProviderCard card : chunk) {
            plan.card(card, setIds, this::existingSetId);
        }
        Plan written =
                newTransaction.execute(
                        status -> {
                            writes.lockGameImport(game.id());
                            plan.execute(writes, now);
                            return plan;
                        });
        if (written == null) {
            throw new IllegalStateException("Chunk import returned nothing");
        }
        return written;
    }

    /** A set of the game not delivered by this sync, unless another provider owns it. */
    private @Nullable UUID existingSetId(GameView game, String providerId, String code) {
        return writes.findSetRef(game.id(), code)
                .filter(set -> set.provider() == null || providerId.equals(set.provider()))
                .map(CatalogWriteRepository.SetRef::id)
                .orElse(null);
    }

    /** A slug of {@code name} not used by another card of the game. */
    String freeSlug(UUID gameId, String name) {
        String base = CatalogText.slug(name);
        if (!writes.slugExists(gameId, base)) {
            return base;
        }
        for (int n = 2; n < 1000; n++) {
            String candidate = CatalogText.slugWithSuffix(base, n);
            if (!writes.slugExists(gameId, candidate)) {
                return candidate;
            }
        }
        return CatalogText.slugWithSuffix(base, (int) (System.nanoTime() % 1_000_000));
    }

    static String freeSlug(java.util.function.Predicate<String> taken, String name) {
        String base = CatalogText.slug(name);
        if (!taken.test(base)) {
            return base;
        }
        for (int n = 2; n < 100_000; n++) {
            String candidate = CatalogText.slugWithSuffix(base, n);
            if (!taken.test(candidate)) {
                return candidate;
            }
        }
        return CatalogText.slugWithSuffix(base, (int) (System.nanoTime() % 1_000_000));
    }

    private CardProvider provider(String providerId, String gameSlug) {
        CardProvider provider = providers.get(providerId);
        if (provider == null) {
            throw invalid("provider", "unknown provider; available: " + providers.keySet());
        }
        if (!provider.supportedGameSlugs().contains(gameSlug)) {
            throw invalid("gameSlug", "the provider does not serve this game");
        }
        return provider;
    }

    static Map<String, String> ref(String providerId, String externalId) {
        Map<String, String> ref = new LinkedHashMap<>();
        ref.put("provider", providerId);
        ref.put("id", externalId);
        return ref;
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    private static String abbreviate(@Nullable String value) {
        if (value == null) {
            return "";
        }
        String clean = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return clean.length() > 60 ? clean.substring(0, 60) + "…" : clean;
    }

    /** Rows inserted or changed by one import. */
    record Counts(int sets, int cards, int printings) {}

    // ---------------------------------------------------------------------------------------
    // Import state and chunk plans
    // ---------------------------------------------------------------------------------------

    /** What the database holds for the game, kept in memory for the whole import. */
    static final class State {
        final Map<String, UUID> cardIds = new HashMap<>();
        final Map<UUID, UUID> cardImages = new HashMap<>();
        final Set<String> slugs = new HashSet<>();
        final Map<String, PrintingState> printings = new HashMap<>();
        final Map<String, PrintingState> variants = new HashMap<>();
        final Map<String, UUID> images = new HashMap<>();

        /** Applies a committed plan. */
        void apply(Plan plan) {
            cardIds.putAll(plan.newCardIds);
            slugs.addAll(plan.newSlugs);
            plan.oldVariants.forEach(variants::remove);
            variants.putAll(plan.newVariants);
            printings.putAll(plan.newPrintings);
            images.putAll(plan.newImages);
            cardImages.putAll(plan.newCardImages);
        }
    }

    /** Functional lookup of sets the sync did not deliver. */
    @FunctionalInterface
    interface SetLookup {
        @Nullable UUID find(GameView game, String providerId, String code);
    }

    /** The writes of one chunk, planned against the state (plus its own overlay). */
    static final class Plan {
        private final State state;
        private final String providerId;
        private final GameView game;

        final List<CardWrite> cardInserts = new ArrayList<>();
        final List<CardWrite> cardUpdates = new ArrayList<>();
        final List<PrintingWrite> printingInserts = new ArrayList<>();
        final List<PrintingWrite> printingUpdates = new ArrayList<>();
        final List<ProviderImageWrite> imageInserts = new ArrayList<>();
        final List<ProviderImageWrite> imageUpdates = new ArrayList<>();
        final List<CardImageLink> links = new ArrayList<>();
        final List<PrintingImageWrite> printingImages = new ArrayList<>();

        final Map<String, UUID> newCardIds = new HashMap<>();
        final Set<String> newSlugs = new HashSet<>();
        final Map<String, PrintingState> newVariants = new HashMap<>();
        final Set<String> oldVariants = new HashSet<>();
        final Map<String, PrintingState> newPrintings = new HashMap<>();
        final Map<String, UUID> newImages = new HashMap<>();
        final Map<UUID, UUID> newCardImages = new HashMap<>();
        final Map<UUID, String> cardExternalIds = new HashMap<>();

        final Set<UUID> changedCards = new LinkedHashSet<>();
        final Set<UUID> changedPrintings = new LinkedHashSet<>();
        int cardsCreated;
        int cardsUpdated;
        int printingsSkipped;
        final List<String> warnings = new ArrayList<>();
        final List<String> errors = new ArrayList<>();
        int cards;

        Plan(State state, String providerId, GameView game) {
            this.state = state;
            this.providerId = providerId;
            this.game = game;
        }

        private @Nullable UUID cardId(String externalId) {
            UUID id = newCardIds.get(externalId);
            return id != null ? id : state.cardIds.get(externalId);
        }

        private @Nullable PrintingState printing(String externalId) {
            PrintingState printing = newPrintings.get(externalId);
            return printing != null ? printing : state.printings.get(externalId);
        }

        private @Nullable PrintingState variant(String key) {
            PrintingState printing = newVariants.get(key);
            if (printing != null) {
                return printing;
            }
            return oldVariants.contains(key) ? null : state.variants.get(key);
        }

        private @Nullable UUID image(String providerImageId) {
            UUID id = newImages.get(providerImageId);
            return id != null ? id : state.images.get(providerImageId);
        }

        void card(ProviderCard card, Map<String, UUID> setIds, SetLookup sets) {
            cards++;
            String name = card.name() == null ? "" : card.name().trim();
            if (name.isEmpty()) {
                errors.add("card " + abbreviate(card.externalId()) + " skipped: no name");
                return;
            }
            if (name.length() > 150) {
                name = name.substring(0, 150).trim();
            }
            String text =
                    card.text().length() > 4000 ? card.text().substring(0, 4000) : card.text();
            UUID existing = cardId(card.externalId());
            UUID cardId;
            if (existing != null) {
                cardId = existing;
                cardUpdates.add(
                        new CardWrite(
                                cardId,
                                game.id(),
                                name,
                                "",
                                card.cardType(),
                                card.subtype(),
                                text,
                                card.metadata(),
                                null));
            } else {
                cardId = UUID.randomUUID();
                String slug =
                        freeSlug(
                                candidate ->
                                        state.slugs.contains(candidate)
                                                || newSlugs.contains(candidate),
                                name);
                newSlugs.add(slug);
                newCardIds.put(card.externalId(), cardId);
                cardInserts.add(
                        new CardWrite(
                                cardId,
                                game.id(),
                                name,
                                slug,
                                card.cardType(),
                                card.subtype(),
                                text,
                                card.metadata(),
                                ref(providerId, card.externalId())));
                cardsCreated++;
            }
            cardExternalIds.put(cardId, card.externalId());

            for (ProviderPrinting printing : card.printings()) {
                printing(cardId, printing, setIds, sets);
            }

            List<UUID> artworks = new ArrayList<>();
            int position = 0;
            for (ProviderImage image : card.images()) {
                if (image.providerImageId() == null
                        || !image.providerImageId().matches("^[A-Za-z0-9._-]{1,64}$")
                        || image.url() == null
                        || image.url().isBlank()
                        || image.url().length() > 1000) {
                    warnings.add(
                            "artwork of card "
                                    + abbreviate(card.externalId())
                                    + " skipped: invalid");
                    continue;
                }
                ProviderImageWrite write;
                UUID imageId = image(image.providerImageId());
                if (imageId == null) {
                    imageId = UUID.randomUUID();
                    newImages.put(image.providerImageId(), imageId);
                    write =
                            new ProviderImageWrite(
                                    imageId,
                                    game.id(),
                                    cardId,
                                    kind(image.kind()),
                                    providerId,
                                    image.providerImageId(),
                                    position,
                                    image.url());
                    imageInserts.add(write);
                    changedCards.add(cardId);
                } else {
                    write =
                            new ProviderImageWrite(
                                    imageId,
                                    game.id(),
                                    cardId,
                                    kind(image.kind()),
                                    providerId,
                                    image.providerImageId(),
                                    position,
                                    image.url());
                    imageUpdates.add(write);
                }
                artworks.add(imageId);
                position++;
            }
            if (!artworks.isEmpty()) {
                UUID primary = artworks.get(0);
                if (!primary.equals(state.cardImages.get(cardId))) {
                    links.add(new CardImageLink(cardId, primary));
                    newCardImages.put(cardId, primary);
                }
            }
        }

        private static String kind(@Nullable String kind) {
            return kind == null || !Set.of("FRONT", "BACK", "ART_CROP").contains(kind)
                    ? "FRONT"
                    : kind;
        }

        private void printing(
                UUID cardId, ProviderPrinting printing, Map<String, UUID> setIds, SetLookup sets) {
            String setCode = printing.setCode().trim().toUpperCase(Locale.ROOT);
            UUID setId = setIds.get(setCode);
            if (setId == null) {
                setId = sets.find(game, providerId, setCode);
                if (setId != null) {
                    setIds.put(setCode, setId);
                }
            }
            if (setId == null) {
                printingsSkipped++;
                warnings.add(
                        "printing "
                                + abbreviate(printing.externalId())
                                + " skipped: unknown set "
                                + abbreviate(setCode));
                return;
            }
            @Nullable PrintingValues values = values(printing);
            if (values == null) {
                printingsSkipped++;
                warnings.add(
                        "printing "
                                + abbreviate(printing.externalId())
                                + " skipped: invalid values");
                return;
            }
            String key =
                    CatalogWriteRepository.variantKey(
                            setId,
                            values.collectorNumber(),
                            values.edition(),
                            values.language(),
                            values.finish(),
                            values.rarity());
            PrintingState known = printing(printing.externalId());
            PrintingState owner = variant(key);
            UUID printingId;
            if (known != null) {
                if (owner != null && !owner.id().equals(known.id())) {
                    printingsSkipped++;
                    warnings.add(
                            "printing "
                                    + abbreviate(printing.externalId())
                                    + " skipped: its attributes duplicate another printing");
                    return;
                }
                printingId = known.id();
                printingUpdates.add(new PrintingWrite(printingId, cardId, setId, values));
                if (!key.equals(known.variantKey())) {
                    oldVariants.add(known.variantKey());
                }
            } else if (owner != null) {
                boolean adoptable =
                        owner.provider() == null
                                || (providerId.equals(owner.provider())
                                        && owner.cardId().equals(cardId));
                if (!adoptable) {
                    printingsSkipped++;
                    warnings.add(
                            "printing "
                                    + abbreviate(printing.externalId())
                                    + " skipped: the same printing exists for another card");
                    return;
                }
                printingId = owner.id();
                printingUpdates.add(new PrintingWrite(printingId, cardId, setId, values));
            } else {
                printingId = UUID.randomUUID();
                printingInserts.add(new PrintingWrite(printingId, cardId, setId, values));
                changedPrintings.add(printingId);
            }
            PrintingState state =
                    new PrintingState(printingId, cardId, key, providerId, printing.externalId());
            newVariants.put(key, state);
            newPrintings.put(printing.externalId(), state);
            for (ProviderImage image : printing.images()) {
                if (image.url() != null && !image.url().isBlank() && image.url().length() <= 1000) {
                    printingImages.add(new PrintingImageWrite(cardId, printingId, image));
                }
            }
        }

        private @Nullable PrintingValues values(ProviderPrinting printing) {
            String number =
                    printing.collectorNumber() == null ? "" : printing.collectorNumber().trim();
            String edition =
                    printing.edition() == null
                            ? ""
                            : printing.edition().trim().toUpperCase(Locale.ROOT);
            String language =
                    printing.language() == null
                            ? ""
                            : printing.language().trim().toLowerCase(Locale.ROOT);
            String finish =
                    printing.finish() == null
                            ? ""
                            : printing.finish().trim().toUpperCase(Locale.ROOT);
            @Nullable String code = CatalogText.normalisePrintingCode(printing.printingCode());
            @Nullable String rarity =
                    printing.rarity() == null || printing.rarity().isBlank()
                            ? null
                            : printing.rarity().trim();
            if (number.isEmpty()
                    || number.length() > 20
                    || !CODE.matcher(edition).matches()
                    || !CODE.matcher(finish).matches()
                    || !LANGUAGE.matcher(language).matches()
                    || (code != null && !CatalogText.PRINTING_CODE.matcher(code).matches())
                    || (rarity != null && rarity.length() > 100)) {
                return null;
            }
            @Nullable ProviderMarketPrice price = printing.marketPrice();
            if (price != null
                    && (price.amount() == null
                            || price.amount().signum() < 0
                            || price.currency() == null
                            || !CURRENCY.matcher(price.currency()).matches()
                            || price.updatedAt() == null)) {
                price = null;
            }
            return new PrintingValues(
                    number,
                    rarity,
                    edition,
                    language,
                    finish,
                    code,
                    price == null ? null : price.amount(),
                    price == null ? null : price.currency(),
                    price == null ? null : price.updatedAt(),
                    printing.metadata(),
                    ref(providerId, printing.externalId()));
        }

        /** Executes the planned writes (inside the caller's transaction) and counts changes. */
        void execute(CatalogWriteRepository writes, Instant now) {
            writes.insertCards(cardInserts, now);
            int[] cardCounts = writes.updateCards(cardUpdates, now);
            for (int i = 0; i < cardCounts.length; i++) {
                if (cardCounts[i] != 0) {
                    changedCards.add(cardUpdates.get(i).id());
                }
            }
            writes.insertPrintings(printingInserts, now);
            int[] printingCounts = writes.updatePrintings(printingUpdates, now);
            for (int i = 0; i < printingCounts.length; i++) {
                if (printingCounts[i] != 0) {
                    changedPrintings.add(printingUpdates.get(i).id());
                }
            }
            writes.insertProviderImages(imageInserts, now);
            int[] imageCounts = writes.updateProviderImages(imageUpdates, now);
            for (int i = 0; i < imageCounts.length; i++) {
                if (imageCounts[i] != 0) {
                    changedCards.add(imageUpdates.get(i).cardId());
                }
            }
            int[] linkCounts = writes.linkCardImages(links, now);
            for (int i = 0; i < linkCounts.length; i++) {
                if (linkCounts[i] != 0) {
                    changedCards.add(links.get(i).cardId());
                }
            }
            for (PrintingImageWrite image : printingImages) {
                if (writes.upsertImage(
                        game.id(),
                        image.cardId(),
                        image.printingId(),
                        kind(image.image().kind()),
                        image.image().url(),
                        image.image().width(),
                        image.image().height(),
                        image.image().source(),
                        now)) {
                    changedPrintings.add(image.printingId());
                }
            }
            Set<UUID> created = new HashSet<>(newCardIds.values());
            cardsUpdated = (int) changedCards.stream().filter(id -> !created.contains(id)).count();
        }
    }

    /** A printing-specific image (placeholders of the mock catalog). */
    record PrintingImageWrite(UUID cardId, UUID printingId, ProviderImage image) {}

    // ---------------------------------------------------------------------------------------
    // Report
    // ---------------------------------------------------------------------------------------

    /** Mutable report of a run. */
    static final class Report {
        final String provider;
        final ImageMode imageMode;
        final @Nullable Integer imageLimit;
        @Nullable String providerDbVersion;
        int totalCards;
        int cardsCreated;
        int cardsUpdated;
        int cardsFailed;
        int setsUpserted;
        int printingsUpserted;
        int printingsSkipped;
        long imagesReferenced;
        @Nullable ImageFillResult fill;
        final List<String> errors = new ArrayList<>();
        final List<String> warnings = new ArrayList<>();
        int processed;

        Report(String provider, ImageMode imageMode, @Nullable Integer imageLimit) {
            this.provider = provider;
            this.imageMode = imageMode;
            this.imageLimit = imageLimit;
        }

        void add(Plan plan) {
            processed += plan.cards - plan.errors.size();
            cardsCreated += plan.cardsCreated;
            cardsUpdated += plan.cardsUpdated;
            printingsUpserted += plan.changedPrintings.size();
            printingsSkipped += plan.printingsSkipped;
            plan.errors.forEach(this::error);
            cardsFailed += plan.errors.size();
            plan.warnings.forEach(this::warning);
        }

        void error(String message) {
            if (errors.size() < CatalogImportReport.MAX_MESSAGES) {
                errors.add(message);
            }
        }

        void warning(String message) {
            if (warnings.size() < CatalogImportReport.MAX_MESSAGES) {
                warnings.add(message);
            }
        }

        CatalogImportReport build(
                @Nullable CardImageCacheStatus cache, Instant start, Instant end) {
            ImageFillResult images = fill == null ? ImageFillResult.none() : fill;
            int unchanged = Math.max(0, processed - cardsCreated - cardsUpdated);
            double duration = Math.round(Duration.between(start, end).toMillis() / 100.0) / 10.0;
            return new CatalogImportReport(
                    provider,
                    providerDbVersion,
                    imageMode,
                    imageLimit,
                    totalCards,
                    cardsCreated,
                    cardsUpdated,
                    unchanged,
                    cardsFailed,
                    setsUpserted,
                    printingsUpserted,
                    printingsSkipped,
                    imagesReferenced,
                    images.selected(),
                    images.alreadyCached(),
                    images.downloaded(),
                    images.deduplicated(),
                    images.skippedCacheFull(),
                    images.failed(),
                    images.missingAtSource(),
                    images.bytesDownloaded(),
                    cache == null ? 0 : cache.usedMb(),
                    cache == null ? 0 : cache.reservedMb(),
                    cache == null ? 0 : cache.limitMb(),
                    images.cacheLimitReached(),
                    duration,
                    errors,
                    warnings);
        }
    }
}
