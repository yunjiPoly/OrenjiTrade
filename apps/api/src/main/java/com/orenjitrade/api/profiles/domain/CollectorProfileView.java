package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.location.domain.PublicPlace;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The public view of a collector as computed for one viewer (privacy rules already applied).
 * Location: state/province + country of a discoverable collector, plus their city only while they
 * show it on their profile (ADR 0017); never a coordinate or a distance.
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
     * Location of a discoverable collector.
     *
     * @param place state/province and country
     * @param city the collector's own city, only while "Show my city on my profile" is on
     */
    public record Location(PublicPlace place, @Nullable String city) {}

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
