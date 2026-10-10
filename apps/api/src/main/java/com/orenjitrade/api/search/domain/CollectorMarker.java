package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A discoverable collector as computed for one viewer (privacy rules applied): their state/province
 * and country, never a city, a coordinate or a distance (ADR 0017).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarUrl avatar
 * @param place state/province and country
 * @param rating rating summary
 * @param tags tag slugs
 * @param games games played or listed
 * @param lastActiveBucket bucketed last activity or HIDDEN
 * @param onlineStatus presence or HIDDEN
 * @param binderFreshness best freshness of the public listings, {@code null} without any
 * @param publicBinderCount public binders holding at least one public item
 * @param publicItemCount effectively public items
 * @param matchingItems items matching the item filters of the request
 */
public record CollectorMarker(
        UUID id,
        String handle,
        String displayName,
        @Nullable String avatarUrl,
        PublicPlace place,
        RatingSummary rating,
        List<String> tags,
        List<String> games,
        LastActiveBucket lastActiveBucket,
        OnlineStatus onlineStatus,
        @Nullable FreshnessState binderFreshness,
        int publicBinderCount,
        long publicItemCount,
        List<MatchingItem> matchingItems) {}
