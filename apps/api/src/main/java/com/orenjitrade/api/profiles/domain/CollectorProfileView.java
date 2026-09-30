package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.location.domain.PublicPoint;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The public view of a collector as computed for one viewer (privacy rules already applied).
 * Contains no private location data by construction: only the public point, its label and a
 * distance bucket.
 */
public record CollectorProfileView(
        UUID id,
        String handle,
        String displayName,
        @Nullable String avatarUrl,
        String bio,
        List<String> games,
        List<TagView> tags,
        @Nullable Location location,
        LocalDate memberSince,
        LastActiveBucket lastActiveBucket,
        OnlineStatus onlineStatus,
        RatingSummary rating,
        int publicBinderCount,
        boolean canMessage,
        boolean isBlocked) {

    /**
     * Approximate location of a discoverable collector.
     *
     * @param publicLabel region label
     * @param publicPoint derived public point
     * @param distanceBucket distance class from the viewer, when allowed and computable
     */
    public record Location(
            String publicLabel, PublicPoint publicPoint, @Nullable DistanceBucket distanceBucket) {}

    /** How recently the collector was active (bucketed; {@link #HIDDEN} by privacy choice). */
    public enum LastActiveBucket {
        TODAY,
        THIS_WEEK,
        THIS_MONTH,
        LONGER_AGO,
        HIDDEN
    }

    /** Presence as shown to the viewer. */
    public enum OnlineStatus {
        ONLINE,
        OFFLINE,
        HIDDEN
    }
}
