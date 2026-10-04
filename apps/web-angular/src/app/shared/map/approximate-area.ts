import type { LatLng, MapCircle } from './map-adapter';

/**
 * Client rendering of other collectors' positions (ADR 0004, "Client rendering"). The API only
 * ever sends a collector's public point (snapped to a ~1 km grid cell, jittered inside it, 3
 * decimals); these rules make sure no map ever presents that point as an exact spot.
 */

/**
 * Radius of the "approximate area" disc drawn around another collector's public point: 1 km, so
 * the disc is about 2 km wide, the scale of what the point really tells (the collector's chosen
 * trading-area centre lies somewhere in the ~1 km grid cell around it). Display only: the
 * server's grid and the API are unchanged.
 */
export const APPROXIMATE_AREA_RADIUS_M = 1000;

/**
 * Highest zoom of every map that shows other collectors (wheel, buttons, keyboard, gestures and
 * every programmatic move are clamped to it). At zoom 14 the 2 km disc is about 300 px wide at
 * mid latitudes, so it fits whole on a 375 px phone, and a 44 px avatar covers about 300 m, a
 * few blocks rather than one house.
 */
export const COLLECTOR_MAP_MAX_ZOOM = 14;

/** Short note shown on collector maps and in the collector preview. */
export const APPROXIMATE_LOCATION_NOTE = 'Locations are approximate (about 2 km)';

/**
 * The approximate-area disc of a collector, centred on their public point and sized in metres
 * (it grows with the zoom like the streets under it). `emphasised` draws the stronger `area`
 * look (the selected collector, or the single collector of a profile map).
 */
export function approximateAreaCircle(id: string, center: LatLng, emphasised = false): MapCircle {
  return {
    id,
    center: { lat: center.lat, lng: center.lng },
    radiusMeters: APPROXIMATE_AREA_RADIUS_M,
    variant: emphasised ? 'area' : 'approximate',
  };
}
