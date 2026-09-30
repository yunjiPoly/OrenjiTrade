package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.location.domain.SearchCentre;
import org.jspecify.annotations.Nullable;

/**
 * Where a search looks: a snapped centre (the caller's choice or their own trading area) and a
 * radius already checked against the caller's plan ({@code map.radius.max_km}).
 *
 * @param centre snapped centre, {@code null} when the search is not geographic
 * @param radiusKm radius in kilometres (0.1 km steps)
 */
public record GeoScope(@Nullable SearchCentre centre, double radiusKm) {

    public boolean hasCentre() {
        return centre != null;
    }

    public double radiusMetres() {
        return radiusKm * 1000.0;
    }

    /** Rounded radius for analytics. */
    public int radiusKmRounded() {
        return (int) Math.round(radiusKm);
    }
}
