package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.billing.domain.LimitDecision;
import com.orenjitrade.api.billing.domain.LimitReachedException;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ListingVisibility;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessEventLog;
import com.orenjitrade.api.delisting.domain.FreshnessEventType;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.inventory.infra.InventoryBatchRepository;
import com.orenjitrade.api.inventory.infra.InventoryBatchRepository.EqualItem;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.Confirmed;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.LockedItem;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.Values;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code POST /api/v1/inventory/items/batch}: the cards of a camera scan added in one go (owner
 * spec 2026-10-15, section 3.6). A line adds its copies to the collector's equal item (same
 * printing, language, condition, edition and finish, same visibility and binder; the oldest) or
 * becomes a new item with the defaults of a card added on the phone.
 *
 * <p>It is a bulk write of the inventory and follows the rule of one (docs/database/schema.md,
 * "Locks of binders and inventory items", "A new bulk write"), with the write path of the import
 * ({@link InventoryService#importLines}): the lines are validated and the catalog read before the
 * transaction; then, in one transaction of at most {@value InventoryService#BULK_MAX} lines, the
 * owner lock first, the binders (the target and those of the items it raises) and then those items
 * in ascending id ({@code FOR NO KEY UPDATE}), {@code inventory.items.max} checked for the whole
 * batch (429 LIMIT_REACHED, nothing written), one statement per row, and the reconciliation ({@link
 * ListingReconciler}) in the same transaction, so a public card publishes {@code
 * InventoryItemPublished}. The items count as confirmed: a new item is confirmed by its insert, an
 * equal item the batch reached is confirmed (a hidden one comes back, RESTORED), raised or already
 * full.
 *
 * <p>It does not call {@link InventoryService#importLines} itself: an import writes private unfiled
 * items only and raises any private item of the printing, never confirms; the batch chooses the
 * visibility and the binder, raises only an item in that binder with that visibility, and confirms.
 */
@Service
public class InventoryBatchService {

    /**
     * The availability of a card added on the phone today ({@code newItemDefaults} of the phone's
     * item form; stage R2 keeps it).
     */
    public static final Availability PHONE_AVAILABILITY = Availability.TRADE_OR_SALE;

    private static final Logger log = LoggerFactory.getLogger(InventoryBatchService.class);

    private final InventoryItemRepository items;
    private final InventoryBatchRepository batch;
    private final BinderService binders;
    private final ListingReconciler reconciler;
    private final CatalogService catalog;
    private final GameService games;
    private final FreshnessEventLog freshnessEvents;
    private final Limits limits;
    private final TimeProvider timeProvider;
    private final TransactionTemplate transaction;

    public InventoryBatchService(
            InventoryItemRepository items,
            InventoryBatchRepository batch,
            BinderService binders,
            ListingReconciler reconciler,
            CatalogService catalog,
            GameService games,
            FreshnessEventLog freshnessEvents,
            Limits limits,
            TimeProvider timeProvider,
            PlatformTransactionManager transactionManager) {
        this.items = items;
        this.batch = batch;
        this.binders = binders;
        this.reconciler = reconciler;
        this.catalog = catalog;
        this.games = games;
        this.freshnessEvents = freshnessEvents;
        this.limits = limits;
        this.timeProvider = timeProvider;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    /**
     * A line of the batch.
     *
     * @param printingId catalog printing
     * @param quantity copies (1 to 9999)
     */
    public record Line(UUID printingId, int quantity) {}

    /**
     * The batch.
     *
     * @param visibility PRIVATE (default) or PUBLIC
     * @param binderId one of the caller's binders, {@code null} for none
     * @param lines 1 to {@value InventoryService#BULK_MAX} lines; lines of one printing are summed
     */
    public record Batch(
            @Nullable ListingVisibility visibility, @Nullable UUID binderId, List<Line> lines) {}

    /**
     * What the batch did.
     *
     * @param created the new items, in the order of the lines
     * @param raised the items that got extra copies, in the order of the lines (an equal item
     *     already at 9999 copies gets none: it is not raised, its copies are not added)
     * @param copiesAdded copies written
     * @param copiesNotAdded copies an item could not take (at most 9999 per item)
     */
    public record Outcome(
            List<UUID> created, List<UUID> raised, int copiesAdded, int copiesNotAdded) {}

    /** A line ready to write: its printing and the columns of a new item. */
    private record Planned(Key key, int quantity) {}

    /** What makes two items equal for a batch line (visibility and binder are the batch's). */
    private record Key(
            UUID printingId,
            @Nullable String condition,
            String language,
            String edition,
            String finish) {}

    /**
     * Adds the lines to the owner's inventory in one transaction.
     *
     * @throws ApiException 400 VALIDATION_FAILED (bad lines, unknown printings, a visibility other
     *     than PRIVATE or PUBLIC), 404 when {@code binderId} is not one of the owner's binders
     * @throws LimitReachedException 429 when the new items would pass {@code inventory.items.max}
     */
    public Outcome add(UUID ownerId, Batch request) {
        List<Planned> lines = plan(request);
        ListingVisibility visibility =
                request.visibility() == null ? ListingVisibility.PRIVATE : request.visibility();
        Outcome outcome =
                transaction.execute(
                        status -> write(ownerId, visibility, request.binderId(), lines));
        return Objects.requireNonNull(outcome);
    }

    /**
     * Validates the batch and reads its printings, before the transaction: nothing reads the
     * catalog while the owner lock is held.
     */
    private List<Planned> plan(Batch request) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if (request.visibility() != null
                && request.visibility() != ListingVisibility.PRIVATE
                && request.visibility() != ListingVisibility.PUBLIC) {
            errors.add(new ProblemFieldError("visibility", "must be PRIVATE or PUBLIC"));
        }
        List<Line> lines = request.lines();
        if (lines.isEmpty() || lines.size() > InventoryService.BULK_MAX) {
            errors.add(new ProblemFieldError("lines", "must contain 1 to 500 lines"));
        }
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        Map<UUID, Integer> firstLine = new HashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            if (line.quantity() < 1 || line.quantity() > InventoryService.QUANTITY_MAX) {
                errors.add(
                        new ProblemFieldError(
                                "lines[" + i + "].quantity", "must be between 1 and 9999"));
                continue;
            }
            firstLine.putIfAbsent(line.printingId(), i);
            quantities.merge(line.printingId(), line.quantity(), Integer::sum);
        }
        Map<UUID, CatalogPrintingRef> printings =
                quantities.isEmpty() ? Map.of() : catalog.printingRefs(quantities.keySet());
        List<Planned> planned = new ArrayList<>();
        for (Map.Entry<UUID, Integer> entry : quantities.entrySet()) {
            int index = firstLine.get(entry.getKey());
            @Nullable CatalogPrintingRef printing = printings.get(entry.getKey());
            if (printing == null) {
                errors.add(
                        new ProblemFieldError(
                                "lines[" + index + "].printingId", "unknown printing"));
                continue;
            }
            if (entry.getValue() > InventoryService.QUANTITY_MAX) {
                errors.add(
                        new ProblemFieldError(
                                "lines[" + index + "].quantity",
                                "the lines of one printing add up to at most 9999 copies"));
                continue;
            }
            planned.add(
                    new Planned(
                            new Key(
                                    printing.id(),
                                    defaultCondition(printing.game()),
                                    printing.language(),
                                    printing.edition(),
                                    printing.finish()),
                            entry.getValue()));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return planned;
    }

    /**
     * The condition of a card added on the phone today: the game's NEAR_MINT, else its first
     * condition ({@code newItemDefaults} of the phone's item form). Stage R2 makes it "not stated".
     */
    private String defaultCondition(String gameSlug) {
        List<String> conditions =
                games.find(gameSlug)
                        .map(GameView::schema)
                        .map(GameSchema::conditions)
                        .orElse(List.of());
        if (conditions.isEmpty() || conditions.contains(InventoryService.DEFAULT_CONDITION)) {
            return InventoryService.DEFAULT_CONDITION;
        }
        return conditions.get(0);
    }

    /** The transaction: locks, limit, writes, confirmation, reconciliation. */
    private Outcome write(
            UUID ownerId,
            ListingVisibility visibility,
            @Nullable UUID binderId,
            List<Planned> lines) {
        Instant now = timeProvider.now();
        // The owner lock, before any row: the equal items are read under it, so no other write of
        // the collector deletes, moves or changes one between that read and the row locks.
        binders.lockOwners(List.of(ownerId));
        Map<Key, EqualItem> targets = targets(ownerId, visibility, binderId, lines);
        List<UUID> targetIds = targets.values().stream().map(EqualItem::id).toList();
        // Then the binders (the target and those of the items it raises), then the items, each in
        // ascending id.
        Set<UUID> binderIds = new HashSet<>(items.binderIdsOf(ownerId, targetIds));
        if (binderId != null) {
            binderIds.add(binderId);
        }
        binders.lockInOrder(ownerId, binderIds);
        if (binderId != null) {
            binders.requireOwned(ownerId, binderId);
        }
        Map<UUID, LockedItem> locked = new HashMap<>();
        for (LockedItem item : items.lockAll(ownerId, targetIds)) {
            locked.put(item.id(), item);
        }
        long creating =
                lines.stream()
                        .filter(
                                line -> {
                                    @Nullable EqualItem target = targets.get(line.key());
                                    return target == null || !locked.containsKey(target.id());
                                })
                        .count();
        requireRoom(ownerId, creating);

        List<UUID> created = new ArrayList<>();
        List<UUID> raised = new ArrayList<>();
        // Every equal item a line reached, raised or already full: all of them count as confirmed.
        List<UUID> reached = new ArrayList<>();
        int copies = 0;
        int notAdded = 0;
        for (Planned line : lines) {
            @Nullable EqualItem target = targets.get(line.key());
            if (target != null && locked.containsKey(target.id())) {
                int added =
                        Math.min(
                                line.quantity(), InventoryService.QUANTITY_MAX - target.quantity());
                if (added > 0) {
                    // Raised: it got extra copies. A full item (9999) gets none and is not raised.
                    items.addQuantity(target.id(), added, now);
                    raised.add(target.id());
                }
                copies += added;
                notAdded += line.quantity() - added;
                reached.add(target.id());
            } else {
                UUID id = UUID.randomUUID();
                items.insert(
                        new Values(
                                binderId,
                                line.key().printingId(),
                                line.quantity(),
                                line.key().condition(),
                                line.key().language(),
                                line.key().edition(),
                                line.key().finish(),
                                null,
                                InventoryService.DEFAULT_CURRENCY,
                                PHONE_AVAILABILITY,
                                false,
                                "",
                                "",
                                visibility,
                                null),
                        id,
                        ownerId,
                        now);
                copies += line.quantity();
                created.add(id);
            }
        }
        // The items count as confirmed: an insert confirms its item, an equal item the batch
        // reached (raised, or full) is confirmed here (a hidden one comes back).
        Set<UUID> touchedBinders = new HashSet<>();
        if (binderId != null && !created.isEmpty()) {
            touchedBinders.add(binderId);
        }
        List<FreshnessEventLog.Entry> restored = new ArrayList<>();
        for (Confirmed item : items.confirm(ownerId, reached, null, now)) {
            if (item.binderId() != null) {
                touchedBinders.add(item.binderId());
            }
            if (item.previous() == FreshnessState.HIDDEN) {
                restored.add(
                        FreshnessEventLog.Entry.item(
                                ownerId, item.itemId(), FreshnessEventType.RESTORED, now));
            }
        }
        freshnessEvents.record(restored);
        binders.recordItemActivity(ownerId, touchedBinders, now);
        reconciler.binders(touchedBinders);
        List<UUID> written = new ArrayList<>(created);
        written.addAll(reached);
        reconciler.items(written);
        log.info(
                "Inventory batch add owner={} created={} raised={} copies={} visibility={}",
                ownerId,
                created.size(),
                raised.size(),
                copies,
                visibility);
        return new Outcome(List.copyOf(created), List.copyOf(raised), copies, notAdded);
    }

    /**
     * The item each line adds its copies to: the owner's oldest live item of the printing with the
     * line's language, condition, edition and finish, the batch's visibility and binder.
     */
    private Map<Key, EqualItem> targets(
            UUID ownerId,
            ListingVisibility visibility,
            @Nullable UUID binderId,
            List<Planned> lines) {
        Set<Key> wanted = new HashSet<>();
        lines.forEach(line -> wanted.add(line.key()));
        Map<Key, EqualItem> targets = new HashMap<>();
        for (EqualItem item :
                batch.equalItems(
                        ownerId,
                        lines.stream().map(line -> line.key().printingId()).toList(),
                        visibility,
                        binderId)) {
            Key key =
                    new Key(
                            item.printingId(),
                            item.condition(),
                            item.language(),
                            item.edition(),
                            item.finish());
            if (wanted.contains(key)) {
                targets.putIfAbsent(key, item);
            }
        }
        return targets;
    }

    /**
     * Refuses a batch whose new items would pass {@link InventoryService#INVENTORY_ITEMS_MAX} (429
     * LIMIT_REACHED with {@code requested}), counted for the whole batch under the owner lock,
     * before anything is written.
     */
    private void requireRoom(UUID ownerId, long creating) {
        if (creating <= 0) {
            return;
        }
        LimitDecision decision = limits.check(ownerId, InventoryService.INVENTORY_ITEMS_MAX);
        @Nullable Integer max = decision.limit();
        long used = decision.used() == null ? 0 : decision.used();
        if (max != null && used + creating > max) {
            throw new LimitReachedException(decision).withProperty("requested", creating);
        }
    }
}
