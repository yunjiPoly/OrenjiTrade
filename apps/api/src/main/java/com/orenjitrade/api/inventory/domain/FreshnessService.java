package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.binders.events.BinderFreshnessWarning;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.DelistPolicyService;
import com.orenjitrade.api.delisting.domain.FreshnessEventLog;
import com.orenjitrade.api.delisting.domain.FreshnessEventType;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.events.InventoryListingsHidden;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.StateChange;
import com.orenjitrade.api.inventory.infra.InventoryItemRepository.Warned;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The freshness job's work (Phase 3 contract "Jobs"), in one transaction:
 *
 * <ol>
 *   <li>expired temporary publications (items and binders) become PRIVATE;
 *   <li>freshness states of binders and items are re-derived from {@code confirmed_at} and the
 *       active {@code delist_policy} (AGED / STALED / HIDDEN / RESTORED freshness events; {@code
 *       BinderFreshnessChanged});
 *   <li>the effective public visibility is reconciled: newly HIDDEN or expired listings emit {@code
 *       InventoryItemUnpublished} / {@code BinderUnpublished}, restored ones the published events;
 *   <li>publicly listed items that became HIDDEN emit one {@link InventoryListingsHidden} per
 *       binder (or per owner for unfiled items);
 *   <li>publicly listed items and binders entering the warning window ({@code
 *       warn_before_hidden_days} before hiding) get a WARNED freshness event, once per confirmation
 *       cycle, and one {@link BinderFreshnessWarning} per binder (or per owner for unfiled items).
 * </ol>
 *
 * Never deletes anything.
 */
@Service
public class FreshnessService {

    private final DelistPolicyService policies;
    private final BinderService binders;
    private final InventoryItemRepository items;
    private final ListingReconciler reconciler;
    private final FreshnessEventLog freshnessEvents;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public FreshnessService(
            DelistPolicyService policies,
            BinderService binders,
            InventoryItemRepository items,
            ListingReconciler reconciler,
            FreshnessEventLog freshnessEvents,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.policies = policies;
        this.binders = binders;
        this.items = items;
        this.reconciler = reconciler;
        this.freshnessEvents = freshnessEvents;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    @Transactional
    public Result run() {
        FreshnessPolicy policy = policies.active();
        Instant now = timeProvider.now();

        BinderService.FreshnessRun binderRun = binders.runFreshness(policy, now);
        int expiredItems = items.normaliseExpired(now);
        List<StateChange> changes = items.recomputeFreshness(policy, now);
        int aged = 0;
        int staled = 0;
        int hidden = 0;
        int restored = 0;
        List<FreshnessEventLog.Entry> entries = new ArrayList<>();
        Map<WarningKey, Integer> hiddenListings = new LinkedHashMap<>();
        for (StateChange change : changes) {
            if (change.current() == FreshnessState.HIDDEN && change.publiclyListed()) {
                hiddenListings.merge(
                        new WarningKey(change.ownerId(), change.binderId()), 1, Integer::sum);
            }
            @Nullable FreshnessEventType type =
                    FreshnessEventType.forTransition(change.previous(), change.current());
            if (type == null) {
                continue;
            }
            switch (type) {
                case AGED -> aged++;
                case STALED -> staled++;
                case HIDDEN -> hidden++;
                case RESTORED -> restored++;
                case WARNED -> {}
            }
            entries.add(FreshnessEventLog.Entry.item(change.ownerId(), change.itemId(), type, now));
        }
        freshnessEvents.record(entries);

        ListingReconciler.Counts counts = reconciler.all();
        for (Map.Entry<WarningKey, Integer> group : hiddenListings.entrySet()) {
            events.publishEvent(
                    new InventoryListingsHidden(
                            group.getKey().ownerId(),
                            group.getKey().binderId(),
                            group.getValue(),
                            now));
        }

        Map<UUID, BinderService.Warning> binderWarnings = binders.warn(policy, now);
        List<Warned> itemWarnings = items.warn(policy, now);
        List<FreshnessEventLog.Entry> warned = new ArrayList<>();
        Map<WarningKey, WarningGroup> groups = new LinkedHashMap<>();
        for (Map.Entry<UUID, BinderService.Warning> binder : binderWarnings.entrySet()) {
            groups.computeIfAbsent(
                            new WarningKey(binder.getValue().ownerId(), binder.getKey()),
                            key -> new WarningGroup())
                    .include(binder.getValue().hidesAt(), 0);
        }
        for (Warned item : itemWarnings) {
            warned.add(
                    FreshnessEventLog.Entry.item(
                            item.ownerId(), item.itemId(), FreshnessEventType.WARNED, now));
            groups.computeIfAbsent(
                            new WarningKey(item.ownerId(), item.binderId()),
                            key -> new WarningGroup())
                    .include(policy.hidesAt(item.confirmedAt()), 1);
        }
        freshnessEvents.record(warned);
        for (Map.Entry<WarningKey, WarningGroup> group : groups.entrySet()) {
            events.publishEvent(
                    new BinderFreshnessWarning(
                            group.getKey().ownerId(),
                            group.getKey().binderId(),
                            group.getValue().items,
                            java.util.Objects.requireNonNull(group.getValue().hidesAt),
                            now));
        }

        return new Result(
                binderRun.expired() + expiredItems,
                aged,
                staled,
                hidden,
                restored,
                binderRun.stateChanges(),
                itemWarnings.size(),
                binderWarnings.size(),
                counts.published(),
                counts.unpublished());
    }

    /** The state a listing confirmed at {@code confirmedAt} has under the active policy. */
    public FreshnessState stateAt(Instant confirmedAt) {
        return policies.active().stateAt(confirmedAt, timeProvider.now());
    }

    private record WarningKey(UUID ownerId, @Nullable UUID binderId) {}

    private static final class WarningGroup {
        private int items;
        private @Nullable Instant hidesAt;

        void include(Instant candidate, int itemCount) {
            items += itemCount;
            if (hidesAt == null || candidate.isBefore(hidesAt)) {
                hidesAt = candidate;
            }
        }
    }

    /**
     * Outcome of one run (also stored in {@code job_run.details}).
     *
     * @param expired temporary publications (items and binders) turned PRIVATE
     * @param itemsAged items that became AGING
     * @param itemsStaled items that became STALE
     * @param itemsHidden items that became HIDDEN
     * @param itemsRestored items that left HIDDEN (more lenient policy)
     * @param binderStateChanges binder freshness changes
     * @param itemsWarned items warned
     * @param bindersWarned binders warned
     * @param published items that became public
     * @param unpublished items that stopped being public
     */
    public record Result(
            int expired,
            int itemsAged,
            int itemsStaled,
            int itemsHidden,
            int itemsRestored,
            int binderStateChanges,
            int itemsWarned,
            int bindersWarned,
            int published,
            int unpublished) {

        public Map<String, Object> asMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("expired", expired);
            map.put("itemsAged", itemsAged);
            map.put("itemsStaled", itemsStaled);
            map.put("itemsHidden", itemsHidden);
            map.put("itemsRestored", itemsRestored);
            map.put("binderStateChanges", binderStateChanges);
            map.put("itemsWarned", itemsWarned);
            map.put("bindersWarned", bindersWarned);
            map.put("published", published);
            map.put("unpublished", unpublished);
            return map;
        }
    }
}
