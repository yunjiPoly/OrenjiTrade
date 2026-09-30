package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.PublicPoint;
import com.orenjitrade.api.profiles.domain.BlockRelationProvider;
import com.orenjitrade.api.profiles.domain.CollectorProfileService;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.PresenceProvider;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import com.orenjitrade.api.profiles.domain.RatingSummaryProvider;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Turns cached {@link MarkerRow}s into {@link CollectorMarker}s for one viewer through the privacy
 * matrix of the profiles module ({@link PrivacyPolicyService}): distance buckets only for signed-in
 * viewers and collectors who show distances, last activity and presence per the collector's
 * switches (hidden from signed-out visitors of MEMBERS profiles), ratings and presence from the
 * optional provider beans, avatar URLs resolved per request. Also filters blocked collectors and
 * applies the rating part of the ranking.
 */
@Component
public class MarkerAssembler {

    private final PrivacyPolicyService privacyPolicy;
    private final ObjectStorage storage;
    private final ObjectProvider<RatingSummaryProvider> ratings;
    private final ObjectProvider<PresenceProvider> presence;
    private final ObjectProvider<BlockRelationProvider> blocks;

    public MarkerAssembler(
            PrivacyPolicyService privacyPolicy,
            ObjectStorage storage,
            ObjectProvider<RatingSummaryProvider> ratings,
            ObjectProvider<PresenceProvider> presence,
            ObjectProvider<BlockRelationProvider> blocks) {
        this.privacyPolicy = privacyPolicy;
        this.storage = storage;
        this.ratings = ratings;
        this.presence = presence;
        this.blocks = blocks;
    }

    /**
     * Rows the viewer may see (no block in either direction), ranked (freshness, distance bucket,
     * rating, distance), as markers.
     */
    public List<CollectorMarker> visibleMarkers(
            List<MarkerRow> rows, @Nullable UUID viewerId, Instant now) {
        @Nullable RatingSummaryProvider ratingProvider = ratings.getIfAvailable();
        List<MarkerRow> visible = new ArrayList<>();
        for (MarkerRow row : rows) {
            if (!isBlocked(viewerId, row.id())) {
                visible.add(row);
            }
        }
        visible.sort(
                MarkerRanking.comparator(
                        row ->
                                ratingProvider == null
                                        ? RatingSummary.NONE
                                        : ratingProvider.ratingOf(row.id())));
        ViewerContext viewer = new ViewerContext(viewerId, false, false);
        return visible.stream().map(row -> marker(row, viewer, now)).toList();
    }

    /** The marker of one row for {@code viewer}. */
    public CollectorMarker marker(MarkerRow row, ViewerContext viewer, Instant now) {
        PrivacySettingsView privacy = privacyOf(row);
        UUID id = row.id();
        @Nullable DistanceBucket distance = null;
        if (row.distanceMetres() != null && privacyPolicy.canSeeDistance(viewer, id, privacy)) {
            distance = DistanceBucket.ofKm(row.distanceMetres() / 1000.0);
        }
        LastActiveBucket lastActive =
                privacyPolicy.canSeeLastActive(viewer, id, privacy)
                        ? CollectorProfileService.lastActiveBucket(row.lastActiveAt(), now)
                        : LastActiveBucket.HIDDEN;
        OnlineStatus online = OnlineStatus.HIDDEN;
        if (privacyPolicy.canSeeOnlineStatus(viewer, id, privacy)) {
            @Nullable PresenceProvider provider = presence.getIfAvailable();
            online =
                    provider != null && provider.isOnline(id)
                            ? OnlineStatus.ONLINE
                            : OnlineStatus.OFFLINE;
        }
        @Nullable RatingSummaryProvider ratingProvider = ratings.getIfAvailable();
        return new CollectorMarker(
                id,
                row.handle(),
                row.displayName(),
                row.avatarKey() == null ? null : storage.publicUrl(row.avatarKey()),
                new PublicPoint(row.publicLat(), row.publicLng()),
                row.publicLabel(),
                distance,
                ratingProvider == null ? RatingSummary.NONE : ratingProvider.ratingOf(id),
                row.tags(),
                games(row),
                lastActive,
                online,
                freshness(row.freshnessRank()),
                row.publicBinderCount(),
                row.publicItemCount(),
                row.matchingItems());
    }

    /** The collector's privacy switches as carried by the row (the row exists: discoverable). */
    public static PrivacySettingsView privacyOf(MarkerRow row) {
        return new PrivacySettingsView(
                true,
                row.showDistance(),
                row.showOnlineStatus(),
                row.showLastActive(),
                row.profileVisibility(),
                row.messagingPermission(),
                false,
                row.searchDiscoverable());
    }

    /** Whether a block exists between viewer and target (never for oneself or signed-out). */
    public boolean isBlocked(@Nullable UUID viewerId, UUID targetId) {
        if (viewerId == null || viewerId.equals(targetId)) {
            return false;
        }
        @Nullable BlockRelationProvider provider = blocks.getIfAvailable();
        return provider != null && provider.isBlocked(viewerId, targetId);
    }

    static @Nullable FreshnessState freshness(@Nullable Integer rank) {
        if (rank == null) {
            return null;
        }
        return switch (rank) {
            case 0 -> FreshnessState.ACTIVE;
            case 1 -> FreshnessState.AGING;
            default -> FreshnessState.STALE;
        };
    }

    /** Profile games first (in the collector's order), then other games of public items. */
    static List<String> games(MarkerRow row) {
        Set<String> games = new LinkedHashSet<>(row.profileGames());
        row.itemGames().stream().sorted(Comparator.naturalOrder()).forEach(games::add);
        return List.copyOf(games);
    }
}
