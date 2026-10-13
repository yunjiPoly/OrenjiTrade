package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.profiles.domain.MessagingPermission;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A discoverable collector as read from the database, before the viewer-specific privacy rules are
 * applied (the unit cached for 60 s). Holds the public place only (state/province + country), never
 * a city or a coordinate (ADR 0017).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarKey storage key of the avatar (the URL is derived per request)
 * @param place state/province and country
 * @param showOnlineStatus privacy switch
 * @param showLastActive privacy switch
 * @param profileVisibility privacy switch
 * @param messagingPermission privacy switch
 * @param searchDiscoverable privacy switch
 * @param lastActiveAt last activity
 * @param tags active tag slugs
 * @param profileGames games of the profile
 * @param itemGames games of the effectively public items
 * @param freshnessRank best freshness of the public items (0 ACTIVE, 1 AGING, 2 STALE), {@code
 *     null} without public items
 * @param publicBinderCount public binders holding at least one public item
 * @param publicItemCount effectively public items
 * @param matchingItems items matching the request's item filters
 */
public record MarkerRow(
        UUID id,
        String handle,
        String displayName,
        @Nullable String avatarKey,
        PublicPlace place,
        boolean showOnlineStatus,
        boolean showLastActive,
        ProfileVisibility profileVisibility,
        MessagingPermission messagingPermission,
        boolean searchDiscoverable,
        @Nullable Instant lastActiveAt,
        List<String> tags,
        List<String> profileGames,
        List<String> itemGames,
        @Nullable Integer freshnessRank,
        int publicBinderCount,
        long publicItemCount,
        List<MatchingItem> matchingItems) {

    public MarkerRow {
        tags = List.copyOf(tags);
        profileGames = List.copyOf(profileGames);
        itemGames = List.copyOf(itemGames);
        matchingItems = List.copyOf(matchingItems);
    }

    /** The same row with its matching items. */
    public MarkerRow withMatchingItems(List<MatchingItem> items) {
        return new MarkerRow(
                id,
                handle,
                displayName,
                avatarKey,
                place,
                showOnlineStatus,
                showLastActive,
                profileVisibility,
                messagingPermission,
                searchDiscoverable,
                lastActiveAt,
                tags,
                profileGames,
                itemGames,
                freshnessRank,
                publicBinderCount,
                publicItemCount,
                items);
    }

    @Override
    public String toString() {
        return "MarkerRow[id=" + id + ", subdivision=" + place.subdivisionCode() + "]";
    }
}
