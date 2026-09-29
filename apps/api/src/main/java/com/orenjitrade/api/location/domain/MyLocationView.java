package com.orenjitrade.api.location.domain;

import org.jspecify.annotations.Nullable;

/**
 * The owner's own view of their location ({@code GET /api/v1/me/location}); the only place the
 * chosen trading-area centre is ever returned.
 *
 * @param tradingArea chosen area, or {@code null} when none is set
 * @param publicPoint the derived point others see, {@code null} while not discoverable
 * @param discoverable whether the collector opted in to the map
 */
public record MyLocationView(
        @Nullable TradingArea tradingArea,
        @Nullable PublicPoint publicPoint,
        boolean discoverable) {

    /**
     * The owner's trading area (centre stored at 3 decimals).
     *
     * @param lat centre latitude
     * @param lng centre longitude
     * @param radiusKm radius, 1 to 50 km
     * @param source how the centre was chosen
     * @param label region label of the area
     */
    public record TradingArea(
            double lat,
            double lng,
            int radiusKm,
            TradingAreaSource source,
            @Nullable String label) {}
}
