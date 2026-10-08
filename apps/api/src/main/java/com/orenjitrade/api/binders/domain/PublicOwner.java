package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.location.domain.PublicPlace;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The owner of public listings as any visitor may see them: their state/province and country while
 * they are discoverable, never a city, a coordinate or a distance (ADR 0017).
 *
 * @param id account id
 * @param handle handle
 * @param displayName display name
 * @param avatarUrl avatar
 * @param place state/province and country, {@code null} unless the collector is discoverable with a
 *     location
 */
public record PublicOwner(
        UUID id,
        String handle,
        String displayName,
        @Nullable String avatarUrl,
        @Nullable PublicPlace place) {}
