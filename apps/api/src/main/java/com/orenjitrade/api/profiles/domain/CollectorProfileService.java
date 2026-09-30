package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.PublicLocation;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.ProfileService.PublicProfileParts;
import com.orenjitrade.api.profiles.events.CollectorProfileViewed;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the public collector profile ({@code GET /api/v1/collectors/{handle}}) for one viewer:
 * suspended, deletion-pending and deleted accounts do not exist publicly (404), PRIVATE profiles
 * exist only for their owner (404 for everyone else), the location is present only for discoverable
 * collectors and only as public point + label + distance bucket.
 */
@Service
public class CollectorProfileService {

    static final String NOT_FOUND = "Collector not found";

    private final UserAccountService userAccountService;
    private final ProfileService profileService;
    private final PrivacySettingsService privacySettingsService;
    private final PrivacyPolicyService privacyPolicy;
    private final LocationService locationService;
    private final TimeProvider timeProvider;
    private final ObjectProvider<PublicBinderCountProvider> binderCounts;
    private final ObjectProvider<RatingSummaryProvider> ratings;
    private final ObjectProvider<BlockRelationProvider> blocks;
    private final ObjectProvider<PresenceProvider> presence;
    private final ApplicationEventPublisher events;

    public CollectorProfileService(
            UserAccountService userAccountService,
            ProfileService profileService,
            PrivacySettingsService privacySettingsService,
            PrivacyPolicyService privacyPolicy,
            LocationService locationService,
            TimeProvider timeProvider,
            ObjectProvider<PublicBinderCountProvider> binderCounts,
            ObjectProvider<RatingSummaryProvider> ratings,
            ObjectProvider<BlockRelationProvider> blocks,
            ObjectProvider<PresenceProvider> presence,
            ApplicationEventPublisher events) {
        this.userAccountService = userAccountService;
        this.profileService = profileService;
        this.privacySettingsService = privacySettingsService;
        this.privacyPolicy = privacyPolicy;
        this.locationService = locationService;
        this.timeProvider = timeProvider;
        this.binderCounts = binderCounts;
        this.ratings = ratings;
        this.blocks = blocks;
        this.presence = presence;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public CollectorProfileView view(@Nullable UUID viewerId, String handle) {
        Instant now = timeProvider.now();
        UserAccountSnapshot account =
                userAccountService
                        .findByHandle(handle)
                        .filter(candidate -> isPubliclyVisible(candidate, now))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        UUID targetId = account.id();
        PrivacySettingsView privacy = privacySettingsService.settingsOf(targetId);
        ViewerContext viewer = viewerContext(viewerId, targetId);
        if (!privacyPolicy.canViewProfile(viewer, targetId, privacy)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        PublicProfileParts parts =
                profileService
                        .publicPartsOf(targetId)
                        .orElseGet(
                                () ->
                                        new PublicProfileParts(
                                                ProfileService.defaultDisplayName(account),
                                                "",
                                                null,
                                                List.of(),
                                                List.of(),
                                                false));
        Optional<PublicLocation> publicLocation =
                privacy.discoverable()
                        ? locationService.publicLocationOf(targetId)
                        : Optional.empty();
        if (!targetId.equals(viewerId)) {
            events.publishEvent(
                    new CollectorProfileViewed(
                            viewerId,
                            targetId,
                            publicLocation.map(PublicLocation::gridCell).orElse(null),
                            publicLocation.map(PublicLocation::label).orElse(null),
                            now));
        }
        return new CollectorProfileView(
                targetId,
                account.handle(),
                parts.displayName(),
                parts.avatarUrl(),
                parts.bio(),
                parts.games(),
                parts.tags(),
                location(viewer, targetId, privacy, publicLocation),
                LocalDate.ofInstant(account.createdAt(), ZoneOffset.UTC),
                privacyPolicy.canSeeLastActive(viewer, targetId, privacy)
                        ? lastActiveBucket(account.lastActiveAt(), now)
                        : LastActiveBucket.HIDDEN,
                onlineStatus(viewer, targetId, privacy),
                rating(targetId),
                binderCount(targetId),
                privacyPolicy.canMessage(viewer, targetId, privacy),
                viewer.blocked());
    }

    /**
     * The id of the collector holding {@code handle} when their profile is visible to the viewer
     * (same rules as {@link #view}: unknown, suspended, deletion-pending and deleted accounts and
     * profiles the privacy settings hide are {@code 404}). Used by the profile's sub-resources
     * (Phase 7 ratings and references). Publishes nothing.
     */
    @Transactional(readOnly = true)
    public UUID requireVisibleCollector(@Nullable UUID viewerId, String handle) {
        Instant now = timeProvider.now();
        UserAccountSnapshot account =
                userAccountService
                        .findByHandle(handle)
                        .filter(candidate -> isPubliclyVisible(candidate, now))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        UUID targetId = account.id();
        PrivacySettingsView privacy = privacySettingsService.settingsOf(targetId);
        if (!privacyPolicy.canViewProfile(viewerContext(viewerId, targetId), targetId, privacy)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        return targetId;
    }

    /** Active accounts, including those whose temporary suspension has already expired. */
    static boolean isPubliclyVisible(UserAccountSnapshot account, Instant now) {
        return switch (account.status()) {
            case ACTIVE -> true;
            case SUSPENDED -> !account.isSuspendedAt(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }

    private ViewerContext viewerContext(@Nullable UUID viewerId, UUID targetId) {
        if (viewerId == null) {
            return ViewerContext.ANONYMOUS;
        }
        @Nullable BlockRelationProvider blockProvider = blocks.getIfAvailable();
        boolean blocked =
                blockProvider != null
                        && !viewerId.equals(targetId)
                        && blockProvider.isBlocked(viewerId, targetId);
        return new ViewerContext(viewerId, profileService.isComplete(viewerId), blocked);
    }

    private CollectorProfileView.@Nullable Location location(
            ViewerContext viewer,
            UUID targetId,
            PrivacySettingsView privacy,
            Optional<PublicLocation> publicLocationOfTarget) {
        if (!privacyPolicy.canSeeLocation(viewer, targetId, privacy)) {
            return null;
        }
        return publicLocationOfTarget
                .map(
                        publicLocation -> {
                            @Nullable DistanceBucket distance = null;
                            UUID viewerId = viewer.userId();
                            if (viewerId != null
                                    && privacyPolicy.canSeeDistance(viewer, targetId, privacy)) {
                                distance =
                                        locationService
                                                .distanceFrom(
                                                        viewerId, publicLocation.publicPoint())
                                                .orElse(null);
                            }
                            return new CollectorProfileView.Location(
                                    publicLocation.label(), publicLocation.publicPoint(), distance);
                        })
                .orElse(null);
    }

    private OnlineStatus onlineStatus(
            ViewerContext viewer, UUID targetId, PrivacySettingsView privacy) {
        if (!privacyPolicy.canSeeOnlineStatus(viewer, targetId, privacy)) {
            return OnlineStatus.HIDDEN;
        }
        @Nullable PresenceProvider provider = presence.getIfAvailable();
        return provider != null && provider.isOnline(targetId)
                ? OnlineStatus.ONLINE
                : OnlineStatus.OFFLINE;
    }

    private RatingSummary rating(UUID targetId) {
        @Nullable RatingSummaryProvider provider = ratings.getIfAvailable();
        return provider == null ? RatingSummary.NONE : provider.ratingOf(targetId);
    }

    private int binderCount(UUID targetId) {
        @Nullable PublicBinderCountProvider provider = binderCounts.getIfAvailable();
        return provider == null ? 0 : provider.publicBinderCount(targetId);
    }

    /**
     * TODAY (&lt; 24 h), THIS_WEEK (&lt; 7 d), THIS_MONTH (&lt; 30 d), otherwise LONGER_AGO (also
     * used by the map markers of the search module).
     */
    public static LastActiveBucket lastActiveBucket(@Nullable Instant lastActiveAt, Instant now) {
        if (lastActiveAt == null) {
            return LastActiveBucket.LONGER_AGO;
        }
        Duration age = Duration.between(lastActiveAt, now);
        if (age.compareTo(Duration.ofHours(24)) < 0) {
            return LastActiveBucket.TODAY;
        }
        if (age.compareTo(Duration.ofDays(7)) < 0) {
            return LastActiveBucket.THIS_WEEK;
        }
        if (age.compareTo(Duration.ofDays(30)) < 0) {
            return LastActiveBucket.THIS_MONTH;
        }
        return LastActiveBucket.LONGER_AGO;
    }
}
