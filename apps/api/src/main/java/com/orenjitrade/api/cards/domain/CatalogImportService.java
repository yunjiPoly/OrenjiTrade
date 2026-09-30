package com.orenjitrade.api.cards.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.domain.provider.ProviderCard;
import com.orenjitrade.api.cards.domain.provider.ProviderImage;
import com.orenjitrade.api.cards.domain.provider.ProviderMarketPrice;
import com.orenjitrade.api.cards.domain.provider.ProviderPrinting;
import com.orenjitrade.api.cards.domain.provider.ProviderSet;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import com.orenjitrade.api.cards.domain.provider.SyncOptions;
import com.orenjitrade.api.cards.domain.provider.SyncResult;
import com.orenjitrade.api.cards.events.CatalogSyncRequestedEvent;
import com.orenjitrade.api.cards.infra.CatalogWriteRepository;
import com.orenjitrade.api.cards.infra.SyncRunRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
 * fall back to their variant key), only rewritten when a value differs, and card slugs never change
 * once assigned (stable image and page URLs). A second import of the same data changes nothing and
 * reports zero upserts.
 *
 * <p>Admin syncs are asynchronous: {@link #requestSync} records a QUEUED {@code catalog_sync_run}
 * and publishes {@link CatalogSyncRequestedEvent} in the same transaction; the module listener then
 * calls {@link #execute} (idempotent: only a QUEUED run starts). The local/dev seed imports
 * synchronously through {@link #importNow}. Each import runs in one transaction under a per-game
 * advisory lock; a failure rolls the data back and marks the run FAILED with a safe message.
 */
@Service
public class CatalogImportService {

    public static final String ACTION_SYNC = "catalog.sync.request";
    public static final String TARGET_CATALOG = "CATALOG";

    private static final Logger log = LoggerFactory.getLogger(CatalogImportService.class);

    private final Map<String, CardProvider> providers = new LinkedHashMap<>();
    private final GameService gameService;
    private final CatalogWriteRepository writes;
    private final SyncRunRepository runs;
    private final AuditService auditService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;
    private final TransactionTemplate newTransaction;

    public CatalogImportService(
            List<CardProvider> providers,
            GameService gameService,
            CatalogWriteRepository writes,
            SyncRunRepository runs,
            AuditService auditService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider,
            PlatformTransactionManager transactionManager) {
        providers.forEach(provider -> this.providers.put(provider.providerId(), provider));
        this.gameService = gameService;
        this.writes = writes;
        this.runs = runs;
        this.auditService = auditService;
        this.events = events;
        this.timeProvider = timeProvider;
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

    // ---------------------------------------------------------------------------------------
    // Requests
    // ---------------------------------------------------------------------------------------

    /** Queues an asynchronous sync (admin, audited); returns the QUEUED run. */
    @Transactional
    public SyncRunView requestSync(
            AuthenticatedUser actor, String gameSlug, String providerId, SyncMode mode) {
        CardProvider provider = provider(providerId, gameSlug);
        GameView game =
                gameService
                        .find(gameSlug)
                        .orElseThrow(
                                () ->
                                        invalid(
                                                "gameSlug",
                                                "unknown game "
                                                        + gameSlug.toLowerCase(Locale.ROOT)));
        UUID runId = UUID.randomUUID();
        runs.insertQueued(
                runId, provider.providerId(), game.id(), mode, actor.userId(), timeProvider.now());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("game", game.slug());
        details.put("provider", provider.providerId());
        details.put("mode", mode.name());
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_SYNC,
                TARGET_CATALOG,
                runId.toString(),
                details);
        events.publishEvent(new CatalogSyncRequestedEvent(runId, timeProvider.now()));
        return runs.find(runId).orElseThrow();
    }

    /** Imports synchronously (local/dev seed, tests) and returns the finished run. */
    public SyncRunView importNow(String providerId, String gameSlug, SyncMode mode) {
        CardProvider provider = provider(providerId, gameSlug);
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
                                timeProvider.now()));
        execute(runId);
        return runs.find(runId).orElseThrow();
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
        try {
            Counts counts =
                    newTransaction.execute(
                            status -> importCatalog(run.provider(), run.game(), run.mode()));
            if (counts == null) {
                throw new IllegalStateException("Import returned nothing");
            }
            newTransaction.executeWithoutResult(
                    status ->
                            runs.markSucceeded(
                                    runId,
                                    counts.sets(),
                                    counts.cards(),
                                    counts.printings(),
                                    timeProvider.now()));
            log.info(
                    "Catalog sync {} {} {}: {} sets, {} cards, {} printings upserted",
                    run.provider(),
                    run.game(),
                    run.mode(),
                    counts.sets(),
                    counts.cards(),
                    counts.printings());
        } catch (RuntimeException e) {
            log.error("Catalog sync run {} failed", runId, e);
            String message =
                    "Import failed ("
                            + e.getClass().getSimpleName().replaceAll("[^A-Za-z]", "")
                            + ")";
            newTransaction.executeWithoutResult(
                    status -> runs.markFailed(runId, message, timeProvider.now()));
        }
    }

    private Counts importCatalog(String providerId, String gameSlug, SyncMode mode) {
        CardProvider provider = provider(providerId, gameSlug);
        GameView game = gameService.find(gameSlug).orElseThrow();
        writes.lockGameImport(game.id());
        Optional<Instant> since = runs.lastSuccessfulStart(providerId, game.id());
        SyncResult result =
                provider.syncCards(
                        gameSlug,
                        new SyncOptions(
                                mode, mode == SyncMode.INCREMENTAL ? since.orElse(null) : null));
        Instant now = timeProvider.now();

        int sets = 0;
        Map<String, UUID> setIds = new HashMap<>();
        for (ProviderSet set : result.sets()) {
            String code = set.code().trim().toUpperCase(Locale.ROOT);
            CatalogWriteRepository.Upsert upsert =
                    writes.upsertSet(
                            game.id(),
                            code,
                            set.name().trim(),
                            set.releaseDate(),
                            set.totalCards(),
                            set.series(),
                            set.metadata(),
                            ref(providerId, set.externalId()),
                            now);
            setIds.put(code, upsert.id());
            if (upsert.changed()) {
                sets++;
            }
        }

        int cards = 0;
        int printings = 0;
        for (ProviderCard card : result.cards()) {
            UUID cardId;
            Optional<CatalogWriteRepository.CardRef> existing =
                    writes.findCardByExternalRef(providerId, card.externalId());
            if (existing.isPresent()) {
                cardId = existing.get().id();
                if (writes.updateCard(
                        cardId,
                        card.name().trim(),
                        card.cardType(),
                        card.subtype(),
                        card.text(),
                        card.metadata(),
                        now)) {
                    cards++;
                }
            } else {
                cardId = UUID.randomUUID();
                writes.insertCard(
                        cardId,
                        game.id(),
                        card.name().trim(),
                        freeSlug(game.id(), card.name()),
                        card.cardType(),
                        card.subtype(),
                        card.text(),
                        card.metadata(),
                        ref(providerId, card.externalId()),
                        now);
                cards++;
            }
            for (ProviderPrinting printing : card.printings()) {
                if (importPrinting(providerId, game, setIds, cardId, printing, now)) {
                    printings++;
                }
            }
        }
        return new Counts(sets, cards, printings);
    }

    private boolean importPrinting(
            String providerId,
            GameView game,
            Map<String, UUID> setIds,
            UUID cardId,
            ProviderPrinting printing,
            Instant now) {
        String setCode = printing.setCode().trim().toUpperCase(Locale.ROOT);
        UUID setId = setIds.computeIfAbsent(setCode, code -> knownSetId(game, code, printing));
        @Nullable ProviderMarketPrice price = printing.marketPrice();
        CatalogWriteRepository.PrintingValues values =
                new CatalogWriteRepository.PrintingValues(
                        printing.collectorNumber().trim(),
                        printing.rarity(),
                        printing.edition(),
                        printing.language().toLowerCase(Locale.ROOT),
                        printing.finish(),
                        CatalogText.normalisePrintingCode(printing.printingCode()),
                        price == null ? null : price.amount(),
                        price == null ? null : price.currency(),
                        price == null ? null : price.updatedAt(),
                        printing.metadata(),
                        ref(providerId, printing.externalId()));
        boolean changed;
        UUID printingId;
        Optional<UUID> existing =
                writes.findPrintingByExternalRef(providerId, printing.externalId())
                        .or(
                                () ->
                                        writes.findPrintingByVariant(
                                                setId,
                                                values.collectorNumber(),
                                                values.edition(),
                                                values.language(),
                                                values.finish()));
        if (existing.isPresent()) {
            printingId = existing.get();
            changed = writes.updatePrinting(printingId, setId, values, now);
        } else {
            printingId = UUID.randomUUID();
            writes.insertPrinting(printingId, cardId, setId, values, now);
            changed = true;
        }
        for (ProviderImage image : printing.images()) {
            if (writes.upsertImage(
                    printingId,
                    image.kind(),
                    image.url(),
                    image.width(),
                    image.height(),
                    image.source(),
                    now)) {
                changed = true;
            }
        }
        return changed;
    }

    private UUID knownSetId(GameView game, String setCode, ProviderPrinting printing) {
        return writes.findSetId(game.id(), setCode)
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "Printing "
                                                + printing.externalId()
                                                + " references unknown set "
                                                + setCode));
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

    private static Map<String, String> ref(String providerId, String externalId) {
        Map<String, String> ref = new LinkedHashMap<>();
        ref.put("provider", providerId);
        ref.put("id", externalId);
        return ref;
    }

    private static ApiException invalid(String field, String message) {
        return ApiException.validation(
                "Validation failed", List.of(new ProblemFieldError(field, message)));
    }

    /** Rows inserted or changed by one import. */
    record Counts(int sets, int cards, int printings) {}
}
