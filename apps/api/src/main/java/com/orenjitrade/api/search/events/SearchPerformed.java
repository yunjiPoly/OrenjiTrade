package com.orenjitrade.api.search.events;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A search was served (unified search, card-holder search, or a map search with a query or card
 * filter). An in-process notification for the analytics module (plain listener, never persisted):
 * geography is the search centre's grid cell and region label only, never a coordinate (ADR 0004);
 * the analytics module scrubs and truncates the query text and pseudonymises the viewer.
 *
 * @param surface {@code search}, {@code card_holders} or {@code map}
 * @param viewerId the searcher, {@code null} for signed-out visitors
 * @param query the raw query text, when any
 * @param game game filter
 * @param types result types requested (unified search)
 * @param resolved {@code printing}, {@code card} or {@code none}
 * @param resultCount number of results found
 * @param radiusKm search radius, rounded
 * @param filters names of the filters in use
 * @param gridCell grid cell of the search centre, when there was one
 * @param regionLabel region label of the search centre
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
        @Nullable Integer radiusKm,
        List<String> filters,
        @Nullable String gridCell,
        @Nullable String regionLabel,
        Instant occurredAt) {

    public static final String SURFACE_SEARCH = "search";
    public static final String SURFACE_CARD_HOLDERS = "card_holders";
    public static final String SURFACE_MAP = "map";

    public SearchPerformed {
        types = List.copyOf(types);
        filters = List.copyOf(filters);
    }
}
