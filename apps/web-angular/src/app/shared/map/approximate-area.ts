import type { LatLng, MapCircle } from './map-adapter';

/**
 * Client rendering of other collectors' positions (ADR 0004, "Client rendering"). The API only
 * ever sends a collector's public point (snapped to a ~1 km grid cell, jittered inside it, 3
 * decimals); these rules make sure no map ever presents that point as an exact spot.
 */

/**
 * Radius of the "approximate area" zone drawn around another collector's public point: 1.5 km, so
 * the zone is about 3 km wide (owner decision 2026-10-04, ADR 0004; it was 1 km / 2 km wide). The
 * collector's chosen trading-area centre lies somewhere in the ~1 km grid cell around the public
 * point; a 3 km zone never suggests a spot inside that cell. Display only: the server's grid,
 * jitter and the API are unchanged. The mobile Map tab draws the same 1500 m zone.
 */
export const APPROXIMATE_AREA_RADIUS_M = 1500;

/**
 * Highest zoom of every map that shows other collectors (wheel, buttons, keyboard, gestures and
 * every programmatic move are clamped to it). At zoom 14 the 3 km zone is about 310 px wide at the
 * equator, 450 px at Montréal (45.5° N) and 500 px at Calgary (51° N): on a desktop map it is a
 * clearly bounded area, on a 375 px phone it fills the width (an area, never a point), and a 44 px
 * avatar covers about 300 m, a few blocks rather than one house.
 */
export const COLLECTOR_MAP_MAX_ZOOM = 14;

/** Short note shown on collector maps and in the collector preview. */
export const APPROXIMATE_LOCATION_NOTE = 'Locations are approximate (about 3 km)';

/**
 * The approximate-area zone of a collector, centred on their public point and sized in metres
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
