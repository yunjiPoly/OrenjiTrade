package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.binders.domain.BinderChanges.BinderPatch;
import com.orenjitrade.api.binders.domain.BinderChanges.NewBinder;
import com.orenjitrade.api.binders.events.BinderFreshnessChanged;
import com.orenjitrade.api.binders.events.BinderPublished;
import com.orenjitrade.api.binders.events.BinderUnpublished;
import com.orenjitrade.api.binders.infra.BinderImageRepository;
import com.orenjitrade.api.binders.infra.BinderImageRepository.ImageRow;
import com.orenjitrade.api.binders.infra.BinderRepository;
import com.orenjitrade.api.binders.infra.BinderRepository.CoreFields;
import com.orenjitrade.api.binders.infra.BinderRepository.ListingChange;
import com.orenjitrade.api.binders.infra.BinderRepository.StateChange;
import com.orenjitrade.api.binders.infra.BinderRepository.Warned;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.AskingPriceText;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectKeys;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.delisting.domain.FreshnessEventLog;
import com.orenjitrade.api.delisting.domain.FreshnessEventType;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.limits.domain.Limits;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The binders module's service interface (Phase 3 contract "Endpoints — binders"): the owner's
 * binders, publication (PUBLIC, one hour, one day, until disabled), confirmation, reordering and
 * deletion, plus what the inventory module and the freshness job need (ownership checks, binder
 * activity, freshness recomputation, effective-visibility reconciliation).
 *
 * <p>Every transition of the effective public visibility of a binder emits {@link BinderPublished}
 * or {@link BinderUnpublished} exactly once: the last computed value is materialised in {@code
 * binder.publicly_listed} and events are emitted when it flips ({@link #reconcileListing}).
 *
 * <p>Locks: every write to a collector's binders or inventory items starts with that collector's
 * owner lock ({@link #lockOwners}), so the writes of one collector run one after the other. Below
 * it, a transaction locks the binder rows first, in ascending id ({@link #lockInOrder}, {@link
 * #lockAllInOrder}; every write here starts with the binder it changes), and only then the item
 * rows: the item count trigger and the listing reconciliation both end in binder rows. The
 * freshness job ({@link #runFreshness}, {@link #reconcileListing} of {@link ListingScope.All},
 * {@link #warn}) writes every collector's binders without an owner lock: it skips the binders
 * another transaction holds instead of waiting for them, and handles them at its next run.
 *
 * <p>Deck cores (owner spec 2026-10-14, sections 7 and 12, stage R3): a binder with "Sell as a deck
 * core" on is offered as one bundle: its photos (at most {@value #MAX_PHOTOS}, {@link #addPhoto}),
 * one asking price as typed ({@link AskingPriceText}, a plain amount also stored as an amount) and
 * its description as the public note. It needs no cards; the cards in it are its key cards. A photo
 * write is a binder write: the owner lock, then the binder row.
 */
@Service
public class BinderService {

    public static final String BINDERS_MAX = "binders.max";
    public static final int NAME_MAX = 80;
    public static final int DESCRIPTION_MAX = 1000;

    /** Photos of a binder (a deck core), as for inventory items. */
    public static final int MAX_PHOTOS = 4;

    /** Preview pictures of a binder in lists (a fan of three cards, or a deck core's photo). */
    public static final int PREVIEW_MAX = 3;

    /** Key cards of a deck core in its responses (the cards with the most copies first). */
    public static final int KEY_CARDS_MAX = 30;

    /** Default currency of a binder's price (as inventory items). */
    public static final String DEFAULT_CURRENCY = "CAD";

    /**
     * The game of a binder made without one until its first card sets it (the paused web has no
     * game picker, stage G).
     */
    public static final String DEFAULT_GAME = "yugioh";

    static final String NOT_FOUND = "Binder not found";
    static final String GAME_LOCKED = "A binder's game can't change once it has cards";
    static final String COVER_OF_ANOTHER_GAME = "A binder's cover is a card of its game";
    static final String IMAGE_NAMESPACE = "binders";
    static final String PHOTO_NOT_FOUND = "Photo not found";

    private static final Logger log = LoggerFactory.getLogger(BinderService.class);

    private final BinderRepository repository;
    private final BinderImageRepository images;
    private final Limits limits;
    private final FreshnessEventLog freshnessEvents;
    private final ObjectProvider<BinderContents> contents;
    private final CatalogService catalogService;
    private final GameService games;
    private final ObjectStorage storage;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;

    public BinderService(
            BinderRepository repository,
            BinderImageRepository images,
            Limits limits,
            FreshnessEventLog freshnessEvents,
            ObjectProvider<BinderContents> contents,
            CatalogService catalogService,
            GameService games,
            ObjectStorage storage,
            TimeProvider timeProvider,
            ApplicationEventPublisher events,
            PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.images = images;
        this.limits = limits;
        this.freshnessEvents = freshnessEvents;
        this.contents = contents;
        this.catalogService = catalogService;
        this.games = games;
        this.storage = storage;
        this.timeProvider = timeProvider;
        this.events = events;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------------------------------
    // Owner reads
    // ---------------------------------------------------------------------------------------

    /** The owner's binders in their order. */
    @Transactional(readOnly = true)
    public List<BinderDetails> listMine(UUID ownerId) {
        return details(repository.findByOwner(ownerId, timeProvider.now()), false);
    }

    /** One of the owner's binders ({@code 404} for others' binders and unknown ids). */
    @Transactional(readOnly = true)
    public BinderDetails getMine(UUID ownerId, UUID binderId) {
        return details(List.of(requireOwned(ownerId, binderId)), false).get(0);
    }

    // ---------------------------------------------------------------------------------------
    // Owner writes
    // ---------------------------------------------------------------------------------------

    /**
     * Creates a binder at the end of the owner's list. {@code 429 LIMIT_REACHED} beyond the usage
     * limit {@code binders.max}; {@code 400} for invalid input.
     */
    @Transactional
    public BinderDetails create(UUID ownerId, NewBinder input) {
        Instant now = timeProvider.now();
        List<ProblemFieldError> errors = new ArrayList<>();
        String name = validName(input.name(), errors);
        String description = validDescription(input.description(), errors);
        ListingVisibility visibility =
                input.visibility() != null ? input.visibility() : ListingVisibility.PRIVATE;
        errors.addAll(
                PublicVisibilityRules.validatePublicUntil(visibility, input.publicUntil(), now));
        validateCover(input.coverPrintingId(), errors);
        @Nullable String priceText = validPriceText(input.askingPriceText(), errors);
        @Nullable GameView game =
                input.gameId() == null ? defaultGame() : binderGame(input.gameId(), errors);
        if (!errors.isEmpty() || game == null) {
            throw ApiException.validation("Validation failed", errors);
        }
        if (input.gameId() != null) {
            // A binder made without a game (the paused web) refuses no card and no cover.
            requireCoverOfGame(input.coverPrintingId(), game.id());
        }
        // The owner lock also keeps two creations apart (limit check + insert).
        repository.lockOwners(List.of(ownerId));
        limits.consume(ownerId, BINDERS_MAX);
        UUID id = UUID.randomUUID();
        repository.insert(
                id,
                ownerId,
                name,
                description,
                input.kind() != null ? input.kind() : BinderKind.COLLECTION,
                visibility,
                PublicVisibilityRules.storedPublicUntil(visibility, input.publicUntil()),
                repository.nextSortOrder(ownerId),
                input.coverPrintingId(),
                coreFields(Boolean.TRUE.equals(input.sellsAsCore()), priceText),
                game.id(),
                input.gameId() == null,
                now);
        reconcileListing(ListingScope.Binders.of(List.of(id)));
        log.info(
                "Binder created owner={} binder={} visibility={} deckCore={} game={}",
                ownerId,
                id,
                visibility,
                Boolean.TRUE.equals(input.sellsAsCore()),
                game.slug());
        return getMine(ownerId, id);
    }

    /**
     * Partial update. Making the binder public (PUBLIC or TEMPORARILY_PUBLIC) confirms it and its
     * items, like {@link #publish}.
     */
    @Transactional
    public BinderDetails update(UUID ownerId, UUID binderId, BinderPatch patch) {
        BinderView current = lockOwned(ownerId, binderId);
        Instant now = timeProvider.now();
        List<ProblemFieldError> errors = new ArrayList<>();
        String name = patch.name() != null ? validName(patch.name(), errors) : current.name();
        String description =
                patch.description() != null
                        ? validDescription(patch.description(), errors)
                        : current.description();
        ListingVisibility visibility =
                patch.visibility() != null ? patch.visibility() : current.visibility();
        @Nullable Instant publicUntil =
                patch.publicUntilSet() ? patch.publicUntil() : current.publicUntil();
        boolean visibilityChanged =
                visibility != current.visibility()
                        || (visibility == ListingVisibility.TEMPORARILY_PUBLIC
                                && patch.publicUntilSet()
                                && !java.util.Objects.equals(publicUntil, current.publicUntil()));
        if (visibilityChanged) {
            errors.addAll(PublicVisibilityRules.validatePublicUntil(visibility, publicUntil, now));
        }
        @Nullable UUID cover =
                patch.coverPrintingIdSet() ? patch.coverPrintingId() : current.coverPrintingId();
        if (patch.coverPrintingIdSet()) {
            validateCover(cover, errors);
        }
        @Nullable String priceText =
                patch.askingPriceTextSet()
                        ? validPriceText(patch.askingPriceText(), errors)
                        : current.askingPriceText();
        boolean gameChanged = patch.gameId() != null && !patch.gameId().equals(current.gameId());
        @Nullable GameView game = gameChanged ? binderGame(patch.gameId(), errors) : null;
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        if (gameChanged) {
            // Under the binder's row lock: no card can come in between this check and the write.
            @Nullable BinderContents binderContents = contents.getIfAvailable();
            if (current.itemCount() > 0
                    || (binderContents != null
                            && binderContents.holdsRestorableCards(binderId, now))) {
                throw new ApiException(ErrorCode.BINDER_GAME_LOCKED, GAME_LOCKED);
            }
        }
        // A binder that has its game (chosen now, or before) takes a cover of that game only; one
        // made without a game (the paused web) refuses no cover until a game is chosen for it.
        if ((patch.coverPrintingIdSet() || gameChanged)
                && (gameChanged || !current.gameFollowsCards())) {
            requireCoverOfGame(
                    cover,
                    gameChanged ? java.util.Objects.requireNonNull(game).id() : current.gameId());
        }
        if (gameChanged) {
            repository.setGame(binderId, java.util.Objects.requireNonNull(game).id(), now);
        }
        boolean sellsAsCore =
                patch.sellsAsCore() != null ? patch.sellsAsCore() : current.sellsAsCore();
        repository.update(
                binderId,
                name,
                description,
                patch.kind() != null ? patch.kind() : current.kind(),
                visibility,
                PublicVisibilityRules.storedPublicUntil(visibility, publicUntil),
                cover,
                patch.askingPriceTextSet()
                        ? coreFields(sellsAsCore, priceText)
                        : new CoreFields(sellsAsCore, priceText, current.askingPrice()),
                now);
        if ((visibilityChanged && visibility.isPublic()) || patch.confirm()) {
            confirmBinderAndItems(ownerId, binderId, now);
        }
        afterChange(ownerId, binderId);
        return getMine(ownerId, binderId);
    }

    /**
     * The game a binder may hold (stage G): an ACTIVE game whose catalogue holds a card. Adds a
     * field error otherwise ({@code null}).
     */
    private @Nullable GameView binderGame(UUID gameId, List<ProblemFieldError> errors) {
        Optional<GameView> game =
                games.findById(gameId).filter(GameView::isActive).filter(GameView::hasCards);
        if (game.isEmpty()) {
            errors.add(new ProblemFieldError("gameId", "must be an active game with cards"));
            return null;
        }
        return game.get();
    }

    /**
     * A card of game {@code cardGame} goes into {@code binder}, which the caller holds (owner lock,
     * row lock): a binder made without a game ({@link BinderView#gameFollowsCards()}) that holds no
     * card (live, or deleted with an undo still open) takes that game; any other binder keeps its
     * own. Returns the binder as it now is.
     */
    public BinderView followCardGame(BinderView binder, String cardGame, boolean empty) {
        if (binder.game().equals(cardGame) || !binder.gameFollowsCards() || !empty) {
            return binder;
        }
        Optional<GameView> game = games.find(cardGame).filter(GameView::isActive);
        if (game.isEmpty()) {
            return binder;
        }
        repository.followCardGame(binder.id(), game.get().id());
        log.info("Binder game follows its first card binder={} game={}", binder.id(), cardGame);
        return binder.withGame(game.get().id(), game.get().slug());
    }

    /** The placeholder game of a binder made without one: Yu-Gi-Oh! (stage G). */
    private GameView defaultGame() {
        return games.find(DEFAULT_GAME)
                .orElseThrow(() -> new IllegalStateException("The game yugioh is missing"));
    }

    // ---------------------------------------------------------------------------------------
    // Photos (deck cores, stage R3)
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /binders/{id}/images}: stores a photo already re-encoded by the caller (a JPEG
     * without metadata, {@code inventory}'s {@code ItemImageProcessor}) and adds it to the owner's
     * binder: {@code 404} for another collector's binder, {@code 409} beyond {@value #MAX_PHOTOS}.
     * The object is written before the transaction (nothing slow under the owner lock) and deleted
     * again when the binder refuses it.
     */
    public BinderDetails addPhoto(UUID ownerId, UUID binderId, byte[] jpeg, int width, int height) {
        String key = ObjectKeys.newKey(IMAGE_NAMESPACE, ownerId, "jpg");
        storage.put(key, jpeg, "image/jpeg");
        try {
            BinderDetails details =
                    transaction.execute(
                            status -> {
                                lockOwned(ownerId, binderId);
                                if (images.countByBinder(binderId) >= MAX_PHOTOS) {
                                    throw ApiException.conflict(
                                            "A binder can have at most " + MAX_PHOTOS + " photos");
                                }
                                Instant now = timeProvider.now();
                                images.insert(
                                        UUID.randomUUID(),
                                        binderId,
                                        key,
                                        storage.publicUrl(key),
                                        width,
                                        height,
                                        images.nextSortOrder(binderId),
                                        now);
                                repository.touch(binderId, now);
                                return getMine(ownerId, binderId);
                            });
            if (details == null) {
                throw new IllegalStateException("Photo transaction returned nothing");
            }
            log.info(
                    "Binder photo stored owner={} binder={} bytes={}",
                    ownerId,
                    binderId,
                    jpeg.length);
            return details;
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }
    }

    /** {@code DELETE /binders/{id}/images/{imageId}}: {@code 404} for an unknown photo. */
    @Transactional
    public void deletePhoto(UUID ownerId, UUID binderId, UUID imageId) {
        lockOwned(ownerId, binderId);
        String key =
                images.delete(binderId, imageId)
                        .orElseThrow(() -> ApiException.notFound(PHOTO_NOT_FOUND));
        repository.touch(binderId, timeProvider.now());
        deleteObjectsAfterCommit(List.of(key));
    }

    /**
     * Publishes the binder ({@link PublishMode}) and confirms it and its items: publishing asserts
     * that the cards are still available, so hidden (stale) items come back.
     */
    @Transactional
    public BinderDetails publish(UUID ownerId, UUID binderId, PublishMode mode) {
        lockOwned(ownerId, binderId);
        Instant now = timeProvider.now();
        repository.setVisibility(binderId, mode.visibility(), mode.publicUntil(now), now);
        confirmBinderAndItems(ownerId, binderId, now);
        afterChange(ownerId, binderId);
        log.info("Binder published owner={} binder={} mode={}", ownerId, binderId, mode);
        return getMine(ownerId, binderId);
    }

    /** Makes the binder PRIVATE (its items stay as they are). */
    @Transactional
    public BinderDetails unpublish(UUID ownerId, UUID binderId) {
        lockOwned(ownerId, binderId);
        repository.setVisibility(binderId, ListingVisibility.PRIVATE, null, timeProvider.now());
        afterChange(ownerId, binderId);
        return getMine(ownerId, binderId);
    }

    /**
     * Admin unpublish (Phase 7 console "Binders"): makes any owner's binder PRIVATE (the owner may
     * publish it again). The caller audits.
     *
     * @return the owner and the previous visibility; empty for unknown binders
     */
    @Transactional
    public Optional<AdminUnpublished> adminUnpublish(UUID binderId) {
        Optional<BinderView> binder = repository.findById(binderId, timeProvider.now());
        if (binder.isEmpty()) {
            return Optional.empty();
        }
        UUID ownerId = binder.get().ownerId();
        lockOwned(ownerId, binderId);
        repository.setVisibility(binderId, ListingVisibility.PRIVATE, null, timeProvider.now());
        afterChange(ownerId, binderId);
        return Optional.of(
                new AdminUnpublished(ownerId, binder.get().visibility(), binder.get().name()));
    }

    /** Admin console list of binders (every owner, never private item notes). */
    @Transactional(readOnly = true)
    public PageResponse<BinderRepository.AdminRow> adminList(
            @Nullable String query,
            @Nullable UUID ownerId,
            @Nullable ListingVisibility visibility,
            int page,
            int size) {
        BinderRepository.AdminPage result =
                repository.adminPage(query, ownerId, visibility, page, size, timeProvider.now());
        return PageResponse.of(result.rows(), page, size, result.total());
    }

    /** The binder of an admin row (after a write). */
    @Transactional(readOnly = true)
    public Optional<BinderView> findAny(UUID binderId) {
        return repository.findById(binderId, timeProvider.now());
    }

    /**
     * Result of {@link #adminUnpublish}.
     *
     * @param ownerId the owner
     * @param previousVisibility the visibility before
     * @param name the binder name
     */
    public record AdminUnpublished(
            UUID ownerId, ListingVisibility previousVisibility, String name) {}

    /** "Still available": refreshes the binder and every item in it (HIDDEN ones come back). */
    @Transactional
    public BinderDetails confirm(UUID ownerId, UUID binderId) {
        lockOwned(ownerId, binderId);
        confirmBinderAndItems(ownerId, binderId, timeProvider.now());
        afterChange(ownerId, binderId);
        return getMine(ownerId, binderId);
    }

    /**
     * Deletes the binder. Its items are soft-deleted with {@code deleteItems}, otherwise unfiled:
     * they keep their own visibility only when the binder was PUBLIC without an end date, else they
     * become PRIVATE.
     */
    @Transactional
    public void delete(UUID ownerId, UUID binderId, boolean deleteItems) {
        BinderView current = lockOwned(ownerId, binderId);
        Instant now = timeProvider.now();
        boolean keepVisibility = current.visibility() == ListingVisibility.PUBLIC;
        @Nullable BinderContents binderContents = contents.getIfAvailable();
        if (binderContents != null) {
            binderContents.releaseItems(ownerId, binderId, deleteItems, keepVisibility, now);
        }
        boolean wasListed = repository.isPubliclyListed(binderId);
        List<String> photoKeys = images.keysOf(List.of(binderId));
        repository.delete(binderId);
        deleteObjectsAfterCommit(photoKeys);
        if (wasListed) {
            events.publishEvent(new BinderUnpublished(binderId, ownerId, now));
        }
        log.info(
                "Binder deleted owner={} binder={} itemsDeleted={}",
                ownerId,
                binderId,
                deleteItems);
    }

    /**
     * Reorders the owner's binders: the listed ones come first in the given order, the others keep
     * their relative order after them. {@code 400} for duplicates, {@code 404} for binders that are
     * not the caller's.
     */
    @Transactional
    public List<BinderDetails> reorder(UUID ownerId, List<UUID> binderIds) {
        Set<UUID> distinct = new LinkedHashSet<>(binderIds);
        if (distinct.size() != binderIds.size()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("binderIds", "must not contain duplicates")));
        }
        // Every binder of the owner is rewritten below in the requested order: take them in the
        // lock order first.
        repository.lockOwners(List.of(ownerId));
        repository.lockAllOf(ownerId);
        if (!repository.notOwned(ownerId, distinct).isEmpty()) {
            throw ApiException.notFound(NOT_FOUND);
        }
        Instant now = timeProvider.now();
        List<UUID> order = new ArrayList<>(distinct);
        for (BinderView binder : repository.findByOwner(ownerId, now)) {
            if (!distinct.contains(binder.id())) {
                order.add(binder.id());
            }
        }
        for (int index = 0; index < order.size(); index++) {
            repository.setSortOrder(order.get(index), index);
        }
        return listMine(ownerId);
    }

    // ---------------------------------------------------------------------------------------
    // Chats and sales (stage R4)
    // ---------------------------------------------------------------------------------------

    /**
     * Binders as the subjects of chats, whatever their state (deleted ones are absent): the deck
     * core a chat is about, its price as typed, its first photo (else the first card picture buyers
     * see), whether it is sold and whether buyers can find it now.
     */
    @Transactional(readOnly = true)
    public Map<UUID, ChatDeckCore> chatDeckCores(Collection<UUID> binderIds) {
        if (binderIds.isEmpty()) {
            return Map.of();
        }
        List<BinderView> binders = repository.findByIds(binderIds, timeProvider.now());
        // A sold deck core's cards left the inventory with it: without a photo, its picture is
        // the first card the sale took (review fix 1, F7), so both still see it.
        List<UUID> sold =
                binders.stream()
                        .filter(binder -> binder.soldAt() != null)
                        .map(BinderView::id)
                        .toList();
        @Nullable BinderContents binderContents = contents.getIfAvailable();
        Map<UUID, String> soldPictures =
                sold.isEmpty() || binderContents == null
                        ? Map.of()
                        : binderContents.soldDeckCorePicturesOf(sold);
        Map<UUID, ChatDeckCore> result = new HashMap<>();
        for (BinderDetails details : details(binders, true)) {
            BinderView binder = details.binder();
            List<String> previews = details.showcase().previewImages();
            @Nullable String picture =
                    previews.isEmpty() ? soldPictures.get(binder.id()) : previews.get(0);
            result.put(
                    binder.id(),
                    new ChatDeckCore(
                            binder.id(),
                            binder.ownerId(),
                            binder.name(),
                            binder.sellsAsCore(),
                            binder.askingPriceText(),
                            picture,
                            binder.soldAt(),
                            binder.effectivePublic()));
        }
        return result;
    }

    /**
     * Holds a binder {@code FOR KEY SHARE} before a chat names it as its subject (see {@link
     * BinderRepository#lockKeyShare}); joins the caller's transaction.
     *
     * @return whether the binder exists
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean lockForReference(UUID binderId) {
        return repository.lockKeyShare(binderId);
    }

    /**
     * Marks a deck core sold (stage R4, Mark as sold): {@code sold_at}, so it is never public again
     * until the sale is undone. The caller holds the owner lock and the binder, sells its cards
     * with it and reconciles the listing.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void markSold(UUID binderId, Instant now) {
        repository.setSoldAt(binderId, now, now);
    }

    /** The undo of a deck core's sale: unsold again (same locks as {@link #markSold}). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void clearSold(UUID binderId, Instant now) {
        repository.setSoldAt(binderId, null, now);
    }

    // ---------------------------------------------------------------------------------------
    // For the inventory module
    // ---------------------------------------------------------------------------------------

    /** The owner's binder, {@code 404} otherwise. */
    @Transactional(readOnly = true)
    public BinderView requireOwned(UUID ownerId, UUID binderId) {
        return repository
                .findById(binderId, timeProvider.now())
                .filter(binder -> binder.ownerId().equals(ownerId))
                .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    /** Binders by id (any owner), with their live effective visibility. */
    @Transactional(readOnly = true)
    public Map<UUID, BinderView> findAll(Collection<UUID> binderIds) {
        Map<UUID, BinderView> result = new HashMap<>();
        for (BinderView binder : repository.findByIds(binderIds, timeProvider.now())) {
            result.put(binder.id(), binder);
        }
        return result;
    }

    /** Number of binders of an owner that count toward {@code binders.max} (sold ones do not). */
    @Transactional(readOnly = true)
    public long countOf(UUID ownerId) {
        return repository.countByOwner(ownerId);
    }

    /** Earliest future end of the owner's temporary binder publications. */
    @Transactional(readOnly = true)
    public Optional<Instant> nextExpiry(UUID ownerId) {
        return repository.nextExpiry(ownerId, timeProvider.now());
    }

    /**
     * The first step of every write to these collectors' binders or inventory items: takes their
     * owner locks until the transaction ends, before any binder or item row is locked. The writes
     * of one collector then run one after the other: none of them reads the binder of an item while
     * another one moves it, and none waits for a row in the middle of its work that another write
     * of the same collector holds.
     *
     * @param ownerIds the collectors whose rows the transaction writes (two for a trade transfer)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockOwners(Collection<UUID> ownerIds) {
        repository.lockOwners(ownerIds);
    }

    /**
     * Locks binders before their items are written, in ascending id order (the lock order of every
     * inventory and binder write). Call it before the first item row is locked, with every binder
     * the transaction is going to reach: the binders the items are filed in (the item count trigger
     * and {@link #recordItemActivity} write them) and the binder they move to.
     *
     * @param ownerId only this owner's binders when given (ids taken from a request)
     * @return the binders locked; unknown ones and other owners' binders are absent
     */
    @Transactional
    public Set<UUID> lockInOrder(@Nullable UUID ownerId, Collection<UUID> binderIds) {
        return new HashSet<>(repository.lockAll(ownerId, new HashSet<>(binderIds)));
    }

    /**
     * Locks every binder of an owner in ascending id order: for writes that reach all of the
     * owner's binders and items (listing reconciliation, account purge).
     */
    @Transactional
    public Set<UUID> lockAllInOrder(UUID ownerId) {
        return new HashSet<>(repository.lockAllOf(ownerId));
    }

    /**
     * Items were created, confirmed or moved into these binders: that confirms the binders (hidden
     * ones come back). Does not touch the items. The caller holds the binders ({@link
     * #lockInOrder}).
     */
    @Transactional
    public void recordItemActivity(UUID ownerId, Collection<UUID> binderIds, Instant now) {
        if (binderIds.isEmpty()) {
            return;
        }
        applyStateChanges(repository.confirm(ownerId, new LinkedHashSet<>(binderIds), now), now);
        reconcileListing(ListingScope.Binders.of(binderIds));
    }

    /**
     * Stores the effective public visibility of the binders in {@code scope} and emits {@link
     * BinderPublished} / {@link BinderUnpublished} for each flip. {@link ListingScope.All} (the
     * freshness job) leaves the binders another transaction holds to the next run; the other scopes
     * wait for them.
     *
     * @return the flips
     */
    @Transactional
    public List<ListingFlip> reconcileListing(ListingScope scope) {
        return reconcileListing(scope, true);
    }

    /** Like {@link #reconcileListing(ListingScope)}, optionally without events (seed). */
    @Transactional
    public List<ListingFlip> reconcileListing(ListingScope scope, boolean publishEvents) {
        Instant now = timeProvider.now();
        List<ListingChange> changes =
                switch (scope) {
                    case ListingScope.Owner owner ->
                            repository.reconcile(
                                    "b.owner_id = :ownerId",
                                    Map.of("ownerId", owner.ownerId()),
                                    false,
                                    now);
                    case ListingScope.Binders binders ->
                            binders.binderIds().isEmpty()
                                    ? List.of()
                                    : repository.reconcile(
                                            "b.id IN (:ids)",
                                            Map.of("ids", binders.binderIds()),
                                            false,
                                            now);
                    case ListingScope.All all -> repository.reconcile("TRUE", Map.of(), true, now);
                };
        List<ListingFlip> flips = new ArrayList<>();
        for (ListingChange change : changes) {
            flips.add(new ListingFlip(change.binderId(), change.ownerId(), change.listed()));
            if (!publishEvents) {
                continue;
            }
            if (change.listed()) {
                events.publishEvent(new BinderPublished(change.binderId(), change.ownerId(), now));
            } else {
                events.publishEvent(
                        new BinderUnpublished(change.binderId(), change.ownerId(), now));
            }
        }
        return flips;
    }

    /**
     * Freshness job, binder part: expired temporary publications become PRIVATE and freshness
     * states are re-derived from the policy (AGED / STALED / HIDDEN / RESTORED events, {@link
     * BinderFreshnessChanged}). The caller reconciles the effective visibility afterwards, then
     * calls {@link #warn}. Binders another transaction holds are skipped, here and in {@link
     * #warn}: the next run handles them.
     */
    @Transactional
    public FreshnessRun runFreshness(FreshnessPolicy policy, Instant now) {
        int expired = repository.normaliseExpired(now);
        List<StateChange> changes = repository.recomputeFreshness(policy, now);
        applyStateChanges(changes, now);
        return new FreshnessRun(expired, changes.size());
    }

    /**
     * Marks publicly listed binders entering the warning window (once per confirmation cycle) and
     * records WARNED events.
     *
     * @return the warned binders, by id
     */
    @Transactional
    public Map<UUID, Warning> warn(FreshnessPolicy policy, Instant now) {
        List<FreshnessEventLog.Entry> entries = new ArrayList<>();
        Map<UUID, Warning> warnings = new LinkedHashMap<>();
        for (Warned binder : repository.warn(policy, now)) {
            entries.add(
                    FreshnessEventLog.Entry.binder(
                            binder.ownerId(), binder.binderId(), FreshnessEventType.WARNED, now));
            warnings.put(
                    binder.binderId(),
                    new Warning(binder.ownerId(), policy.hidesAt(binder.confirmedAt())));
        }
        freshnessEvents.record(entries);
        return warnings;
    }

    /** Deletes every binder of the owner (account purge); items are purged by their module. */
    @Transactional
    public int purge(UUID ownerId) {
        repository.lockOwners(List.of(ownerId));
        repository.lockAllOf(ownerId);
        List<String> photoKeys = images.keysOfOwner(ownerId);
        int deleted = repository.deleteAllOf(ownerId).size();
        deleteObjectsAfterCommit(photoKeys);
        return deleted;
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private BinderView lockOwned(UUID ownerId, UUID binderId) {
        repository.lockOwners(List.of(ownerId));
        if (!repository.lockOwned(ownerId, binderId)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return requireOwned(ownerId, binderId);
    }

    private void confirmBinderAndItems(UUID ownerId, UUID binderId, Instant now) {
        applyStateChanges(repository.confirm(ownerId, List.of(binderId), now), now);
        @Nullable BinderContents binderContents = contents.getIfAvailable();
        if (binderContents != null) {
            binderContents.confirmItems(ownerId, binderId, now);
        }
    }

    private void afterChange(UUID ownerId, UUID binderId) {
        reconcileListing(ListingScope.Binders.of(List.of(binderId)));
        @Nullable BinderContents binderContents = contents.getIfAvailable();
        if (binderContents != null) {
            binderContents.afterBinderChange(ownerId, List.of(binderId));
        }
    }

    /** Freshness events and {@link BinderFreshnessChanged} for state changes. */
    private void applyStateChanges(List<StateChange> changes, Instant now) {
        List<FreshnessEventLog.Entry> entries = new ArrayList<>();
        for (StateChange change : changes) {
            if (change.previous() == change.current()) {
                continue;
            }
            @Nullable FreshnessEventType type =
                    FreshnessEventType.forTransition(change.previous(), change.current());
            if (type != null) {
                entries.add(
                        FreshnessEventLog.Entry.binder(
                                change.ownerId(), change.binderId(), type, now));
            }
            events.publishEvent(
                    new BinderFreshnessChanged(
                            change.binderId(),
                            change.ownerId(),
                            change.previous(),
                            change.current(),
                            now));
        }
        freshnessEvents.record(entries);
    }

    /** Binders with their item statistics (public views: public items only). */
    List<BinderDetails> details(List<BinderView> binders, boolean publicOnly) {
        if (binders.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = binders.stream().map(BinderView::id).toList();
        @Nullable BinderContents binderContents = contents.getIfAvailable();
        Map<UUID, BinderContents.Stats> stats =
                binderContents == null ? Map.of() : binderContents.statsOf(ids, publicOnly);
        Map<UUID, String> covers = coverImages(binders);
        Map<UUID, BinderShowcase> showcases = showcases(binders, publicOnly, binderContents);
        // The owner's views say whether the game can still change (review fix 1, U2).
        java.util.Set<UUID> restorable =
                publicOnly || binderContents == null
                        ? java.util.Set.of()
                        : binderContents.bindersWithRestorableCards(
                                binders.stream()
                                        .filter(binder -> binder.itemCount() == 0)
                                        .map(BinderView::id)
                                        .toList(),
                                timeProvider.now());
        List<BinderDetails> result = new ArrayList<>();
        for (BinderView binder : binders) {
            BinderContents.Stats binderStats =
                    stats.getOrDefault(binder.id(), BinderContents.Stats.EMPTY);
            @Nullable String cover = covers.get(binder.id());
            result.add(
                    new BinderDetails(
                            binder,
                            binderStats,
                            cover != null ? cover : binderStats.coverImageUrl(),
                            showcases.getOrDefault(binder.id(), BinderShowcase.EMPTY),
                            !publicOnly
                                    && (binder.itemCount() > 0
                                            || restorable.contains(binder.id()))));
        }
        return result;
    }

    /**
     * Photos, preview pictures and key cards of the binders (three queries for the whole list). A
     * public view shows the photos only of a deck core (a binder whose switch was turned off keeps
     * them for its owner) and key cards only of deck cores: in public views every live card of a
     * public deck core, whatever the card's own visibility (they sell only together).
     */
    private Map<UUID, BinderShowcase> showcases(
            List<BinderView> binders, boolean publicOnly, @Nullable BinderContents binderContents) {
        List<UUID> ids = binders.stream().map(BinderView::id).toList();
        List<UUID> cores =
                binders.stream().filter(BinderView::sellsAsCore).map(BinderView::id).toList();
        Map<UUID, List<BinderPhoto>> photos = new HashMap<>();
        for (ImageRow image : images.findByBinders(ids)) {
            photos.computeIfAbsent(image.binderId(), id -> new ArrayList<>())
                    .add(
                            new BinderPhoto(
                                    image.id(),
                                    storage.publicUrl(image.storageKey()),
                                    image.width(),
                                    image.height(),
                                    image.sortOrder()));
        }
        Map<UUID, List<String>> previews =
                binderContents == null
                        ? Map.of()
                        : binderContents.previewImagesOf(ids, publicOnly, PREVIEW_MAX);
        Map<UUID, List<KeyCard>> keyCards =
                binderContents == null || cores.isEmpty()
                        ? Map.of()
                        : binderContents.keyCardsOf(cores, publicOnly, KEY_CARDS_MAX);
        Map<UUID, BinderShowcase> result = new HashMap<>();
        for (BinderView binder : binders) {
            List<BinderPhoto> binderPhotos = photos.getOrDefault(binder.id(), List.of());
            List<BinderPhoto> shown =
                    publicOnly && !binder.sellsAsCore() ? List.of() : binderPhotos;
            List<String> cardPictures = previews.getOrDefault(binder.id(), List.of());
            List<String> preview =
                    binder.sellsAsCore() && !binderPhotos.isEmpty()
                            ? List.of(binderPhotos.get(0).url())
                            : cardPictures;
            result.put(
                    binder.id(),
                    new BinderShowcase(
                            shown,
                            preview,
                            binder.sellsAsCore()
                                    ? keyCards.getOrDefault(binder.id(), List.of())
                                    : List.of()));
        }
        return result;
    }

    /** Images of the chosen cover printings, by binder. */
    Map<UUID, String> coverImages(List<BinderView> binders) {
        Set<UUID> printingIds = new HashSet<>();
        for (BinderView binder : binders) {
            if (binder.coverPrintingId() != null) {
                printingIds.add(binder.coverPrintingId());
            }
        }
        if (printingIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> byPrinting = new HashMap<>();
        for (PrintingSummary printing : catalogService.printingsIncludingHidden(printingIds)) {
            List<PrintingImage> images = printing.images();
            if (!images.isEmpty()) {
                byPrinting.put(printing.id(), images.get(0).url());
            }
        }
        Map<UUID, String> result = new HashMap<>();
        for (BinderView binder : binders) {
            if (binder.coverPrintingId() != null
                    && byPrinting.containsKey(binder.coverPrintingId())) {
                result.put(binder.id(), byPrinting.get(binder.coverPrintingId()));
            }
        }
        return result;
    }

    private static String validName(String raw, List<ProblemFieldError> errors) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty() || name.length() > NAME_MAX) {
            errors.add(new ProblemFieldError("name", "must be 1 to 80 characters"));
        }
        return name;
    }

    private static String validDescription(@Nullable String raw, List<ProblemFieldError> errors) {
        String description = raw == null ? "" : raw.trim();
        if (description.length() > DESCRIPTION_MAX) {
            errors.add(new ProblemFieldError("description", "must be at most 1000 characters"));
        }
        return description;
    }

    /** The price text as stored (trimmed, {@code null} when blank), or a field error. */
    private static @Nullable String validPriceText(
            @Nullable String raw, List<ProblemFieldError> errors) {
        @Nullable String text = AskingPriceText.normalise(raw);
        @Nullable String problem = AskingPriceText.problem(text);
        if (problem != null) {
            errors.add(new ProblemFieldError("askingPriceText", problem));
        }
        return text;
    }

    /** The deck core columns of a write: a plain-amount text also gives the amount. */
    static CoreFields coreFields(boolean sellsAsCore, @Nullable String priceText) {
        @Nullable BigDecimal amount = AskingPriceText.amountOf(priceText).orElse(null);
        return new CoreFields(sellsAsCore, priceText, amount);
    }

    /** Deletes stored photos once the transaction has committed (never a row without its file). */
    private void deleteObjectsAfterCommit(List<String> keys) {
        if (keys.isEmpty()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            keys.forEach(BinderService.this::deleteQuietly);
                        }
                    });
        } else {
            keys.forEach(this::deleteQuietly);
        }
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("Could not delete stored binder photo {}: {}", key, e.getMessage());
        }
    }

    /**
     * {@code 409 BINDER_GAME_MISMATCH} unless the cover is a card of {@code gameId} (stage G,
     * review fix 1, F7: a cover of another game would show in that game's lists). The printing
     * exists ({@link #validateCover}).
     */
    private void requireCoverOfGame(@Nullable UUID coverPrintingId, UUID gameId) {
        if (coverPrintingId != null
                && repository
                        .printingGame(coverPrintingId)
                        .filter(printingGame -> !printingGame.equals(gameId))
                        .isPresent()) {
            throw new ApiException(ErrorCode.BINDER_GAME_MISMATCH, COVER_OF_ANOTHER_GAME);
        }
    }

    private void validateCover(@Nullable UUID coverPrintingId, List<ProblemFieldError> errors) {
        if (coverPrintingId != null && !repository.printingExists(coverPrintingId)) {
            errors.add(new ProblemFieldError("coverPrintingId", "unknown printing"));
        }
    }

    /**
     * A flip of a binder's effective public visibility.
     *
     * @param binderId binder
     * @param ownerId owner
     * @param listed new value
     */
    public record ListingFlip(UUID binderId, UUID ownerId, boolean listed) {}

    /**
     * A publicly listed binder that entered its warning window.
     *
     * @param ownerId owner
     * @param hidesAt when it is hidden unless confirmed
     */
    public record Warning(UUID ownerId, Instant hidesAt) {}

    /**
     * Outcome of the binder part of a freshness run.
     *
     * @param expired temporary publications turned PRIVATE
     * @param stateChanges freshness state changes
     */
    public record FreshnessRun(int expired, int stateChanges) {}
}
