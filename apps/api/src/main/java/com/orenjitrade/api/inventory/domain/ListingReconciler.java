package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.domain.ListingScope;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.inventory.events.InventoryItemUnpublished;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.ListingChange;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Keeps the materialised effective public visibility of items ({@code
 * inventory_item.publicly_listed}) and binders in line with the rules and emits {@link
 * InventoryItemPublished} / {@link InventoryItemUnpublished} (and the binder events) exactly once
 * per transition. Called after every change that can affect visibility: item and binder writes,
 * bulk operations, confirmations, account state and privacy changes, the freshness job.
 *
 * <p>Pending JPA changes of the surrounding transaction (e.g. the account status set by the
 * deletion framework) are flushed first, so the SQL sees them.
 */
@Component
public class ListingReconciler {

    private final InventoryItemRepository items;
    private final BinderService binderService;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    @PersistenceContext private EntityManager entityManager;

    public ListingReconciler(
            InventoryItemRepository items,
            BinderService binderService,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.items = items;
        this.binderService = binderService;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    /** Some items (their binders are unchanged). */
    @Transactional
    public Counts items(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) {
            return Counts.NONE;
        }
        flush();
        return publish(
                items.reconcile("i.id IN (:ids)", Map.of("ids", List.copyOf(itemIds)), now()),
                true);
    }

    /** Some binders and every item in them. */
    @Transactional
    public Counts binders(Collection<UUID> binderIds) {
        if (binderIds.isEmpty()) {
            return Counts.NONE;
        }
        flush();
        binderService.reconcileListing(ListingScope.Binders.of(binderIds));
        return publish(
                items.reconcile(
                        "i.binder_id IN (:binderIds)",
                        Map.of("binderIds", List.copyOf(binderIds)),
                        now()),
                true);
    }

    /** Every binder and item of an owner (account state, privacy settings). */
    @Transactional
    public Counts owner(UUID ownerId) {
        return owner(ownerId, true);
    }

    /** Like {@link #owner(UUID)}, optionally without events (seed data). */
    @Transactional
    public Counts owner(UUID ownerId, boolean publishEvents) {
        flush();
        binderService.reconcileListing(new ListingScope.Owner(ownerId), publishEvents);
        return publish(
                items.reconcile("i.owner_id = :ownerId", Map.of("ownerId", ownerId), now()),
                publishEvents);
    }

    /** Everything (freshness job: expiries, freshness, time-based suspension ends). */
    @Transactional
    public Counts all() {
        flush();
        binderService.reconcileListing(new ListingScope.All());
        return publish(
                items.reconcile("(i.deleted_at IS NULL OR i.publicly_listed)", Map.of(), now()),
                true);
    }

    private Counts publish(List<ListingChange> changes, boolean publishEvents) {
        Instant now = now();
        int published = 0;
        int unpublished = 0;
        for (ListingChange change : changes) {
            if (change.listed()) {
                published++;
                if (publishEvents) {
                    events.publishEvent(
                            new InventoryItemPublished(
                                    change.itemId(),
                                    change.ownerId(),
                                    change.printingId(),
                                    change.cardId(),
                                    change.game(),
                                    change.availability(),
                                    change.askingPrice(),
                                    change.currency(),
                                    now));
                }
            } else {
                unpublished++;
                if (publishEvents) {
                    events.publishEvent(
                            new InventoryItemUnpublished(change.itemId(), change.ownerId(), now));
                }
            }
        }
        return new Counts(published, unpublished);
    }

    private void flush() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            entityManager.flush();
        }
    }

    private Instant now() {
        return timeProvider.now();
    }

    /**
     * Items whose effective visibility flipped.
     *
     * @param published became public
     * @param unpublished stopped being public
     */
    public record Counts(int published, int unpublished) {

        public static final Counts NONE = new Counts(0, 0);
    }
}
