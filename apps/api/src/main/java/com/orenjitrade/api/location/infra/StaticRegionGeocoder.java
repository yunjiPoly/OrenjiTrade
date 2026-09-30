package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.location.domain.GeoMath;
import com.orenjitrade.api.location.domain.RegionGeocoder;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Offline {@link RegionGeocoder}: a fixed table of about 30 public neighbourhood and city centroids
 * (Montréal area first, then Canadian cities). Resolution order:
 *
 * <ol>
 *   <li>the nearest neighbourhood whose radius contains the point;
 *   <li>otherwise the nearest city whose radius contains the point;
 *   <li>otherwise {@code "Near <city>"} for the nearest city within {@value #NEAR_KM} km;
 *   <li>otherwise {@value #FALLBACK_LABEL}.
 * </ol>
 *
 * No network calls, no API keys; a hosted geocoder can replace it behind the interface later.
 */
public class StaticRegionGeocoder implements RegionGeocoder {

    static final double NEAR_KM = 150;
    static final String FALLBACK_LABEL = "Approximate area";

    enum Level {
        NEIGHBOURHOOD,
        CITY
    }

    record Region(String label, double lat, double lng, double radiusKm, Level level) {

        double distanceKm(double pointLat, double pointLng) {
            return GeoMath.distanceKm(lat, lng, pointLat, pointLng);
        }

        boolean contains(double pointLat, double pointLng) {
            return distanceKm(pointLat, pointLng) <= radiusKm;
        }
    }

    static final List<Region> REGIONS =
            List.of(
                    // --- Montréal neighbourhoods and boroughs ---------------------------------
                    hood("Plateau-Mont-Royal, Montréal", 45.522, -73.581, 1.8),
                    hood("Mile End, Montréal", 45.524, -73.601, 1.0),
                    hood("Outremont, Montréal", 45.518, -73.610, 1.2),
                    hood("Rosemont, Montréal", 45.549, -73.577, 2.2),
                    hood("Villeray, Montréal", 45.545, -73.620, 1.8),
                    hood("Ahuntsic, Montréal", 45.555, -73.662, 2.5),
                    hood("Saint-Léonard, Montréal", 45.587, -73.597, 2.5),
                    hood("Montréal-Nord, Montréal", 45.601, -73.633, 2.5),
                    hood("Hochelaga-Maisonneuve, Montréal", 45.545, -73.545, 2.2),
                    hood("Downtown Montréal", 45.501, -73.567, 1.2),
                    hood("Old Port, Montréal", 45.507, -73.554, 0.9),
                    hood("Griffintown, Montréal", 45.493, -73.561, 0.8),
                    hood("Verdun, Montréal", 45.458, -73.568, 2.2),
                    hood("Westmount", 45.483, -73.598, 1.6),
                    hood("Côte-des-Neiges, Montréal", 45.495, -73.625, 2.0),
                    hood("Saint-Laurent, Montréal", 45.506, -73.690, 3.5),
                    hood("LaSalle, Montréal", 45.430, -73.630, 3.0),
                    hood("Lachine, Montréal", 45.440, -73.690, 3.0),
                    hood("Pointe-Claire", 45.449, -73.816, 4.0),
                    // --- Greater Montréal cities ----------------------------------------------
                    city("Montréal", 45.502, -73.567, 18),
                    city("Laval", 45.606, -73.712, 12),
                    city("Longueuil", 45.531, -73.518, 7),
                    city("Brossard", 45.458, -73.466, 5),
                    // --- Other Canadian cities -------------------------------------------------
                    city("Québec", 46.813, -71.208, 20),
                    city("Sherbrooke", 45.404, -71.893, 12),
                    city("Trois-Rivières", 46.343, -72.543, 12),
                    city("Gatineau", 45.477, -75.701, 12),
                    city("Ottawa", 45.421, -75.697, 20),
                    city("Toronto", 43.653, -79.383, 30),
                    city("Winnipeg", 49.895, -97.138, 20),
                    city("Calgary", 51.045, -114.057, 25),
                    city("Edmonton", 53.546, -113.494, 25),
                    city("Vancouver", 49.283, -123.121, 25),
                    city("Halifax", 44.649, -63.576, 15));

    @Override
    public String labelFor(double lat, double lng) {
        Optional<Region> hood = nearestContaining(Level.NEIGHBOURHOOD, lat, lng);
        if (hood.isPresent()) {
            return hood.get().label();
        }
        Optional<Region> city = nearestContaining(Level.CITY, lat, lng);
        if (city.isPresent()) {
            return city.get().label();
        }
        return REGIONS.stream()
                .filter(region -> region.level() == Level.CITY)
                .min(Comparator.comparingDouble(region -> region.distanceKm(lat, lng)))
                .filter(region -> region.distanceKm(lat, lng) <= NEAR_KM)
                .map(region -> "Near " + region.label())
                .orElse(FALLBACK_LABEL);
    }

    private static Optional<Region> nearestContaining(Level level, double lat, double lng) {
        return REGIONS.stream()
                .filter(region -> region.level() == level && region.contains(lat, lng))
                .min(Comparator.comparingDouble(region -> region.distanceKm(lat, lng)));
    }

    private static Region hood(String label, double lat, double lng, double radiusKm) {
        return new Region(label, lat, lng, radiusKm, Level.NEIGHBOURHOOD);
    }

    private static Region city(String label, double lat, double lng, double radiusKm) {
        return new Region(label, lat, lng, radiusKm, Level.CITY);
    }
}
