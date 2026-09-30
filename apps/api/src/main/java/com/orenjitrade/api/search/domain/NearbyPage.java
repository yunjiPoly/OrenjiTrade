package com.orenjitrade.api.search.domain;

import java.util.List;

/**
 * Collectors matching a discovery request (at most the requested limit plus one, ranked) and how
 * many match in total. Cached as a whole for 60 s per request key.
 *
 * @param rows ranked rows
 * @param total matching collectors
 */
public record NearbyPage(List<MarkerRow> rows, long total) {

    public NearbyPage {
        rows = List.copyOf(rows);
    }
}
