package com.orenjitrade.api.location.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Small spherical-geometry helpers (no coordinates are ever logged by callers). */
public final class GeoMath {

    /** Mean Earth radius in kilometres. */
    static final double EARTH_RADIUS_KM = 6371.0088;

    private GeoMath() {}

    /** Rounds to 3 decimals (about 110 m of latitude), half-up, as the API exposes coordinates. */
    public static double round3(double value) {
        return BigDecimal.valueOf(value).setScale(3, RoundingMode.HALF_UP).doubleValue();
    }

    /** Great-circle distance in kilometres (haversine). */
    public static double distanceKm(double lat1, double lng1, double lat2, double lng2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double dPhi = Math.toRadians(lat2 - lat1);
        double dLambda = Math.toRadians(lng2 - lng1);
        double a =
                Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                        + Math.cos(phi1)
                                * Math.cos(phi2)
                                * Math.sin(dLambda / 2)
                                * Math.sin(dLambda / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /** Normalises a longitude into {@code [-180, 180)}. */
    static double normaliseLng(double lng) {
        double normalised = ((lng + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
        return normalised == -180.0 && lng > 0 ? 180.0 : normalised;
    }
}
