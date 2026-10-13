package com.orenjitrade.api.location.domain;

import org.jspecify.annotations.Nullable;

/**
 * The owner's own view of their location ({@code GET /api/v1/me/location}), the only place besides
 * their export and their public profile where the city appears.
 *
 * @param place region, country and subdivision, {@code null} while no location is set
 * @param regionName display name of the place's region, {@code null} without a place
 * @param city optional free-text city
 * @param showCity "Show my city on my profile"
 * @param discoverable whether the collector opted in to discovery
 */
public record MyLocationView(
        @Nullable PublicPlace place,
        @Nullable String regionName,
        @Nullable String city,
        boolean showCity,
        boolean discoverable) {}
