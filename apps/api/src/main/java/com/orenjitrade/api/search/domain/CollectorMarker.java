package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.PublicPoint;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.LastActiveBucket;
import com.orenjitrade.api.profiles.domain.CollectorProfileView.OnlineStatus;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A collector's map marker as computed for one viewer (privacy rules applied): the derived public
 * point and label, a distance bucket, never a precise coordinate (ADR 0004).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarUrl avatar
 * @param publicPoint derived public point (3 decimals)
 * @param publicLabel region label
 * @param distanceBucket distance class from the search centre (signed-in viewers, collectors who
 *     show distances)
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
        PublicPoint publicPoint,
        String publicLabel,
        @Nullable DistanceBucket distanceBucket,
        RatingSummary rating,
        List<String> tags,
        List<String> games,
        LastActiveBucket lastActiveBucket,
        OnlineStatus onlineStatus,
        @Nullable FreshnessState binderFreshness,
        int publicBinderCount,
        long publicItemCount,
        List<MatchingItem> matchingItems) {}
