package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.binders.domain.BinderChanges.BinderPatch;
import com.orenjitrade.api.binders.domain.BinderChanges.NewBinder;
import com.orenjitrade.api.binders.events.BinderFreshnessChanged;
import com.orenjitrade.api.binders.events.BinderPublished;
import com.orenjitrade.api.binders.events.BinderUnpublished;
import com.orenjitrade.api.binders.infra.BinderRepository;
import com.orenjitrade.api.binders.infra.BinderRepository.ListingChange;
import com.orenjitrade.api.binders.infra.BinderRepository.StateChange;
import com.orenjitrade.api.binders.infra.BinderRepository.Warned;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessEventLog;
import com.orenjitrade.api.delisting.domain.FreshnessEventType;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The binders module's service interface (Phase 3 contract "Endpoints — binders"): the owner's
 * binders, publication (PUBLIC, one hour, one day, until disabled), confirmation, reordering and
 * deletion, plus what the inventory module and the freshness job need (ownership checks, binder
 * activity, freshness recomputation, effective-visibility reconciliation).
 *
 * <p>Every transition of the effective public visibility of a binder emits {@link BinderPublished}
 * or {@link BinderUnpublished} exactly once: the last computed value is materialised in {@code
 * binder.publicly_listed} and events are emitted when it flips ({@link #reconcileListing}).
 */
@Service
public class BinderService {

    public static final String BINDERS_MAX = "binders.max";
    public static final int NAME_MAX = 80;
    public static final int DESCRIPTION_MAX = 1000;
    static final String NOT_FOUND = "Binder not found";

    private static final Logger log = LoggerFactory.getLogger(BinderService.class);

    private final BinderRepository repository;
    private final Limits limits;
    private final FreshnessEventLog freshnessEvents;
    private final ObjectProvider<BinderContents> contents;
    private final CatalogService catalogService;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public BinderService(
            BinderRepository repository,
            Limits limits,
            FreshnessEventLog freshnessEvents,
            ObjectProvider<BinderContents> contents,
            CatalogService catalogService,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.limits = limits;
        this.freshnessEvents = freshnessEvents;
        this.contents = contents;
        this.catalogService = catalogService;
        this.timeProvider = timeProvider;
        this.events = events;
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
     * Creates a binder at the end of the owner's list. {@code 429 LIMIT_REACHED} beyond the plan's
     * {@code binders.max}; {@code 400} for invalid input.
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
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        repository.lockOwnerForCreation(ownerId);
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
                now);
        reconcileListing(ListingScope.Binders.of(List.of(id)));
        log.info("Binder created owner={} binder={} visibility={}", ownerId, id, visibility);
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
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        repository.update(
                binderId,
                name,
                description,
                patch.kind() != null ? patch.kind() : current.kind(),
                visibility,
                PublicVisibilityRules.storedPublicUntil(visibility, publicUntil),
                cover,
                now);
        if (visibilityChanged && visibility.isPublic()) {
            confirmBinderAndItems(ownerId, binderId, now);
        }
        afterChange(ownerId, binderId);
        return getMine(ownerId, binderId);
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
        repository.delete(binderId);
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

    /** Number of binders of an owner ({@code binders.max} usage). */
    @Transactional(readOnly = true)
    public long countOf(UUID ownerId) {
        return repository.countByOwner(ownerId);
    }

    /** Earliest future end of the owner's temporary binder publications. */
    @Transactional(readOnly = true)
    public java.util.Optional<Instant> nextExpiry(UUID ownerId) {
        return repository.nextExpiry(ownerId, timeProvider.now());
    }

    /**
     * Items were created, confirmed or moved into these binders: that confirms the binders (hidden
     * ones come back). Does not touch the items.
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
     * BinderPublished} / {@link BinderUnpublished} for each flip.
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
                                    now);
                    case ListingScope.Binders binders ->
                            binders.binderIds().isEmpty()
                                    ? List.of()
                                    : repository.reconcile(
                                            "b.id IN (:ids)",
                                            Map.of("ids", binders.binderIds()),
                                            now);
                    case ListingScope.All all -> repository.reconcile("TRUE", Map.of(), now);
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
     * calls {@link #warn}.
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
        return repository.deleteAllOf(ownerId).size();
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private BinderView lockOwned(UUID ownerId, UUID binderId) {
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
        List<BinderDetails> result = new ArrayList<>();
        for (BinderView binder : binders) {
            BinderContents.Stats binderStats =
                    stats.getOrDefault(binder.id(), BinderContents.Stats.EMPTY);
            @Nullable String cover = covers.get(binder.id());
            result.add(
                    new BinderDetails(
                            binder,
                            binderStats,
                            cover != null ? cover : binderStats.coverImageUrl()));
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
