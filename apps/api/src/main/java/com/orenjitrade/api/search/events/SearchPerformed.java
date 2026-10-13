package com.orenjitrade.api.search.events;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A search was served (unified search, card-holder search, or a state binder list of the map). An
 * in-process notification for the analytics module (plain listener, never persisted): geography is
 * the platform region and, for the map, the subdivision code only, never a city, a coordinate or a
 * distance (ADR 0017); the analytics module scrubs and truncates the query text and pseudonymises
 * the viewer.
 *
 * @param surface {@code search}, {@code card_holders} or {@code map}
 * @param viewerId the searcher, {@code null} for signed-out visitors
 * @param query the raw query text, when any
 * @param game game filter
 * @param types result types requested (unified search)
 * @param resolved {@code printing}, {@code card} or {@code none}
 * @param resultCount number of results found
 * @param filters names of the filters in use
 * @param regionCode the platform region searched
 * @param subdivisionCode the subdivision browsed (map), when any
 * @param occurredAt when
 */
public record SearchPerformed(
        String surface,
        @Nullable UUID viewerId,
        @Nullable String query,
        @Nullable String game,
        List<String> types,
        String resolved,
        long resultCount,
        List<String> filters,
        String regionCode,
        @Nullable String subdivisionCode,
        Instant occurredAt) {

    public static final String SURFACE_SEARCH = "search";
    public static final String SURFACE_CARD_HOLDERS = "card_holders";
    public static final String SURFACE_MAP = "map";

    public SearchPerformed {
        types = List.copyOf(types);
        filters = List.copyOf(filters);
    }
}
