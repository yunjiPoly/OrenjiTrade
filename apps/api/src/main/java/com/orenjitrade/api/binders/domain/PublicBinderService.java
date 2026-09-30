package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.billing.domain.LimitReachedException;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.binders.events.PublicBinderViewed;
import com.orenjitrade.api.binders.infra.BinderRepository;
import com.orenjitrade.api.binders.infra.BinderViewTracker;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.PublicLocation;
import com.orenjitrade.api.profiles.domain.BlockRelationProvider;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.profiles.domain.ProfileService.PublicProfileParts;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public binder views (Phase 3 contract "Public views"): anonymous or signed-in visitors see only
 * effectively public binders ({@link PublicVisibilityRules}) and an owner block without any
 * coordinate. A collector whose account is hidden (suspended, pending deletion, deleted), whose
 * profile is PRIVATE or who blocked (or was blocked by) the viewer does not exist publicly (404).
 *
 * <p>Signed-in visitors consume {@code binder.views.per_day} once per binder and UTC day when they
 * open another collector's binder ({@code 429 LIMIT_REACHED} beyond the plan limit).
 */
@Service
public class PublicBinderService {

    public static final String BINDER_VIEWS = "binder.views.per_day";
    static final String COLLECTOR_NOT_FOUND = "Collector not found";

    private final BinderRepository repository;
    private final BinderService binderService;
    private final UserAccountService userAccountService;
    private final ProfileService profileService;
    private final PrivacySettingsService privacySettingsService;
    private final LocationService locationService;
    private final ObjectProvider<BlockRelationProvider> blocks;
    private final Limits limits;
    private final BinderViewTracker viewTracker;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public PublicBinderService(
            BinderRepository repository,
            BinderService binderService,
            UserAccountService userAccountService,
            ProfileService profileService,
            PrivacySettingsService privacySettingsService,
            LocationService locationService,
            ObjectProvider<BlockRelationProvider> blocks,
            Limits limits,
            BinderViewTracker viewTracker,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.binderService = binderService;
        this.userAccountService = userAccountService;
        this.profileService = profileService;
        this.privacySettingsService = privacySettingsService;
        this.locationService = locationService;
        this.blocks = blocks;
        this.limits = limits;
        this.viewTracker = viewTracker;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    /**
     * The collector behind {@code handle} for public listing routes ({@code 404} when the account
     * is hidden, the profile PRIVATE or a block exists; the owner always passes).
     */
    @Transactional(readOnly = true)
    public PublicOwner requireOwner(@Nullable UUID viewerId, String handle) {
        Instant now = timeProvider.now();
        UserAccountSnapshot account =
                userAccountService
                        .findByHandle(handle)
                        .filter(candidate -> isPubliclyVisible(candidate, now))
                        .orElseThrow(() -> ApiException.notFound(COLLECTOR_NOT_FOUND));
        PrivacySettingsView privacy = privacySettingsService.settingsOf(account.id());
        if (!account.id().equals(viewerId)
                && (privacy.profileVisibility() == ProfileVisibility.PRIVATE
                        || isBlocked(viewerId, account.id()))) {
            throw ApiException.notFound(COLLECTOR_NOT_FOUND);
        }
        return ownerOf(account, privacy, viewerId);
    }

    /**
     * {@code GET /collectors/{handle}/binders}: the collector's effectively public binders holding
     * at least one effectively public item, in the owner's order.
     */
    @Transactional(readOnly = true)
    public List<PublicBinderSummary> bindersOf(@Nullable UUID viewerId, String handle) {
        PublicOwner owner = requireOwner(viewerId, handle);
        List<BinderView> binders =
                repository.findEffectivelyPublicByOwner(owner.id(), timeProvider.now());
        return binderService.details(binders, true).stream()
                .filter(details -> details.stats().publicItemCount() > 0)
                .map(
                        details ->
                                new PublicBinderSummary(
                                        details.binder(), details.stats(), details.coverImageUrl()))
                .toList();
    }

    /**
     * {@code GET /public/binders/{id}}: an effectively public binder with its owner block. Counts a
     * binder view for signed-in visitors other than the owner.
     */
    @Transactional
    public PublicBinder binder(@Nullable UUID viewerId, UUID binderId) {
        Instant now = timeProvider.now();
        BinderView binder = requirePublicBinder(viewerId, binderId);
        UserAccountSnapshot account =
                userAccountService
                        .findSnapshot(binder.ownerId())
                        .orElseThrow(() -> ApiException.notFound(BinderService.NOT_FOUND));
        PublicOwner owner =
                ownerOf(account, privacySettingsService.settingsOf(account.id()), viewerId);
        if (viewerId != null && !viewerId.equals(binder.ownerId())) {
            countView(viewerId, binderId, now);
        }
        if (!binder.ownerId().equals(viewerId)) {
            events.publishEvent(
                    new PublicBinderViewed(
                            viewerId,
                            binderId,
                            binder.ownerId(),
                            owner.location() == null ? null : owner.location().publicLabel(),
                            now));
        }
        BinderDetails details = binderService.details(List.of(binder), true).get(0);
        return new PublicBinder(binder, owner, details.stats(), details.coverImageUrl());
    }

    /**
     * An effectively public binder that the viewer may see ({@code 404} otherwise); used by the
     * public item list of the inventory module.
     */
    @Transactional(readOnly = true)
    public BinderView requirePublicBinder(@Nullable UUID viewerId, UUID binderId) {
        BinderView binder =
                repository
                        .findById(binderId, timeProvider.now())
                        .filter(BinderView::effectivePublic)
                        .orElseThrow(() -> ApiException.notFound(BinderService.NOT_FOUND));
        if (!binder.ownerId().equals(viewerId) && isBlocked(viewerId, binder.ownerId())) {
            throw ApiException.notFound(BinderService.NOT_FOUND);
        }
        return binder;
    }

    /**
     * An effectively public binder as a shareable link (Phase 5 messages and posts): empty when the
     * binder is not public right now or a block exists between {@code viewerId} (the recipient,
     * {@code null} for everybody) and its owner. Never counts a binder view.
     */
    @Transactional(readOnly = true)
    public Optional<BinderLink> binderLink(@Nullable UUID viewerId, UUID binderId) {
        Optional<BinderView> binder =
                repository
                        .findById(binderId, timeProvider.now())
                        .filter(BinderView::effectivePublic)
                        .filter(
                                candidate ->
                                        candidate.ownerId().equals(viewerId)
                                                || !isBlocked(viewerId, candidate.ownerId()));
        return binder.flatMap(
                found ->
                        userAccountService
                                .findSnapshot(found.ownerId())
                                .map(
                                        owner ->
                                                new BinderLink(
                                                        found.id(), found.name(), owner.handle())));
    }

    /**
     * Number of public binders shown on the collector profile (same rule as {@link #bindersOf}).
     */
    @Transactional(readOnly = true)
    public int publicBinderCount(UUID ownerId) {
        List<BinderView> binders =
                repository.findEffectivelyPublicByOwner(ownerId, timeProvider.now());
        if (binders.isEmpty()) {
            return 0;
        }
        return (int)
                binderService.details(binders, true).stream()
                        .filter(details -> details.stats().publicItemCount() > 0)
                        .count();
    }

    /**
     * Search results (Phase 4 unified search): the effectively public binders among {@code
     * binderIds} that hold at least one public item and whose owner is visible to the viewer (no
     * block), with their owner blocks, in the given order. Never counts a binder view.
     */
    @Transactional(readOnly = true)
    public List<PublicBinderHit> publicBinders(@Nullable UUID viewerId, List<UUID> binderIds) {
        if (binderIds.isEmpty()) {
            return List.of();
        }
        Instant now = timeProvider.now();
        Map<UUID, BinderView> byId = new HashMap<>();
        for (BinderView binder : repository.findByIds(binderIds, now)) {
            if (binder.effectivePublic()
                    && (binder.ownerId().equals(viewerId)
                            || !isBlocked(viewerId, binder.ownerId()))) {
                byId.put(binder.id(), binder);
            }
        }
        List<BinderView> ordered = new ArrayList<>();
        for (UUID id : binderIds) {
            BinderView binder = byId.get(id);
            if (binder != null) {
                ordered.add(binder);
            }
        }
        if (ordered.isEmpty()) {
            return List.of();
        }
        Map<UUID, PublicOwner> owners = new LinkedHashMap<>();
        List<PublicBinderHit> hits = new ArrayList<>();
        for (BinderDetails details : binderService.details(ordered, true)) {
            if (details.stats().publicItemCount() == 0) {
                continue;
            }
            UUID ownerId = details.binder().ownerId();
            PublicOwner owner = owners.get(ownerId);
            if (owner == null) {
                Optional<UserAccountSnapshot> account = userAccountService.findSnapshot(ownerId);
                if (account.isEmpty()) {
                    continue;
                }
                owner =
                        ownerOf(
                                account.get(),
                                privacySettingsService.settingsOf(ownerId),
                                viewerId);
                owners.put(ownerId, owner);
            }
            hits.add(
                    new PublicBinderHit(
                            new PublicBinderSummary(
                                    details.binder(), details.stats(), details.coverImageUrl()),
                            owner));
        }
        return hits;
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private void countView(UUID viewerId, UUID binderId, Instant now) {
        if (!viewTracker.firstViewToday(viewerId, binderId, now)) {
            return;
        }
        try {
            limits.consume(viewerId, BINDER_VIEWS);
        } catch (LimitReachedException e) {
            viewTracker.forget(viewerId, binderId, now);
            throw e;
        }
    }

    private PublicOwner ownerOf(
            UserAccountSnapshot account, PrivacySettingsView privacy, @Nullable UUID viewerId) {
        Optional<PublicProfileParts> parts = profileService.publicPartsOf(account.id());
        String displayName =
                parts.map(PublicProfileParts::displayName)
                        .orElseGet(
                                () ->
                                        account.displayName() == null
                                                        || account.displayName().isBlank()
                                                ? account.handle()
                                                : account.displayName());
        @Nullable String avatarUrl = parts.map(PublicProfileParts::avatarUrl).orElse(null);
        PublicOwner.@Nullable Location location = null;
        Optional<PublicLocation> publicLocation =
                privacy.discoverable()
                        ? locationService.publicLocationOf(account.id())
                        : Optional.empty();
        if (publicLocation.isPresent()) {
            @Nullable DistanceBucket distance = null;
            if (viewerId != null && !viewerId.equals(account.id()) && privacy.showDistance()) {
                distance =
                        locationService
                                .distanceFrom(viewerId, publicLocation.get().publicPoint())
                                .orElse(null);
            }
            location = new PublicOwner.Location(publicLocation.get().label(), distance);
        }
        return new PublicOwner(account.id(), account.handle(), displayName, avatarUrl, location);
    }

    private boolean isBlocked(@Nullable UUID viewerId, UUID ownerId) {
        if (viewerId == null || viewerId.equals(ownerId)) {
            return false;
        }
        @Nullable BlockRelationProvider provider = blocks.getIfAvailable();
        return provider != null && provider.isBlocked(viewerId, ownerId);
    }

    /** Active accounts, including those whose temporary suspension has already ended. */
    static boolean isPubliclyVisible(UserAccountSnapshot account, Instant now) {
        return switch (account.status()) {
            case ACTIVE -> true;
            case SUSPENDED -> !account.isSuspendedAt(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }

    /**
     * A public binder in a collector's list.
     *
     * @param binder the binder
     * @param stats public item statistics
     * @param coverImageUrl cover image
     */
    public record PublicBinderSummary(
            BinderView binder, BinderContents.Stats stats, @Nullable String coverImageUrl) {}

    /**
     * A public binder found by search, with its owner.
     *
     * @param summary the binder and its public statistics
     * @param owner owner block (no coordinates)
     */
    public record PublicBinderHit(PublicBinderSummary summary, PublicOwner owner) {}

    /**
     * A public binder with its owner.
     *
     * @param binder the binder
     * @param owner owner block
     * @param stats public item statistics
     * @param coverImageUrl cover image
     */
    public record PublicBinder(
            BinderView binder,
            PublicOwner owner,
            BinderContents.Stats stats,
            @Nullable String coverImageUrl) {}
}
