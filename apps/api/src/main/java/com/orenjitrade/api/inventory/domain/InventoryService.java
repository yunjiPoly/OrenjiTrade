package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.BinderContents;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.BinderView;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.binders.domain.PublicVisibilityRules;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingDetail;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
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
import com.orenjitrade.api.inventory.domain.InventoryChanges.ItemPatch;
import com.orenjitrade.api.inventory.domain.InventoryChanges.NewItem;
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
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.SummaryRow;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.Values;
import java.math.BigDecimal;
import java.math.RoundingMode;
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
 */
@Service
public class InventoryService {

    public static final int MAX_IMAGES = 4;
    public static final int NOTES_MAX = 2000;
    public static final int PUBLIC_NOTES_MAX = 500;
    public static final int QUANTITY_MAX = 9999;
    public static final int BULK_MAX = 500;
    public static final String DEFAULT_CONDITION = "NEAR_MINT";
    public static final String DEFAULT_CURRENCY = "CAD";
    static final String NOT_FOUND = "Inventory item not found";
    static final String IMAGE_NAMESPACE = "inventory";
    static final Pattern CODE = Pattern.compile(GameSchema.CODE);
    static final Pattern LANGUAGE = Pattern.compile("^[a-z]{2}$");
    static final BigDecimal PRICE_MAX = new BigDecimal("9999999999.99");

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

    /** {@code POST /inventory/items}. */
    @Transactional
    public InventoryItemView create(UUID ownerId, NewItem input) {
        Instant now = timeProvider.now();
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable PrintingDetail printing = requirePrinting(input.printingId(), true, errors);
        if (input.binderId() != null) {
            binders.requireOwned(ownerId, input.binderId());
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
        Values values =
                values(
                        printing,
                        input.binderId(),
                        input.quantity() != null ? input.quantity() : 1,
                        input.condition(),
                        input.language(),
                        input.edition(),
                        input.finish(),
                        input.askingPrice(),
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
        if (!items.lockOwned(ownerId, itemId)) {
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

        Values values =
                values(
                        printing,
                        binderId,
                        patch.has("quantity") && patch.quantity() != null
                                ? patch.quantity()
                                : current.quantity(),
                        patch.has("condition") ? patch.condition() : current.condition(),
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
        if (visibilityChanged && visibility.isPublic()) {
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

    /** {@code DELETE /inventory/items/{id}}: soft delete (photos are removed). */
    @Transactional
    public void delete(UUID ownerId, UUID itemId) {
        if (!items.lockOwned(ownerId, itemId)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        softDelete(List.of(itemId), timeProvider.now());
        reconciler.items(List.of(itemId));
    }

    /** {@code POST /inventory/items/{id}/confirm}: refreshes the confirmation, HIDDEN → ACTIVE. */
    @Transactional
    public InventoryItemView confirm(UUID ownerId, UUID itemId) {
        if (!items.lockOwned(ownerId, itemId)) {
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
        Optional<UUID> owner = items.lockOwnerOf(itemId);
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
     * publish it again). The caller audits.
     *
     * @return the owner and the state before; empty for unknown or deleted items
     */
    @Transactional
    public Optional<AdminChange> hideListing(UUID itemId) {
        Optional<UUID> owner = items.lockOwnerOf(itemId);
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
        @Nullable BinderView target =
                request.action() == BulkAction.MOVE_TO_BINDER && request.binderId() != null
                        ? binders.requireOwned(ownerId, request.binderId())
                        : null;
        Map<UUID, ItemRow> owned = new LinkedHashMap<>();
        for (ItemRow row : items.findByIds(ids, now)) {
            if (row.ownerId().equals(ownerId)) {
                owned.put(row.id(), row);
            }
        }
        List<Skipped> skipped = new ArrayList<>();
        List<UUID> changed = new ArrayList<>();
        for (UUID id : ids) {
            if (!owned.containsKey(id) || !items.lockOwned(ownerId, id)) {
                skipped.add(new Skipped(id, SkipReason.NOT_FOUND));
                continue;
            }
            ItemRow row = owned.get(id);
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
            case DELETE -> softDelete(changed, now);
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
            throw switch (e.rejection()) {
                case TOO_LARGE -> new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, e.getMessage());
                case UNSUPPORTED_TYPE ->
                        new ApiException(ErrorCode.UNSUPPORTED_MEDIA_TYPE, e.getMessage());
                case EMPTY, DIMENSIONS, UNREADABLE ->
                        ApiException.validation(
                                "Validation failed",
                                List.of(new ProblemFieldError("file", e.getMessage())));
            };
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

    /** The owner confirmed or published a binder: confirm its items (no binder activity). */
    @Transactional
    public void confirmItemsOfBinder(UUID ownerId, UUID binderId, Instant now) {
        recordRestored(items.confirm(ownerId, null, binderId, now), now);
    }

    /** The binder is being deleted: soft-delete or unfile its items, then reconcile them. */
    @Transactional
    public void releaseBinderItems(
            UUID ownerId, UUID binderId, boolean deleteItems, boolean keepVisibility, Instant now) {
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
        reconciler.owner(ownerId);
        List<UUID> ids = items.idsOf(ownerId);
        deleteObjectsAfterCommit(images.deleteByItems(ids));
        return items.deleteAllOf(ownerId);
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

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

    /** Validates and normalises the column values of an item. */
    private Values values(
            PrintingDetail printing,
            @Nullable UUID binderId,
            int quantity,
            @Nullable String condition,
            @Nullable String language,
            @Nullable String edition,
            @Nullable String finish,
            @Nullable BigDecimal askingPrice,
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
        String conditionCode =
                blank(condition)
                        ? defaultCondition(conditions)
                        : condition.trim().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(conditionCode).matches()
                || (!conditions.isEmpty() && !conditions.contains(conditionCode))) {
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
