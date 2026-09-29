package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.location.domain.DistanceBucket;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The owner of public listings as any visitor may see them. Never contains a coordinate: only the
 * region label of the derived public point and a distance bucket (ADR 0004).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarUrl avatar
 * @param location approximate location, {@code null} unless the collector is discoverable
 */
public record PublicOwner(
        UUID id,
        String handle,
        String displayName,
        @Nullable String avatarUrl,
        @Nullable Location location) {

    /**
     * Approximate location.
     *
     * @param publicLabel region label of the public point
     * @param distanceBucket distance class from the viewer, when the viewer is signed in with a
     *     trading area and the owner shows distances
     */
    public record Location(String publicLabel, @Nullable DistanceBucket distanceBucket) {}
}
