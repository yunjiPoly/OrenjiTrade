package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.BinderContents;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.KeyCard;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingDetail;
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
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkAction;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkRequest;
import com.orenjitrade.api.inventory.domain.InventoryChanges.BulkResult;
import com.orenjitrade.api.inventory.domain.InventoryChanges.ImportLine;
import com.orenjitrade.api.inventory.domain.InventoryChanges.ImportOutcome;
import com.orenjitrade.api.inventory.domain.InventoryChanges.ItemPatch;
import com.orenjitrade.api.inventory.domain.InventoryChanges.MergeKey;
import com.orenjitrade.api.inventory.domain.InventoryChanges.NewItem;
import com.orenjitrade.api.inventory.domain.InventoryChanges.OwnedCopies;
import com.orenjitrade.api.inventory.domain.InventoryChanges.OwnerQuery;
import com.orenjitrade.api.inventory.domain.InventoryChanges.SkipReason;
import com.orenjitrade.api.inventory.domain.InventoryChanges.Skipped;
import com.orenjitrade.api.inventory.domain.ItemImageProcessor.ImageRejectedException;
import com.orenjitrade.api.inventory.infra.InventoryImageRepository;
import com.orenjitrade.api.inventory.infra.InventoryImageRepository.ImageRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.BinderStatsRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.Confirmed;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.CoverRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.DeleteState;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.KeyCardRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.LockedItem;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.MergeCandidate;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.PreviewRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.SummaryRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.Values;
import com.orenjitrade.api.limits.domain.LimitDecision;
import com.orenjitrade.api.limits.domain.LimitReachedException;
import com.orenjitrade.api.limits.domain.Limits;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Currency;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The inventory module's service interface (Phase 3 contract "Endpoints — inventory"): the owner's
 * items (list, create, update, soft delete, confirm, photos, bulk operations, summary) and the item
 * side of binder operations. Every write re-evaluates the effective public visibility through
 * {@link ListingReconciler}, which emits the publication events.
 *
 * <p>Defaults: an item created inside a binder is PUBLIC (the binder decides whether it shows), an
 * unfiled one PRIVATE. Moving items out of a binder to "no binder" never exposes them: they keep
 * their visibility only when the binder was PUBLIC without an end date, otherwise they become
 * PRIVATE. Making an item public confirms it (the owner asserts it is available).
 *
 * <p>Locks: every write here that can reach a binder row (the item count trigger on a filed item's
 * {@code binder_id} or {@code deleted_at}, a confirmation or move that refreshes the binder, the
 * reconciliation of a binder's items) first takes the owner lock of the collector, so the writes of
 * one collector run one after the other, then the binder rows before the item rows, both in
 * ascending id ({@link #lockForWrite}). The listing reconciler and the binder writes do the same.
 * Item photos write one item row, never reach a binder and decide nothing about the listing: they
 * lock only that row.
 *
 * <p>Undo (stage R2): an owner's own delete (one item or a bulk delete) keeps the row and its
 * photos restorable for {@link #RESTORE_WINDOW} ({@link #restore}); the hourly housekeeping then
 * deletes the photos ({@link #closeRestoreWindows}). The other soft deletes (a trade, a binder
 * deleted with its cards) remove the photos at once.
 */
@Service
public class InventoryService {

    public static final int MAX_IMAGES = 4;
    public static final int NOTES_MAX = 2000;
    public static final int PUBLIC_NOTES_MAX = 500;
    public static final int QUANTITY_MAX = 9999;
    public static final int BULK_MAX = 500;

    /**
     * The inventory size limit ({@code usage_limit}, TOTAL: the collector's non-deleted items).
     * Seeded without a number (V113), so nothing is refused until an admin sets one.
     */
    public static final String INVENTORY_ITEMS_MAX = "inventory.items.max";

    public static final String DEFAULT_CONDITION = "NEAR_MINT";
    public static final String DEFAULT_CURRENCY = "CAD";

    /**
     * How long an owner's deleted item can be restored, with its photos (owner spec 2026-10-14,
     * section 16, default 4: "a deleted card can be restored for 10 minutes").
     */
    public static final Duration RESTORE_WINDOW = Duration.ofMinutes(10);

    static final String NOT_FOUND = "Inventory item not found";
    static final String IMAGE_NAMESPACE = "inventory";
    static final Pattern CODE = Pattern.compile(GameSchema.CODE);
    static final Pattern LANGUAGE = Pattern.compile("^[a-z]{2}$");
    static final BigDecimal PRICE_MAX = new BigDecimal("9999999999.99");

    /** The 409 BINDER_GAME_MISMATCH message (stage G). */
    static final String GAME_MISMATCH =
            "This card is of another game than the binder: a binder holds the cards of one game";

    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);

    private final InventoryItemRepository items;
    private final InventoryImageRepository images;
    private final BinderService binders;
    private final ListingReconciler reconciler;
    private final CatalogService catalog;
    private final GameService games;
    private final FreshnessEventLog freshnessEvents;
    private final ObjectStorage storage;
    private final ItemImageProcessor imageProcessor;
    private final TimeProvider timeProvider;
    private final Limits limits;
    private final TransactionTemplate transaction;

    public InventoryService(
            InventoryItemRepository items,
            InventoryImageRepository images,
            BinderService binders,
            ListingReconciler reconciler,
            CatalogService catalog,
            GameService games,
            FreshnessEventLog freshnessEvents,
            ObjectStorage storage,
            ItemImageProcessor imageProcessor,
            TimeProvider timeProvider,
            Limits limits,
            PlatformTransactionManager transactionManager) {
        this.items = items;
        this.images = images;
        this.binders = binders;
        this.reconciler = reconciler;
        this.catalog = catalog;
        this.games = games;
        this.freshnessEvents = freshnessEvents;
        this.storage = storage;
        this.imageProcessor = imageProcessor;
        this.timeProvider = timeProvider;
        this.limits = limits;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** {@code GET /inventory/items}: one page of the owner's items. */
    @Transactional(readOnly = true)
    public PageResponse<InventoryItemView> list(UUID ownerId, OwnerQuery query) {
        validateGame(query.game());
        if (query.binderId() != null) {
            binders.requireOwned(ownerId, query.binderId());
        }
        InventoryItemRepository.Page page = items.ownerPage(ownerId, query, timeProvider.now());
        return PageResponse.of(views(page.rows()), query.page(), query.size(), page.total());
    }

    /** One of the owner's items ({@code 404} otherwise). */
    @Transactional(readOnly = true)
    public InventoryItemView get(UUID ownerId, UUID itemId) {
        ItemRow row =
                items.findOwned(ownerId, itemId, timeProvider.now())
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        return views(List.of(row)).get(0);
    }

    /** {@code GET /inventory/summary}. */
    @Transactional(readOnly = true)
    public InventorySummary summary(UUID ownerId) {
        Instant now = timeProvider.now();
        SummaryRow row = items.summary(ownerId, now);
        @Nullable Instant nextExpiry = row.nextExpiry();
        Optional<Instant> binderExpiry = binders.nextExpiry(ownerId);
        if (binderExpiry.isPresent()
                && (nextExpiry == null || binderExpiry.get().isBefore(nextExpiry))) {
            nextExpiry = binderExpiry.get();
        }
        return new InventorySummary(
                row.totalItems(),
                row.totalQuantity(),
                row.privateCount(),
                row.publicCount(),
                row.temporaryCount(),
                items.countByGame(ownerId),
                row.aging(),
                row.stale(),
                row.hidden(),
                row.effectivePublic(),
                nextExpiry);
    }

    /** Every non-deleted item of the owner (export). */
    @Transactional(readOnly = true)
    public List<InventoryItemView> allOf(UUID ownerId) {
        List<InventoryItemView> result = new ArrayList<>();
        int page = 0;
        while (true) {
            InventoryItemRepository.Page slice =
                    items.ownerPage(
                            ownerId,
                            new OwnerQuery(
                                    null,
                                    null,
                                    null,
                                    false,
                                    null,
                                    false,
                                    null,
                                    null,
                                    null,
                                    InventoryChanges.SortKey.NAME,
                                    false,
                                    page,
                                    500),
                            timeProvider.now());
            result.addAll(views(slice.rows()));
            if ((long) (page + 1) * 500 >= slice.total()) {
                return result;
            }
            page++;
        }
    }

    // ---------------------------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /inventory/items}. {@code 429 LIMIT_REACHED} beyond the usage limit {@code
     * inventory.items.max} (unlimited until an admin gives it a number).
     */
    @Transactional
    public InventoryItemView create(UUID ownerId, NewItem input) {
        Instant now = timeProvider.now();
        binders.lockOwners(List.of(ownerId));
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable PrintingDetail printing = requirePrinting(input.printingId(), true, errors);
        @Nullable BinderView binder = null;
        if (input.binderId() != null) {
            // Binder first (lock order): the insert counts the item in it and confirms it.
            binders.lockInOrder(ownerId, List.of(input.binderId()));
            binder = binders.requireOwned(ownerId, input.binderId());
        }
        ListingVisibility visibility =
                input.visibility() != null
                        ? input.visibility()
                        : input.binderId() != null
                                ? ListingVisibility.PUBLIC
                                : ListingVisibility.PRIVATE;
        errors.addAll(
                PublicVisibilityRules.validatePublicUntil(visibility, input.publicUntil(), now));
        if (printing == null) {
            throw ApiException.validation("Validation failed", errors);
        }
        binder = binderForCard(binder, printing.card().game(), now);
        boolean conditionStated = !Boolean.FALSE.equals(input.conditionStated());
        if (!conditionStated && !blank(input.condition())) {
            errors.add(
                    new ProblemFieldError(
                            "condition", "must be absent when conditionStated is false"));
        }
        if (input.askingPriceText() != null && input.askingPrice() != null) {
            errors.add(
                    new ProblemFieldError(
                            "askingPriceText", "send askingPrice or askingPriceText, not both"));
        }
        Values values =
                values(
                        printing,
                        input.binderId(),
                        input.quantity() != null ? input.quantity() : 1,
                        input.condition(),
                        conditionStated,
                        input.language(),
                        input.edition(),
                        input.finish(),
                        input.askingPrice(),
                        input.askingPriceText() != null
                                ? PriceInput.typed(input.askingPriceText())
                                : PriceInput.NONE,
                        input.currency(),
                        input.availability() != null
                                ? input.availability()
                                : Availability.COLLECTION_ONLY,
                        input.acceptsOffers() != null && input.acceptsOffers(),
                        input.notes(),
                        input.publicNotes(),
                        visibility,
                        input.publicUntil(),
                        errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        // Under the owner lock: no other write of the collector adds an item between the count
        // and the insert.
        limits.consume(ownerId, INVENTORY_ITEMS_MAX);
        UUID id = UUID.randomUUID();
        items.insert(values, id, ownerId, now);
        if (input.binderId() != null) {
            binders.recordItemActivity(ownerId, List.of(input.binderId()), now);
            reconciler.binders(List.of(input.binderId()));
        } else {
            reconciler.items(List.of(id));
        }
        log.info("Inventory item created owner={} item={} visibility={}", ownerId, id, visibility);
        return get(ownerId, id);
    }

    /** {@code PATCH /inventory/items/{id}}: any subset of the fields. */
    @Transactional
    public InventoryItemView update(UUID ownerId, UUID itemId, ItemPatch patch) {
        List<UUID> targetBinder =
                patch.has("binderId") && patch.binderId() != null
                        ? List.of(patch.binderId())
                        : List.of();
        if (!lockForWrite(ownerId, List.of(itemId), targetBinder).containsKey(itemId)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        Instant now = timeProvider.now();
        ItemRow current =
                items.findOwned(ownerId, itemId, now)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        List<ProblemFieldError> errors = new ArrayList<>();

        boolean printingChanged =
                patch.has("printingId")
                        && patch.printingId() != null
                        && !patch.printingId().equals(current.printingId());
        // A new printing must be of an ACTIVE game; the current one may belong to a game an admin
        // hid since (the owner can still edit the item).
        @Nullable PrintingDetail printing =
                requirePrinting(
                        printingChanged ? patch.printingId() : current.printingId(),
                        printingChanged,
                        errors);
        if (printing == null) {
            throw ApiException.validation("Validation failed", errors);
        }

        @Nullable UUID binderId = patch.has("binderId") ? patch.binderId() : current.binderId();
        @Nullable BinderView target =
                binderId == null ? null : binders.requireOwned(ownerId, binderId);
        boolean moved = !Objects.equals(binderId, current.binderId());
        if (moved || printingChanged) {
            target = binderForCard(target, printing.card().game(), now);
        }

        ListingVisibility visibility =
                patch.has("visibility") && patch.visibility() != null
                        ? patch.visibility()
                        : current.visibility();
        @Nullable Instant publicUntil =
                patch.has("publicUntil") ? patch.publicUntil() : current.publicUntil();
        if (moved && binderId == null && !patch.has("visibility")) {
            visibility = unfiledVisibility(ownerId, current, visibility);
            if (visibility == ListingVisibility.PRIVATE) {
                publicUntil = null;
            }
        }
        boolean visibilityChanged =
                visibility != current.visibility()
                        || (visibility == ListingVisibility.TEMPORARILY_PUBLIC
                                && !Objects.equals(publicUntil, current.publicUntil()));
        if (visibilityChanged) {
            errors.addAll(PublicVisibilityRules.validatePublicUntil(visibility, publicUntil, now));
        }

        // The price: a text sent sets the text and its amount; an amount sent without a text (the
        // paused web) sets the amount and drops the text, which no longer says the same; neither
        // keeps both as they are.
        if (patch.has("askingPrice") && patch.has("askingPriceText")) {
            errors.add(
                    new ProblemFieldError(
                            "askingPriceText", "send askingPrice or askingPriceText, not both"));
        }
        PriceInput priceText =
                patch.has("askingPriceText")
                        ? PriceInput.typed(patch.askingPriceText())
                        : patch.has("askingPrice")
                                ? PriceInput.NONE
                                : PriceInput.kept(current.askingPriceText());
        // A condition sent states it; otherwise a card without a stated condition keeps none.
        boolean conditionStated = patch.has("condition") || current.conditionStated();
        Values values =
                values(
                        printing,
                        binderId,
                        patch.has("quantity") && patch.quantity() != null
                                ? patch.quantity()
                                : current.quantity(),
                        patch.has("condition") ? patch.condition() : current.condition(),
                        conditionStated,
                        patch.has("language")
                                ? patch.language()
                                : printingChanged ? null : current.language(),
                        patch.has("edition")
                                ? patch.edition()
                                : printingChanged ? null : current.edition(),
                        patch.has("finish")
                                ? patch.finish()
                                : printingChanged ? null : current.finish(),
                        patch.has("askingPrice") ? patch.askingPrice() : current.askingPrice(),
                        priceText,
                        patch.has("currency") ? patch.currency() : current.currency(),
                        patch.has("availability") && patch.availability() != null
                                ? patch.availability()
                                : current.availability(),
                        patch.has("acceptsOffers") && patch.acceptsOffers() != null
                                ? patch.acceptsOffers()
                                : current.acceptsOffers(),
                        patch.has("notes") ? patch.notes() : current.notes(),
                        patch.has("publicNotes") ? patch.publicNotes() : current.publicNotes(),
                        visibility,
                        publicUntil,
                        errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        items.update(itemId, values, now);
        Set<UUID> touchedBinders = new HashSet<>();
        if (patch.confirm() || (visibilityChanged && visibility.isPublic())) {
            // A save from the phone's Edit card counts as "still available" (stage R2), as making
            // the item public always did.
            touchedBinders.addAll(confirmItems(ownerId, List.of(itemId), now));
        }
        if (moved && target != null) {
            touchedBinders.add(target.id());
        }
        binders.recordItemActivity(ownerId, touchedBinders, now);
        reconciler.binders(touchedBinders);
        reconciler.items(List.of(itemId));
        return get(ownerId, itemId);
    }

    /**
     * {@code DELETE /inventory/items/{id}}: soft delete. The owner can {@link #restore} the item
     * for {@link #RESTORE_WINDOW}; its photos are deleted once that window has passed.
     */
    @Transactional
    public void delete(UUID ownerId, UUID itemId) {
        if (!lockForWrite(ownerId, List.of(itemId), List.of()).containsKey(itemId)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        softDeleteRestorable(List.of(itemId), timeProvider.now());
        reconciler.items(List.of(itemId));
    }

    /**
     * {@code POST /inventory/items/{id}/restore} (stage R2, "Undo"): brings back an item the owner
     * deleted less than {@link #RESTORE_WINDOW} ago, exactly as it was: copies, prices, notes,
     * photos, binder and visibility (its listing is reconciled again). A live item is answered as
     * it is (a repeated undo). {@code 404} for unknown and other owners' items, {@code 409
     * RESTORE_WINDOW_CLOSED} once the window has passed or for an item that left in another way (a
     * trade, its binder deleted with it); {@code 429 LIMIT_REACHED} when the inventory reached
     * {@code inventory.items.max} meanwhile.
     */
    @Transactional
    public InventoryItemView restore(UUID ownerId, UUID itemId) {
        Instant now = timeProvider.now();
        // The lock order of every item write: the owner, the binder, then the item. Under the owner
        // lock no other write of the collector moves the item between this read and the locks.
        binders.lockOwners(List.of(ownerId));
        Optional<UUID> binderId =
                items.binderOfAnyState(ownerId, itemId)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        binderId.ifPresent(id -> binders.lockInOrder(ownerId, List.of(id)));
        DeleteState state =
                items.lockDeleteState(ownerId, itemId)
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (state.deletedAt() == null) {
            return get(ownerId, itemId);
        }
        if (state.restorableUntil() == null || !state.restorableUntil().isAfter(now)) {
            throw new ApiException(
                    ErrorCode.RESTORE_WINDOW_CLOSED,
                    "This card can no longer be restored: it was deleted more than "
                            + RESTORE_WINDOW.toMinutes()
                            + " minutes ago");
        }
        limits.consume(ownerId, INVENTORY_ITEMS_MAX);
        items.restore(itemId, now);
        if (state.binderId() != null) {
            reconciler.binders(List.of(state.binderId()));
        }
        reconciler.items(List.of(itemId));
        log.info("Inventory item restored owner={} item={}", ownerId, itemId);
        return get(ownerId, itemId);
    }

    /**
     * Closes the restore windows that have passed and deletes the photos of those items (after the
     * commit); at most {@code limit} items per call. The hourly housekeeping of the freshness job.
     *
     * @return the items whose window was closed
     */
    @Transactional
    public int closeRestoreWindows(int limit) {
        List<UUID> closed = items.closeRestoreWindows(timeProvider.now(), limit);
        deleteObjectsAfterCommit(images.deleteByItems(closed));
        if (!closed.isEmpty()) {
            log.info("Restore windows closed items={}", closed.size());
        }
        return closed.size();
    }

    /** {@code POST /inventory/items/{id}/confirm}: refreshes the confirmation, HIDDEN → ACTIVE. */
    @Transactional
    public InventoryItemView confirm(UUID ownerId, UUID itemId) {
        if (!lockForWrite(ownerId, List.of(itemId), List.of()).containsKey(itemId)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        Instant now = timeProvider.now();
        Set<UUID> touchedBinders = confirmItems(ownerId, List.of(itemId), now);
        binders.recordItemActivity(ownerId, touchedBinders, now);
        reconciler.binders(touchedBinders);
        reconciler.items(List.of(itemId));
        return get(ownerId, itemId);
    }

    /**
     * Admin restore (Phase 7 "admin restore with audit"): refreshes the confirmation of any owner's
     * live item (STALE/HIDDEN to ACTIVE, RESTORED freshness event) without counting as owner
     * activity. The caller audits.
     *
     * @return the owner and the state before the restore; empty for unknown or deleted items
     */
    @Transactional
    public Optional<AdminChange> restoreListing(UUID itemId) {
        Optional<UUID> owner =
                Optional.ofNullable(lockForWrite(null, List.of(itemId), List.of()).get(itemId))
                        .map(LockedItem::ownerId);
        if (owner.isEmpty()) {
            return Optional.empty();
        }
        Instant now = timeProvider.now();
        ItemRow before = items.findOwned(owner.get(), itemId, now).orElseThrow();
        Set<UUID> touchedBinders = confirmItems(owner.get(), List.of(itemId), now);
        reconciler.binders(touchedBinders);
        reconciler.items(List.of(itemId));
        return Optional.of(
                new AdminChange(
                        owner.get(), before.freshnessState().name(), before.visibility().name()));
    }

    /**
     * Admin hide (Phase 7 console "Listings"): makes any owner's live item PRIVATE (the owner may
     * publish it again). The caller audits. Like every write that changes whether an item is
     * listed, it runs under the owner lock: the reconciliation of a privacy change of the same
     * collector then decides on the item as the hide left it.
     *
     * @return the owner and the state before; empty for unknown or deleted items
     */
    @Transactional
    public Optional<AdminChange> hideListing(UUID itemId) {
        Optional<UUID> owner =
                Optional.ofNullable(lockForWrite(null, List.of(itemId), List.of()).get(itemId))
                        .map(LockedItem::ownerId);
        if (owner.isEmpty()) {
            return Optional.empty();
        }
        Instant now = timeProvider.now();
        ItemRow before = items.findOwned(owner.get(), itemId, now).orElseThrow();
        items.setVisibility(itemId, ListingVisibility.PRIVATE, null, now);
        reconciler.items(List.of(itemId));
        return Optional.of(
                new AdminChange(
                        owner.get(), before.freshnessState().name(), before.visibility().name()));
    }

    /**
     * An admin change of an item.
     *
     * @param ownerId the owner
     * @param previousFreshness freshness state before the change
     * @param previousVisibility visibility before the change
     */
    public record AdminChange(UUID ownerId, String previousFreshness, String previousVisibility) {}

    /**
     * {@code POST /inventory/items/bulk}: one transaction; every id is checked against the caller
     * (others' items, unknown and deleted ones are skipped as NOT_FOUND, items already in the
     * requested state as UNCHANGED).
     */
    @Transactional
    public BulkResult bulk(UUID ownerId, BulkRequest request) {
        Instant now = timeProvider.now();
        List<UUID> ids = List.copyOf(new LinkedHashSet<>(request.itemIds()));
        validateBulk(request, now);
        @Nullable UUID targetId =
                request.action() == BulkAction.MOVE_TO_BINDER ? request.binderId() : null;
        // Locks first (the binders, the target included, then the caller's live items), then the
        // rows are read: nothing below decides on a state another request can still change.
        Set<UUID> lockedIds =
                lockForWrite(ownerId, ids, targetId == null ? List.of() : List.of(targetId))
                        .keySet();
        @Nullable BinderView target =
                targetId == null ? null : binders.requireOwned(ownerId, targetId);
        Map<UUID, ItemRow> owned = new LinkedHashMap<>();
        for (ItemRow row : items.findByIds(lockedIds, now)) {
            owned.put(row.id(), row);
        }
        if (target != null && target.gameFollowsCards()) {
            // A binder made without a game (the paused web) takes the game of the first card moved
            // in while it holds none, and refuses none (stage G).
            for (UUID id : ids) {
                ItemRow first = owned.get(id);
                if (first != null) {
                    target = binders.followCardGame(target, first.game(), binderEmpty(target, now));
                    break;
                }
            }
        }
        List<Skipped> skipped = new ArrayList<>();
        List<UUID> changed = new ArrayList<>();
        for (UUID id : ids) {
            if (!owned.containsKey(id)) {
                skipped.add(new Skipped(id, SkipReason.NOT_FOUND));
                continue;
            }
            ItemRow row = owned.get(id);
            if (request.action() == BulkAction.MOVE_TO_BINDER
                    && target != null
                    && !target.gameFollowsCards()
                    && !target.game().equals(row.game())) {
                // A binder holds the cards of one game (stage G): this card stays where it was.
                skipped.add(new Skipped(id, SkipReason.BINDER_GAME_MISMATCH));
                continue;
            }
            boolean applied =
                    switch (request.action()) {
                        case SET_VISIBILITY -> setVisibility(row, request, now);
                        case MOVE_TO_BINDER -> move(ownerId, row, target, now);
                        case SET_AVAILABILITY -> {
                            Availability availability =
                                    Objects.requireNonNull(request.availability());
                            if (row.availability() == availability) {
                                yield false;
                            }
                            items.setAvailability(id, availability, now);
                            yield true;
                        }
                        case CONFIRM, DELETE -> true;
                    };
            if (applied) {
                changed.add(id);
            } else {
                skipped.add(new Skipped(id, SkipReason.UNCHANGED));
            }
        }
        Set<UUID> touchedBinders = new HashSet<>();
        switch (request.action()) {
            case CONFIRM -> touchedBinders.addAll(confirmItems(ownerId, changed, now));
            case DELETE -> softDeleteRestorable(changed, now);
            case SET_VISIBILITY -> {
                if (request.visibility() != null && request.visibility().isPublic()) {
                    touchedBinders.addAll(confirmItems(ownerId, changed, now));
                }
            }
            case MOVE_TO_BINDER -> {
                if (target != null && !changed.isEmpty()) {
                    touchedBinders.add(target.id());
                }
            }
            case SET_AVAILABILITY -> {}
        }
        binders.recordItemActivity(ownerId, touchedBinders, now);
        reconciler.binders(touchedBinders);
        reconciler.items(changed);
        log.info(
                "Bulk {} owner={} updated={} skipped={}",
                request.action(),
                ownerId,
                changed.size(),
                skipped.size());
        return new BulkResult(changed.size(), skipped);
    }

    // ---------------------------------------------------------------------------------------
    // Import (stage S5)
    // ---------------------------------------------------------------------------------------

    /**
     * Writes one chunk of an import: at most {@value #BULK_MAX} lines, each an item to create
     * (PRIVATE, unfiled, like every imported item) or the copies to add to the owner's equal
     * private item (same printing, condition, edition and language; the oldest). An item the owner
     * shows is never raised: an imported copy is private until its owner publishes it. It follows
     * the rule of a new bulk write (docs/database/schema.md, "Locks of binders and inventory
     * items"): the owner lock first, then the binders of the items it raises and those items in
     * ascending id ({@link #lockForWrite}), one statement per row it holds, and the reconciliation
     * in the same transaction.
     *
     * <p>The lines are validated and normalised by the caller before its transaction starts:
     * nothing here reads the catalog or does anything slow while the lock is held. The caller runs
     * one transaction per chunk and the chunks of a collector one after the other.
     *
     * @param plannedNew the new items the commit reserved for this chunk under {@link
     *     #INVENTORY_ITEMS_MAX} when it started ({@code null}: it reserved nothing, no limit
     *     applied). The chunk creates exactly as many unless the owner deleted, since then, an item
     *     a line was going to raise: that line is a new item after all, and it is only written when
     *     the limit still has room for it
     * @throws IllegalArgumentException for more than {@value #BULK_MAX} lines
     * @throws LimitReachedException when the chunk needs more room than the commit reserved and the
     *     limit has none left (nothing of the chunk is written)
     */
    @Transactional
    public ImportOutcome importLines(
            UUID ownerId, List<ImportLine> lines, @Nullable Integer plannedNew) {
        if (lines.size() > BULK_MAX) {
            throw new IllegalArgumentException("An import chunk holds at most " + BULK_MAX);
        }
        Instant now = timeProvider.now();
        // The owner lock, before any row: the equal items are read under it, so no other write
        // of the collector deletes or changes one between that read and the row locks.
        binders.lockOwners(List.of(ownerId));
        Map<MergeKey, MergeCandidate> targets = mergeTargets(ownerId, lines);
        Map<UUID, LockedItem> locked =
                lockForWrite(
                        ownerId,
                        targets.values().stream().map(MergeCandidate::id).toList(),
                        List.of());
        if (plannedNew != null) {
            long creating =
                    lines.stream()
                            .filter(
                                    line -> {
                                        @Nullable MergeCandidate target = targets.get(line.key());
                                        return target == null || !locked.containsKey(target.id());
                                    })
                            .count();
            requireRoomBeyondReserved(ownerId, creating - plannedNew);
        }
        List<UUID> written = new ArrayList<>();
        int created = 0;
        int merged = 0;
        int copies = 0;
        int notAdded = 0;
        for (ImportLine line : lines) {
            @Nullable MergeCandidate target = targets.get(line.key());
            if (target != null && locked.containsKey(target.id())) {
                int added = Math.min(line.quantity(), QUANTITY_MAX - target.quantity());
                if (added > 0) {
                    items.addQuantity(target.id(), added, now);
                }
                merged++;
                copies += added;
                notAdded += line.quantity() - added;
                written.add(target.id());
            } else {
                UUID id = UUID.randomUUID();
                items.insert(
                        new Values(
                                null,
                                line.printingId(),
                                line.quantity(),
                                line.condition(),
                                line.language(),
                                line.edition(),
                                line.finish(),
                                null,
                                DEFAULT_CURRENCY,
                                Availability.COLLECTION_ONLY,
                                false,
                                "",
                                "",
                                ListingVisibility.PRIVATE,
                                null),
                        id,
                        ownerId,
                        now);
                created++;
                copies += line.quantity();
                written.add(id);
            }
        }
        reconciler.items(written);
        log.info(
                "Inventory import chunk owner={} created={} merged={} copies={}",
                ownerId,
                created,
                merged,
                copies);
        return new ImportOutcome(created, merged, copies, notAdded);
    }

    /**
     * Refuses a chunk that creates {@code extra} items more than its commit reserved ({@code 429
     * LIMIT_REACHED} with {@code requested}), unless {@link #INVENTORY_ITEMS_MAX} has room for
     * them. The usage already holds the live items and what the collector's commits reserved, this
     * chunk's part included. The caller holds the owner lock.
     */
    private void requireRoomBeyondReserved(UUID ownerId, long extra) {
        if (extra <= 0) {
            return;
        }
        LimitDecision decision = limits.check(ownerId, INVENTORY_ITEMS_MAX);
        @Nullable Integer max = decision.limit();
        long used = decision.used() == null ? 0 : decision.used();
        if (max != null && used + extra > max) {
            throw new LimitReachedException(decision).withProperty("requested", extra);
        }
    }

    /**
     * The keys of the lines that would become a new item (no equal private item to raise): what an
     * import adds to the usage of {@link #INVENTORY_ITEMS_MAX}. The caller holds the owner lock.
     */
    @Transactional(readOnly = true)
    public Set<MergeKey> newKeysOf(UUID ownerId, List<ImportLine> lines) {
        Map<MergeKey, MergeCandidate> targets = mergeTargets(ownerId, lines);
        Set<MergeKey> fresh = new HashSet<>();
        for (ImportLine line : lines) {
            if (!targets.containsKey(line.key())) {
                fresh.add(line.key());
            }
        }
        return fresh;
    }

    /**
     * The copies the owner already holds per {@link MergeKey} among these printings, in private
     * items (a preview shows what a row would be added to) and in items the owner shows (a preview
     * says that the row becomes a private item next to them).
     */
    @Transactional(readOnly = true)
    public OwnedCopies ownedCopies(UUID ownerId, Collection<UUID> printingIds) {
        Map<MergeKey, Integer> privateCopies = new HashMap<>();
        Map<MergeKey, Integer> shownCopies = new HashMap<>();
        for (MergeCandidate item : items.mergeCandidates(ownerId, printingIds)) {
            (item.privateItem() ? privateCopies : shownCopies)
                    .merge(
                            new MergeKey(
                                    item.printingId(),
                                    item.condition(),
                                    item.edition(),
                                    item.language()),
                            item.quantity(),
                            Integer::sum);
        }
        return new OwnedCopies(privateCopies, shownCopies);
    }

    /**
     * The owner's private item each line would be added to (the oldest equal one), by key. An item
     * the owner shows is no target: an import never raises it.
     */
    private Map<MergeKey, MergeCandidate> mergeTargets(UUID ownerId, List<ImportLine> lines) {
        Map<MergeKey, MergeCandidate> targets = new HashMap<>();
        if (lines.isEmpty()) {
            return targets;
        }
        Set<MergeKey> wanted = new HashSet<>();
        Set<UUID> printingIds = new LinkedHashSet<>();
        for (ImportLine line : lines) {
            wanted.add(line.key());
            printingIds.add(line.printingId());
        }
        for (MergeCandidate item : items.mergeCandidates(ownerId, printingIds)) {
            MergeKey key =
                    new MergeKey(
                            item.printingId(), item.condition(), item.edition(), item.language());
            if (item.privateItem() && wanted.contains(key)) {
                targets.putIfAbsent(key, item);
            }
        }
        return targets;
    }

    // ---------------------------------------------------------------------------------------
    // Photos
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /inventory/items/{id}/images}: at most {@value #MAX_IMAGES} photos per item
     * ({@code 409} beyond), re-encoded without metadata; {@code 413} above 8 MB, {@code 415} for
     * other types, {@code 400} for unreadable images.
     */
    public InventoryItemView addImage(UUID ownerId, UUID itemId, byte[] upload) {
        Boolean exists =
                transaction.execute(
                        status -> items.findOwned(ownerId, itemId, timeProvider.now()).isPresent());
        if (!Boolean.TRUE.equals(exists)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        ItemImageProcessor.Processed processed;
        try {
            processed = imageProcessor.process(upload);
        } catch (ImageRejectedException e) {
            throw ItemImageProcessor.problem(e);
        }
        String key =
                ObjectKeys.newKey(IMAGE_NAMESPACE, ownerId, ItemImageProcessor.OUTPUT_EXTENSION);
        storage.put(key, processed.jpeg(), ItemImageProcessor.OUTPUT_CONTENT_TYPE);
        try {
            InventoryItemView view =
                    transaction.execute(
                            status -> {
                                if (!items.lockOwned(ownerId, itemId)) {
                                    throw ApiException.notFound(NOT_FOUND);
                                }
                                if (images.countByItem(itemId) >= MAX_IMAGES) {
                                    throw ApiException.conflict(
                                            "An item can have at most " + MAX_IMAGES + " images");
                                }
                                Instant now = timeProvider.now();
                                images.insert(
                                        UUID.randomUUID(),
                                        itemId,
                                        key,
                                        storage.publicUrl(key),
                                        processed.width(),
                                        processed.height(),
                                        images.nextSortOrder(itemId),
                                        now);
                                items.touch(itemId, now);
                                return get(ownerId, itemId);
                            });
            if (view == null) {
                throw new IllegalStateException("Image transaction returned nothing");
            }
            log.info(
                    "Inventory image stored owner={} item={} bytes={}",
                    ownerId,
                    itemId,
                    processed.jpeg().length);
            return view;
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }
    }

    /** {@code DELETE /inventory/items/{id}/images/{imageId}}. */
    @Transactional
    public void deleteImage(UUID ownerId, UUID itemId, UUID imageId) {
        if (!items.lockOwned(ownerId, itemId)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        String key =
                images.delete(itemId, imageId)
                        .orElseThrow(() -> ApiException.notFound("Image not found"));
        items.touch(itemId, timeProvider.now());
        deleteObjectsAfterCommit(List.of(key));
    }

    // ---------------------------------------------------------------------------------------
    // Offers and trades (Phase 8)
    // ---------------------------------------------------------------------------------------

    /**
     * Items by id for the two parties of an offer or a trade, whatever their visibility and
     * including soft-deleted ones (a negotiated card stays readable after it left the inventory).
     * Callers only ever map them to the public form (never the private notes). Unknown ids are
     * absent.
     */
    @Transactional(readOnly = true)
    public Map<UUID, InventoryItemView> itemsForParties(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, InventoryItemView> result = new LinkedHashMap<>();
        for (InventoryItemView view :
                views(
                        items.findByIds(
                                List.copyOf(new LinkedHashSet<>(itemIds)), timeProvider.now()))) {
            result.put(view.row().id(), view);
        }
        return result;
    }

    /**
     * The owner's non-deleted items among {@code itemIds} (Phase 8: the cards a buyer offers in
     * trade must be their own and still in the inventory; public visibility is not required).
     */
    @Transactional(readOnly = true)
    public Map<UUID, InventoryItemView> liveItemsOf(UUID ownerId, Collection<UUID> itemIds) {
        Map<UUID, InventoryItemView> result = new LinkedHashMap<>();
        Instant now = timeProvider.now();
        for (UUID id : new LinkedHashSet<>(itemIds)) {
            items.findOwned(ownerId, id, now)
                    .ifPresent(row -> result.put(row.id(), views(List.of(row)).get(0)));
        }
        return result;
    }

    /**
     * Completes the inventory side of a trade (Phase 8 contract {@code
     * InventoryService.reserveAndTransfer}): every line lowers the owner's item by the traded
     * copies (the seller's card −1, the buyer's trade cards −quantity); an item whose last copy
     * leaves is soft-deleted (photos removed) and unpublished. Items already deleted, or holding
     * fewer copies than traded, transfer what is left: the exchange happened, the inventory only
     * mirrors it. Joins the caller's transaction; the receiving collector adds the cards to their
     * own inventory themselves.
     *
     * @return one result per line, in order
     */
    @Transactional
    public List<TransferResult> reserveAndTransfer(List<TransferLine> lines) {
        Instant now = timeProvider.now();
        // The lines belong to two collectors and an item whose last copy leaves is soft-deleted
        // (its binder is recounted): both owner locks, every binder, then every item, before the
        // first line.
        lockForWrite(null, lines.stream().map(TransferLine::itemId).toList(), List.of());
        List<TransferResult> results = new ArrayList<>();
        List<UUID> removed = new ArrayList<>();
        List<UUID> touched = new ArrayList<>();
        for (TransferLine line : lines) {
            Optional<Integer> available = items.lockQuantity(line.ownerId(), line.itemId());
            if (available.isEmpty() || line.quantity() < 1) {
                results.add(new TransferResult(line.itemId(), line.quantity(), 0, 0, false));
                continue;
            }
            int take = Math.min(line.quantity(), available.get());
            int left = available.get() - take;
            if (left == 0) {
                softDelete(List.of(line.itemId()), now);
                removed.add(line.itemId());
            } else {
                items.decrementQuantity(line.itemId(), take, now);
            }
            touched.add(line.itemId());
            results.add(new TransferResult(line.itemId(), line.quantity(), take, left, left == 0));
        }
        if (!touched.isEmpty()) {
            reconciler.items(touched);
        }
        if (!removed.isEmpty()) {
            log.info("Trade transfer removed {} inventory item(s)", removed.size());
        }
        return results;
    }

    /**
     * One side of a trade transfer.
     *
     * @param itemId the inventory item
     * @param ownerId its owner (the party giving the card)
     * @param quantity copies traded
     */
    public record TransferLine(UUID itemId, UUID ownerId, int quantity) {}

    /**
     * Outcome of a {@link TransferLine}.
     *
     * @param itemId the inventory item
     * @param requested copies traded
     * @param transferred copies taken from the item (fewer when it held less or was deleted)
     * @param remaining copies left in the owner's inventory
     * @param removed whether the item was soft-deleted (its last copy left)
     */
    public record TransferResult(
            UUID itemId, int requested, int transferred, int remaining, boolean removed) {}

    // ---------------------------------------------------------------------------------------
    // Binder side (BinderContents)
    // ---------------------------------------------------------------------------------------

    /** Statistics per binder for binder views. */
    @Transactional(readOnly = true)
    public Map<UUID, BinderContents.Stats> binderStats(
            Collection<UUID> binderIds, boolean publicOnly) {
        Instant now = timeProvider.now();
        Map<UUID, BinderStatsRow> rows = new HashMap<>();
        for (BinderStatsRow row : items.binderStats(binderIds, now)) {
            rows.put(row.binderId(), row);
        }
        Map<UUID, String> covers = covers(items.binderCovers(binderIds, publicOnly, now));
        Map<UUID, BinderContents.Stats> result = new HashMap<>();
        for (UUID binderId : binderIds) {
            @Nullable BinderStatsRow row = rows.get(binderId);
            if (row == null) {
                continue;
            }
            result.put(
                    binderId,
                    new BinderContents.Stats(
                            row.itemCount(),
                            row.publicCount(),
                            publicOnly ? row.publicGames() : row.games(),
                            covers.get(binderId)));
        }
        return result;
    }

    /**
     * Up to {@code max} card pictures per binder: the printing images of its first items, one per
     * printing (a binder's preview pictures, stage R3).
     */
    @Transactional(readOnly = true)
    public Map<UUID, List<String>> binderPreviewImages(
            Collection<UUID> binderIds, boolean publicOnly, int max) {
        return printingImages(items.binderPreviews(binderIds, publicOnly, max, timeProvider.now()));
    }

    /**
     * The picture of each sold deck core: the catalog picture of the first card its sale took out
     * (stage R4, review fix 1, F7: a chat about it keeps its picture once it is sold).
     */
    @Transactional(readOnly = true)
    public Map<UUID, String> soldDeckCorePictures(Collection<UUID> binderIds) {
        Map<UUID, String> result = new HashMap<>();
        printingImages(items.soldCorePreviews(binderIds))
                .forEach((binderId, urls) -> result.put(binderId, urls.get(0)));
        return result;
    }

    /**
     * The catalog pictures of preview rows, per binder in their order (rows without one left out).
     */
    private Map<UUID, List<String>> printingImages(List<PreviewRow> rows) {
        if (rows.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> printingImages = new HashMap<>();
        for (PrintingSummary printing :
                catalog.printingsIncludingHidden(
                        rows.stream().map(PreviewRow::printingId).collect(Collectors.toSet()))) {
            if (!printing.images().isEmpty()) {
                printingImages.put(printing.id(), printing.images().get(0).url());
            }
        }
        Map<UUID, List<String>> result = new HashMap<>();
        for (PreviewRow row : rows) {
            @Nullable String url = printingImages.get(row.printingId());
            if (url != null) {
                result.computeIfAbsent(row.binderId(), id -> new ArrayList<>()).add(url);
            }
        }
        return result;
    }

    /**
     * The cards of each binder with their copies, most copies first (a deck core's key cards, stage
     * R3).
     */
    @Transactional(readOnly = true)
    public Map<UUID, List<KeyCard>> binderKeyCards(
            Collection<UUID> binderIds, boolean publicOnly, int max) {
        Map<UUID, List<KeyCard>> result = new HashMap<>();
        for (KeyCardRow row :
                items.binderKeyCards(binderIds, publicOnly, max, timeProvider.now())) {
            result.computeIfAbsent(row.binderId(), id -> new ArrayList<>())
                    .add(
                            new KeyCard(
                                    row.cardId(),
                                    row.cardName(),
                                    (int) Math.min(Integer.MAX_VALUE, row.copies())));
        }
        return result;
    }

    /** The owner confirmed or published a binder: confirm its items (no binder activity). */
    @Transactional
    public void confirmItemsOfBinder(UUID ownerId, UUID binderId, Instant now) {
        recordRestored(items.confirm(ownerId, null, binderId, now), now);
    }

    /**
     * Whether a deleted card that an undo can still bring back names the binder (stage G; the
     * binder's game is locked meanwhile).
     */
    public boolean holdsRestorableCards(UUID binderId, Instant now) {
        return items.countRestorableInBinder(binderId, now) > 0;
    }

    /** The binder is being deleted: soft-delete or unfile its items, then reconcile them. */
    @Transactional
    public void releaseBinderItems(
            UUID ownerId, UUID binderId, boolean deleteItems, boolean keepVisibility, Instant now) {
        // The cards deleted from this binder lately can no longer come back to it: their undo
        // ends with the binder, and their photos go now.
        deleteObjectsAfterCommit(
                images.deleteByItems(items.endRestoreWindowsInBinder(ownerId, binderId)));
        List<UUID> released;
        if (deleteItems) {
            released = items.softDeleteInBinder(ownerId, binderId, now);
            deleteObjectsAfterCommit(images.deleteByItems(released));
        } else {
            released = items.unfileBinder(ownerId, binderId, keepVisibility, now);
        }
        reconciler.items(released);
    }

    // ---------------------------------------------------------------------------------------
    // Account deletion
    // ---------------------------------------------------------------------------------------

    /** Deletes every item and photo of the owner (account purge); returns the item count. */
    @Transactional
    public int purge(UUID ownerId) {
        // The reconciler takes the owner lock and every binder of the owner, which the delete
        // below recounts.
        reconciler.owner(ownerId);
        List<UUID> ids = items.lockAllOf(ownerId);
        deleteObjectsAfterCommit(images.deleteByItems(ids));
        return items.deleteAllOf(ownerId);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    /**
     * Takes the locks of an item write in the one order every path uses: the owner lock of the
     * collector (of both collectors of a trade transfer), then the binders the items are filed in
     * and {@code otherBinderIds} (a move target), in ascending id, then the live items among {@code
     * itemIds}, in ascending id.
     *
     * <p>The binders are read under the owner lock: no other write of the collector can move one of
     * the items between that read and the row locks.
     *
     * @param ownerId only this owner's items and binders when given (ids taken from a request);
     *     {@code null} for admin and trade writes, whose ids are not the caller's to choose
     * @return the locked items by id (unknown, deleted and other owners' items are absent)
     */
    private Map<UUID, LockedItem> lockForWrite(
            @Nullable UUID ownerId, Collection<UUID> itemIds, Collection<UUID> otherBinderIds) {
        binders.lockOwners(ownerId != null ? List.of(ownerId) : items.ownersOf(itemIds));
        Set<UUID> binderIds = new HashSet<>(items.binderIdsOf(ownerId, itemIds));
        binderIds.addAll(otherBinderIds);
        binders.lockInOrder(ownerId, binderIds);
        Map<UUID, LockedItem> locked = new LinkedHashMap<>();
        for (LockedItem item : items.lockAll(ownerId, itemIds)) {
            locked.put(item.id(), item);
        }
        return locked;
    }

    /** Items with their printings and photos (rows whose printing vanished are dropped). */
    List<InventoryItemView> views(List<ItemRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Set<UUID> printingIds = new LinkedHashSet<>();
        rows.forEach(row -> printingIds.add(row.printingId()));
        Map<UUID, PrintingSummary> printings = new HashMap<>();
        catalog.printingsIncludingHidden(printingIds)
                .forEach(printing -> printings.put(printing.id(), printing));
        Map<UUID, List<ItemImage>> photos = new HashMap<>();
        for (ImageRow image : images.findByItems(rows.stream().map(ItemRow::id).toList())) {
            photos.computeIfAbsent(image.itemId(), id -> new ArrayList<>())
                    .add(
                            new ItemImage(
                                    image.id(),
                                    storage.publicUrl(image.storageKey()),
                                    image.width(),
                                    image.height(),
                                    image.sortOrder()));
        }
        List<InventoryItemView> result = new ArrayList<>();
        for (ItemRow row : rows) {
            @Nullable PrintingSummary printing = printings.get(row.printingId());
            if (printing == null) {
                log.warn("Printing {} of item {} not found", row.printingId(), row.id());
                continue;
            }
            result.add(
                    new InventoryItemView(row, printing, photos.getOrDefault(row.id(), List.of())));
        }
        return result;
    }

    /** Confirms items and records RESTORED events; returns the binders of the confirmed items. */
    private Set<UUID> confirmItems(UUID ownerId, List<UUID> itemIds, Instant now) {
        List<Confirmed> confirmed = items.confirm(ownerId, itemIds, null, now);
        recordRestored(confirmed, now);
        Set<UUID> binderIds = new HashSet<>();
        confirmed.forEach(
                item -> {
                    if (item.binderId() != null) {
                        binderIds.add(item.binderId());
                    }
                });
        return binderIds;
    }

    private void recordRestored(List<Confirmed> confirmed, Instant now) {
        List<FreshnessEventLog.Entry> entries = new ArrayList<>();
        for (Confirmed item : confirmed) {
            if (item.previous() == FreshnessState.HIDDEN) {
                entries.add(
                        FreshnessEventLog.Entry.item(
                                item.ownerId(), item.itemId(), FreshnessEventType.RESTORED, now));
            }
        }
        freshnessEvents.record(entries);
    }

    private void softDelete(List<UUID> itemIds, Instant now) {
        for (UUID id : itemIds) {
            items.softDelete(id, now);
        }
        deleteObjectsAfterCommit(images.deleteByItems(itemIds));
    }

    /** An owner's own delete: restorable, photos kept, for {@link #RESTORE_WINDOW}. */
    private void softDeleteRestorable(List<UUID> itemIds, Instant now) {
        Instant until = now.plus(RESTORE_WINDOW);
        for (UUID id : itemIds) {
            items.softDelete(id, until, now);
        }
    }

    private boolean setVisibility(ItemRow row, BulkRequest request, Instant now) {
        ListingVisibility visibility = Objects.requireNonNull(request.visibility());
        @Nullable Instant publicUntil =
                PublicVisibilityRules.storedPublicUntil(visibility, request.publicUntil());
        if (row.visibility() == visibility && Objects.equals(row.publicUntil(), publicUntil)) {
            return false;
        }
        items.setVisibility(row.id(), visibility, publicUntil, now);
        return true;
    }

    private boolean move(UUID ownerId, ItemRow row, @Nullable BinderView target, Instant now) {
        @Nullable UUID targetId = target == null ? null : target.id();
        if (Objects.equals(row.binderId(), targetId)) {
            return false;
        }
        ListingVisibility visibility = row.visibility();
        @Nullable Instant publicUntil = row.publicUntil();
        if (targetId == null) {
            visibility = unfiledVisibility(ownerId, row, visibility);
            if (visibility == ListingVisibility.PRIVATE) {
                publicUntil = null;
            }
        }
        items.moveToBinder(row.id(), targetId, visibility, publicUntil, now);
        return true;
    }

    /**
     * A card goes only into a binder of its own game (stage G): {@code 409 BINDER_GAME_MISMATCH}
     * otherwise.
     */
    static void requireBinderGame(@Nullable BinderView binder, String cardGame) {
        if (binder != null && !binder.game().equals(cardGame)) {
            throw new ApiException(ErrorCode.BINDER_GAME_MISMATCH, GAME_MISMATCH);
        }
    }

    /**
     * A card of {@code cardGame} goes into {@code binder} (held by the caller). A binder made with
     * a game takes the cards of that game only ({@code 409 BINDER_GAME_MISMATCH}). A binder made
     * without one (the paused web, which has no game picker) takes the game of its first card while
     * it holds none ({@link BinderService#followCardGame}) and refuses no card: the web's own
     * binders keep mixing games as they did. Returns the binder as it now is.
     */
    private @Nullable BinderView binderForCard(
            @Nullable BinderView binder, String cardGame, Instant now) {
        if (binder == null) {
            return null;
        }
        if (binder.gameFollowsCards()) {
            // Made without a game (the paused web): it takes its first card's game and refuses
            // none, as the web's binders always did.
            return binders.followCardGame(binder, cardGame, binderEmpty(binder, now));
        }
        requireBinderGame(binder, cardGame);
        return binder;
    }

    /** No live card, and no deleted card whose undo can still bring it back (stage G). */
    boolean binderEmpty(BinderView binder, Instant now) {
        return binder.itemCount() == 0 && items.countRestorableInBinder(binder.id(), now) == 0;
    }

    /**
     * Visibility of an item leaving its binder for "no binder": kept only when the binder is PUBLIC
     * without an end date, otherwise PRIVATE (unfiling never exposes a card).
     */
    private ListingVisibility unfiledVisibility(
            UUID ownerId, ItemRow row, ListingVisibility requested) {
        if (row.binderId() == null || requested == ListingVisibility.PRIVATE) {
            return requested;
        }
        BinderView source = binders.requireOwned(ownerId, row.binderId());
        return source.visibility() == ListingVisibility.PUBLIC
                ? requested
                : ListingVisibility.PRIVATE;
    }

    private void validateBulk(BulkRequest request, Instant now) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (request.itemIds().isEmpty() || request.itemIds().size() > BULK_MAX) {
            errors.add(new ProblemFieldError("itemIds", "must contain 1 to 500 ids"));
        }
        switch (request.action()) {
            case SET_VISIBILITY -> {
                if (request.visibility() == null) {
                    errors.add(
                            new ProblemFieldError("visibility", "is required for SET_VISIBILITY"));
                } else {
                    errors.addAll(
                            PublicVisibilityRules.validatePublicUntil(
                                    request.visibility(), request.publicUntil(), now));
                }
            }
            case SET_AVAILABILITY -> {
                if (request.availability() == null) {
                    errors.add(
                            new ProblemFieldError(
                                    "availability", "is required for SET_AVAILABILITY"));
                }
            }
            case MOVE_TO_BINDER, CONFIRM, DELETE -> {}
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
    }

    private @Nullable PrintingDetail requirePrinting(
            @Nullable UUID printingId, boolean activeOnly, List<ProblemFieldError> errors) {
        if (printingId == null) {
            errors.add(new ProblemFieldError("printingId", "is required"));
            return null;
        }
        try {
            return catalog.printingDetail(printingId, activeOnly);
        } catch (ApiException e) {
            if (e.getErrorCode() != ErrorCode.NOT_FOUND) {
                throw e;
            }
            errors.add(new ProblemFieldError("printingId", "unknown printing"));
            return null;
        }
    }

    private void validateGame(@Nullable String game) {
        if (game != null && games.find(game).isEmpty()) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
    }

    /**
     * The asking price text of a write: {@link #NONE} (no text, the amount as sent: the paused
     * web), a text as typed (normalised and parsed by {@link #values}; it sets the amount too, and
     * an empty one clears both), or the stored text kept as it is (with its amount).
     *
     * @param text the text, {@code null} for none
     * @param source where the text comes from
     */
    record PriceInput(@Nullable String text, Source source) {

        enum Source {
            /** No text: the amount is the one sent (or kept). */
            AMOUNT,
            /** A text the collector typed, possibly empty: it decides the amount. */
            TYPED,
            /** The stored text and amount, unchanged. */
            KEPT
        }

        static final PriceInput NONE = new PriceInput(null, Source.AMOUNT);

        static PriceInput typed(@Nullable String sent) {
            return new PriceInput(AskingPriceText.normalise(sent), Source.TYPED);
        }

        static PriceInput kept(@Nullable String stored) {
            return new PriceInput(stored, Source.KEPT);
        }
    }

    /** Validates and normalises the column values of an item. */
    private Values values(
            PrintingDetail printing,
            @Nullable UUID binderId,
            int quantity,
            @Nullable String condition,
            boolean conditionStated,
            @Nullable String language,
            @Nullable String edition,
            @Nullable String finish,
            @Nullable BigDecimal askingPrice,
            PriceInput priceText,
            @Nullable String currency,
            Availability availability,
            boolean acceptsOffers,
            @Nullable String notes,
            @Nullable String publicNotes,
            ListingVisibility visibility,
            @Nullable Instant publicUntil,
            List<ProblemFieldError> errors) {
        if (quantity < 1 || quantity > QUANTITY_MAX) {
            errors.add(new ProblemFieldError("quantity", "must be between 1 and 9999"));
        }
        List<String> conditions =
                games.find(printing.card().game())
                        .map(GameView::schema)
                        .map(GameSchema::conditions)
                        .orElse(List.of());
        @Nullable String conditionCode =
                !conditionStated
                        ? null
                        : blank(condition)
                                ? defaultCondition(conditions)
                                : condition.trim().toUpperCase(Locale.ROOT);
        if (conditionCode != null
                && (!CODE.matcher(conditionCode).matches()
                        || (!conditions.isEmpty() && !conditions.contains(conditionCode)))) {
            errors.add(
                    new ProblemFieldError(
                            "condition",
                            conditions.isEmpty()
                                    ? "must be an upper-case condition code"
                                    : "must be one of " + String.join(", ", conditions)));
        }
        String languageCode =
                blank(language)
                        ? printing.printing().language()
                        : language.trim().toLowerCase(Locale.ROOT);
        if (!LANGUAGE.matcher(languageCode).matches()) {
            errors.add(new ProblemFieldError("language", "must be an ISO 639-1 code"));
        }
        String editionCode =
                blank(edition)
                        ? printing.printing().edition()
                        : edition.trim().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(editionCode).matches()) {
            errors.add(new ProblemFieldError("edition", "must be an edition code"));
        }
        String finishCode =
                blank(finish)
                        ? printing.printing().finish()
                        : finish.trim().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(finishCode).matches()) {
            errors.add(new ProblemFieldError("finish", "must be a finish code"));
        }
        @Nullable String typedPrice = priceText.text();
        if (priceText.source() == PriceInput.Source.TYPED) {
            @Nullable String problem = AskingPriceText.problem(typedPrice);
            if (problem != null) {
                errors.add(new ProblemFieldError("askingPriceText", problem));
            }
            // A plain amount ("12.50", "$12.50", "12,50 $") also gives the amount; any other text
            // has none, and an emptied price (no text) clears the amount it gave before.
            askingPrice = AskingPriceText.amountOf(typedPrice).orElse(null);
        }
        @Nullable BigDecimal price = null;
        if (askingPrice != null) {
            if (askingPrice.signum() < 0
                    || askingPrice.compareTo(PRICE_MAX) > 0
                    || askingPrice.stripTrailingZeros().scale() > 2) {
                errors.add(
                        new ProblemFieldError(
                                "askingPrice",
                                "must be between 0 and 9999999999.99 with at most 2 decimals"));
            } else {
                price = askingPrice.setScale(2, RoundingMode.UNNECESSARY);
            }
        }
        String currencyCode =
                blank(currency) ? DEFAULT_CURRENCY : currency.trim().toUpperCase(Locale.ROOT);
        if (!isCurrency(currencyCode)) {
            errors.add(new ProblemFieldError("currency", "must be an ISO 4217 currency code"));
        }
        String privateNotes = notes == null ? "" : notes.trim();
        if (privateNotes.length() > NOTES_MAX) {
            errors.add(new ProblemFieldError("notes", "must be at most 2000 characters"));
        }
        String shownNotes = publicNotes == null ? "" : publicNotes.trim();
        if (shownNotes.length() > PUBLIC_NOTES_MAX) {
            errors.add(new ProblemFieldError("publicNotes", "must be at most 500 characters"));
        }
        return new Values(
                binderId,
                printing.printing().id(),
                quantity,
                conditionCode,
                languageCode,
                editionCode,
                finishCode,
                price,
                typedPrice,
                currencyCode,
                availability,
                acceptsOffers,
                privateNotes,
                shownNotes,
                visibility,
                PublicVisibilityRules.storedPublicUntil(visibility, publicUntil));
    }

    private static String defaultCondition(List<String> conditions) {
        if (conditions.isEmpty() || conditions.contains(DEFAULT_CONDITION)) {
            return DEFAULT_CONDITION;
        }
        return conditions.get(0);
    }

    private static boolean isCurrency(String code) {
        if (!code.matches("^[A-Z]{3}$")) {
            return false;
        }
        try {
            Currency.getInstance(code);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static boolean blank(@Nullable String value) {
        return value == null || value.isBlank();
    }

    private Map<UUID, String> covers(List<CoverRow> rows) {
        Map<UUID, String> result = new HashMap<>();
        Set<UUID> printingIds = new HashSet<>();
        for (CoverRow row : rows) {
            if (row.imageKey() != null) {
                result.put(row.binderId(), storage.publicUrl(row.imageKey()));
            } else {
                printingIds.add(row.printingId());
            }
        }
        if (printingIds.isEmpty()) {
            return result;
        }
        Map<UUID, String> printingImages = new HashMap<>();
        for (PrintingSummary printing : catalog.printingsIncludingHidden(printingIds)) {
            List<PrintingImage> printingImagesList = printing.images();
            if (!printingImagesList.isEmpty()) {
                printingImages.put(printing.id(), printingImagesList.get(0).url());
            }
        }
        for (CoverRow row : rows) {
            if (row.imageKey() == null && printingImages.containsKey(row.printingId())) {
                result.put(row.binderId(), printingImages.get(row.printingId()));
            }
        }
        return result;
    }

    private void deleteObjectsAfterCommit(List<String> keys) {
        if (keys.isEmpty()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            keys.forEach(InventoryService.this::deleteQuietly);
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
            log.warn("Could not delete stored image {}: {}", key, e.getMessage());
        }
    }

    /**
     * {@code GET /inventory/summary}.
     *
     * @param totalItems non-deleted items
     * @param totalQuantity copies
     * @param privateCount items with visibility PRIVATE
     * @param publicCount items with visibility PUBLIC
     * @param temporaryCount items with visibility TEMPORARILY_PUBLIC
     * @param byGame items per game slug
     * @param agingCount AGING items
     * @param staleCount STALE items
     * @param hiddenCount HIDDEN items
     * @param effectivePublicCount items public right now
     * @param nextExpiry earliest future end of a temporary publication (items or binders)
     */
    public record InventorySummary(
            long totalItems,
            long totalQuantity,
            long privateCount,
            long publicCount,
            long temporaryCount,
            Map<String, Long> byGame,
            long agingCount,
            long staleCount,
            long hiddenCount,
            long effectivePublicCount,
            @Nullable Instant nextExpiry) {}
}
