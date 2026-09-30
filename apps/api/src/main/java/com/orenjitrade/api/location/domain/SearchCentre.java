package com.orenjitrade.api.location.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * The centre of a geographic search (ADR 0004: "the requester's search centre is their own
 * trading-area centre or a client-supplied centre"), snapped to {@value #STEP_DEG} degrees (about 1
 * km) so the precise value never reaches a query, a cache key or a response. Snapping also makes
 * nearby searches cacheable per rounded centre (Phase 4 contract).
 *
 * @param lat latitude, 2 decimals
 * @param lng longitude, 2 decimals, in {@code [-180, 180)}
 */
public record SearchCentre(double lat, double lng) {

    /** Snapping step in degrees. */
    public static final double STEP_DEG = 0.01;

    public SearchCentre {
        lat = round2(lat);
        lng = round2(GeoMath.normaliseLng(lng));
    }

    /** The snapped centre of ({@code lat}, {@code lng}). */
    public static SearchCentre snap(double lat, double lng) {
        return new SearchCentre(lat, lng);
    }

    /** Id of the ~1 km public grid cell of the centre (the only location analytics may carry). */
    public String gridCell() {
        return ApproximateLocationService.cellOf(lat, lng).id();
    }

    /** Great-circle distance in kilometres from this centre to a public point. */
    public double distanceKmTo(PublicPoint point) {
        return GeoMath.distanceKm(lat, lng, point.lat(), point.lng());
    }

    private static double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    @Override
    public String toString() {
        return "SearchCentre[cell=" + gridCell() + "]";
    }
}
