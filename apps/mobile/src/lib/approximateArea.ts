/**
 * Client rendering of other collectors' positions (ADR 0004 "Client rendering" and its 2026-10-04
 * owner amendment; mirror of the web's `shared/map/approximate-area.ts`). The API only ever sends
 * a collector's public point (snapped to a ~1 km grid cell, jittered inside it, 3 decimals); these
 * rules make sure no map of the app ever presents that point as an exact spot.
 */

/**
 * Radius of the zone drawn around another collector's public point: 1.5 km, so the zone is about
 * 3 km wide (owner decision 2026-10-04). Display only: the server's grid, jitter and API are
 * unchanged, and no coordinate field is added anywhere.
 */
export const APPROXIMATE_AREA_RADIUS_M = 1500;

/**
 * Highest zoom of every map that shows other collectors (gestures through `maxZoomLevel` /
 * Leaflet's `maxZoom`, every programmatic camera change through {@link clampZoom}). At zoom 14
 * the 3 km zone is about 450 dp wide at Montréal (45.5° N): wider than a phone, always an area.
 */
export const COLLECTOR_MAP_MAX_ZOOM = 14;

/** Lowest zoom of the collector maps (a whole region, never the whole world). */
export const COLLECTOR_MAP_MIN_ZOOM = 3;

/**
 * Zoom of "Show on map" (zoom to a collector): the whole 3 km zone fits on a phone (about 225 dp
 * at 45.5° N). Always passed through {@link clampZoom}.
 */
export const COLLECTOR_FOCUS_ZOOM = 13;

/** Short note shown on collector maps, in the preview and on profiles. */
export const APPROXIMATE_LOCATION_NOTE = 'Locations are approximate (about 3 km)';

/** The map's own note (legend). */
export const MAP_PRIVACY_NOTE = `${APPROXIMATE_LOCATION_NOTE} to protect privacy`;

/** "Approximate area (about 3 km) around Plateau-Mont-Royal, Montréal." */
export function approximateAreaSentence(place: string | null): string {
  return place
    ? `Approximate area (about 3 km) around ${place}. Exact locations are never shown.`
    : 'Approximate area (about 3 km). Exact locations are never shown.';
}

/**
 * Any zoom a collector map is asked to show, bounded by the cap (and the minimum). A missing or
 * invalid zoom falls back to the cap's neighbourhood view instead of throwing.
 */
export function clampZoom(zoom: number, max: number = COLLECTOR_MAP_MAX_ZOOM): number {
  if (!Number.isFinite(zoom)) {
    return Math.min(COLLECTOR_FOCUS_ZOOM, max);
  }
  return Math.max(COLLECTOR_MAP_MIN_ZOOM, Math.min(max, zoom));
}

/** At most 3 decimals (about 110 m): every coordinate handed to a map or sent anywhere. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
