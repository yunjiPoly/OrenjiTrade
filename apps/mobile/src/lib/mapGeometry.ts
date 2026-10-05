import {
  APPROXIMATE_AREA_RADIUS_M,
  COLLECTOR_MAP_MAX_ZOOM,
  clampZoom,
  round3,
} from './approximateArea';
import type { AreaRegion, LatLng } from './location';

/**
 * Web Mercator helpers shared by the three map engines of the app (react-native-maps, Leaflet in
 * a WebView, Leaflet on web): zoom <-> region conversion, bounds, distances and hit testing. Pure
 * functions, no map library (mirror of the web's `map-adapter.ts` helpers).
 */

export const TILE_SIZE = 256;
const EARTH_RADIUS_KM = 6371;
/** Ground resolution at zoom 0 on the equator (m/px of a 256 px tile). */
const METRES_PER_PX_Z0 = 156_543.033_92;
const MAX_LAT = 85.0511;

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** What a map shows: centre, zoom (fractional on react-native-maps) and the visible bounds. */
export interface MapViewport {
  center: LatLng;
  zoom: number;
  bounds: MapBounds;
}

export interface MapSize {
  width: number;
  height: number;
}

/** A request for a collector map to move (`seq` makes repeated requests distinct). */
export type CameraRequest =
  | { seq: number; kind: 'center'; center: LatLng; zoom: number }
  | { seq: number; kind: 'bounds'; bounds: MapBounds };

export type CameraTarget =
  { kind: 'center'; center: LatLng; zoom: number } | { kind: 'bounds'; bounds: MapBounds };

/** Web Mercator world pixel of a point at `zoom` (Leaflet / Google projection). */
export function worldPixel(point: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Great-circle distance in km (display and query sizing only). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ground metres per screen point (dp / CSS px) at a latitude and zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (METRES_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Radius that covers the whole visible map: centre to the farthest corner (km). */
export function visibleRadiusKm(viewport: Pick<MapViewport, 'center' | 'bounds'>): number {
  const { bounds, center } = viewport;
  return Math.max(
    distanceKm(center, { lat: bounds.north, lng: bounds.east }),
    distanceKm(center, { lat: bounds.south, lng: bounds.west })
  );
}

/** The bounds a react-native-maps region covers. */
export function boundsOfRegion(region: AreaRegion): MapBounds {
  return {
    north: region.latitude + region.latitudeDelta / 2,
    south: region.latitude - region.latitudeDelta / 2,
    east: region.longitude + region.longitudeDelta / 2,
    west: region.longitude - region.longitudeDelta / 2,
  };
}

/** Zoom of a react-native-maps region drawn `width` points wide (Google Maps uses dp). */
export function zoomOfRegion(region: Pick<AreaRegion, 'longitudeDelta'>, width: number): number {
  const delta = Math.max(region.longitudeDelta, 1e-9);
  return Math.log2((360 * Math.max(width, 1)) / (TILE_SIZE * delta));
}

/** The viewport of a react-native-maps region. */
export function viewportOfRegion(region: AreaRegion, width: number): MapViewport {
  return {
    center: { lat: region.latitude, lng: region.longitude },
    zoom: zoomOfRegion(region, width),
    bounds: boundsOfRegion(region),
  };
}

/**
 * The react-native-maps region showing `center` at `zoom` on a map of `size` points, the zoom
 * clamped to the collector maps' cap first (every programmatic camera change goes through this).
 */
export function regionForCamera(
  center: LatLng,
  zoom: number,
  size: MapSize,
  maxZoom: number = COLLECTOR_MAP_MAX_ZOOM
): AreaRegion {
  const z = clampZoom(zoom, maxZoom);
  const width = Math.max(size.width, 1);
  const height = Math.max(size.height, 1);
  const longitudeDelta = (360 * width) / (TILE_SIZE * 2 ** z);
  const cos = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  return {
    latitude: round3(center.lat),
    longitude: round3(center.lng),
    latitudeDelta: longitudeDelta * (height / width) * cos,
    longitudeDelta,
  };
}

/**
 * Largest zoom at which `bounds` fit a map of `size` points with `padding` around them (Leaflet's
 * `getBoundsZoom`, without snapping), never above the cap.
 */
export function zoomForBounds(
  bounds: MapBounds,
  size: MapSize,
  padding = 48,
  maxZoom: number = COLLECTOR_MAP_MAX_ZOOM
): number {
  const ne = worldPixel({ lat: bounds.north, lng: bounds.east }, 0);
  const sw = worldPixel({ lat: bounds.south, lng: bounds.west }, 0);
  const dx = Math.max(Math.abs(ne.x - sw.x), 1e-9);
  const dy = Math.max(Math.abs(sw.y - ne.y), 1e-9);
  const width = Math.max(size.width - 2 * padding, 1);
  const height = Math.max(size.height - 2 * padding, 1);
  return clampZoom(Math.floor(Math.log2(Math.min(width / dx, height / dy))), maxZoom);
}

/** Centre of bounds, rounded to 3 decimals. */
export function boundsCenter(bounds: MapBounds): LatLng {
  return {
    lat: round3((bounds.north + bounds.south) / 2),
    lng: round3((bounds.east + bounds.west) / 2),
  };
}

/** The react-native-maps region of a camera request, clamped to the cap. */
export function regionForTarget(
  target: CameraTarget,
  size: MapSize,
  maxZoom: number = COLLECTOR_MAP_MAX_ZOOM
): AreaRegion {
  if (target.kind === 'center') {
    return regionForCamera(target.center, target.zoom, size, maxZoom);
  }
  return regionForCamera(
    boundsCenter(target.bounds),
    zoomForBounds(target.bounds, size, 48, maxZoom),
    size,
    maxZoom
  );
}

/**
 * A region pulled back to the cap when a gesture (or anything else) went past it: the same centre
 * at {@link COLLECTOR_MAP_MAX_ZOOM}, or null when the region is within the cap. The tolerance
 * absorbs the rounding of native zoom levels.
 */
export function regionBeyondCap(
  region: AreaRegion,
  size: MapSize,
  maxZoom: number = COLLECTOR_MAP_MAX_ZOOM
): AreaRegion | null {
  if (zoomOfRegion(region, size.width) <= maxZoom + 0.05) {
    return null;
  }
  return regionForCamera({ lat: region.latitude, lng: region.longitude }, maxZoom, size, maxZoom);
}

/** A zone that can be tapped: its id and the public point it is drawn around. */
export interface HitZone {
  id: string;
  center: LatLng;
}

/** Smallest touch target around a zone, in points (accessibility: small zones stay tappable). */
export const MIN_TOUCH_RADIUS_PT = 22;

/**
 * The zone under a tap: among the zones whose 1500 m area (or a minimum touch target at this zoom)
 * contains the tap, the one whose centre is nearest. `null` when the tap is outside every zone.
 */
export function zoneAt<T extends HitZone>(
  zones: readonly T[],
  tap: LatLng,
  zoom: number
): T | null {
  const reachKm =
    Math.max(APPROXIMATE_AREA_RADIUS_M, metresPerPixel(tap.lat, zoom) * MIN_TOUCH_RADIUS_PT) / 1000;
  let best: T | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const km = distanceKm(zone.center, tap);
    if (km <= reachKm && km < bestKm) {
      best = zone;
      bestKm = km;
    }
  }
  return best;
}
