package com.orenjitrade.api.community.domain;

import com.orenjitrade.api.location.domain.RegionCatalog;
import org.jspecify.annotations.Nullable;

/**
 * The channels of the old model named after a city (V041's "Montréal / …", and those created from
 * collectors' city labels before ADR 0017), archived by V110 and V134. Their region label is a
 * city, not a platform region code. The label never leaves the server, a flag on one of their posts
 * never names the channel, and they stay archived (web stage WH1 review fix 1, spec 15.2: no admin
 * list shows a city). Their slug, name and description carry the city too: staff read {@link
 * #ARCHIVED_SLUG} and {@link #ARCHIVED_NAME} instead, with no description (review fix 2).
 */
public final class CityChannels {

    /** The slug staff read for such a channel (its own, "montreal-yugioh", names the city). */
    public static final String ARCHIVED_SLUG = "archived-channel";

    /** The name staff read for such a channel (its own, "Montréal / Yu-Gi-Oh!", names the city). */
    public static final String ARCHIVED_NAME = "Archived channel";

    private CityChannels() {}

    /**
     * Whether a channel's region label is an old city label (not a platform region code).
     *
     * @param regionLabel the channel's stored region label
     * @param regions the platform regions
     */
    public static boolean isCity(@Nullable String regionLabel, RegionCatalog regions) {
        return regionLabel != null && regions.region(regionLabel).isEmpty();
    }

    /**
     * The label staff may read: the platform region code, or {@code null} for none or a city.
     *
     * @param regionLabel the channel's stored region label
     * @param regions the platform regions
     */
    public static @Nullable String platformRegion(
            @Nullable String regionLabel, RegionCatalog regions) {
        return regionLabel == null || isCity(regionLabel, regions) ? null : regionLabel;
    }

    /**
     * The slug staff may read: the channel's own, or {@link #ARCHIVED_SLUG} for a channel named
     * after a city (a collector's history, the console's channel list).
     *
     * @param slug the channel's stored slug
     * @param regionLabel the channel's stored region label
     * @param regions the platform regions
     */
    public static String staffSlug(
            String slug, @Nullable String regionLabel, RegionCatalog regions) {
        return isCity(regionLabel, regions) ? ARCHIVED_SLUG : slug;
    }
}
