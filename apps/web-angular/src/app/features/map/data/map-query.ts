import type { ListNearbyCollectorsRequestParams } from '@orenji/api-client';
import { LatLng, MapViewport, distanceKm } from '../../../shared/map/map-adapter';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM, MapParams } from './map-params';

/** Plan cap used until the real one is known (the FREE plan's `map.radius.max_km`). */
export const FALLBACK_RADIUS_CAP_KM = 25;
/** Collectors requested per query (the API accepts 1 to 500). */
export const NEARBY_LIMIT = 200;
/** Pause after the last pan/zoom before the map asks for collectors again. */
export const VIEWPORT_DEBOUNCE_MS = 400;

/** One `GET /collectors/nearby` call. `centre: null` = the caller's own trading area. */
export interface NearbyQuery {
  centre: LatLng | null;
  /** Radius requested (the visible part of the chosen radius). */
  radiusKm: number;
  /** The radius the collector chose (slider); results never go beyond it. */
  limitKm: number;
  game: string | null;
  availability: MapParams['availability'];
  freshness: MapParams['freshness'];
  tags: readonly string[];
  cardId: string | null;
  printingId: string | null;
}

/** Radius that covers the whole visible map: centre to the farthest corner (km). */
export function visibleRadiusKm(viewport: MapViewport): number {
  const { bounds, center } = viewport;
  return Math.max(
    distanceKm(center, { lat: bounds.north, lng: bounds.east }),
    distanceKm(center, { lat: bounds.south, lng: bounds.west }),
  );
}

/** The plan cap as a slider bound: unlimited (`null`) plans stop at {@link MAX_RADIUS_KM}. */
export function radiusCapKm(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit)) {
    return MAX_RADIUS_KM;
  }
  return Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.floor(limit)));
}

/** The chosen radius (or the default), bounded by the slider and the plan. */
export function chosenRadiusKm(chosen: number | null, cap: number): number {
  const value = chosen ?? DEFAULT_RADIUS_KM;
  return Math.max(MIN_RADIUS_KM, Math.min(value, cap));
}

/**
 * Radius actually requested: what is visible on the map, never more than the chosen radius and
 * never less than 1 km. Rounded up to 0.5 km so tiny pans do not produce new cache keys.
 */
export function queryRadiusKm(visibleKm: number | null, chosenKm: number): number {
  const wanted = visibleKm === null ? chosenKm : Math.min(visibleKm, chosenKm);
  return Math.max(MIN_RADIUS_KM, Math.min(chosenKm, Math.ceil(wanted * 2) / 2));
}

/** Centre sent to the API: 2 decimals (the server snaps to 0.01° anyway). */
export function roundCentre(centre: LatLng): LatLng {
  return { lat: Math.round(centre.lat * 100) / 100, lng: Math.round(centre.lng * 100) / 100 };
}

/** Generated-client parameters for a query (filters left out when unset). */
export function nearbyRequest(query: NearbyQuery): ListNearbyCollectorsRequestParams {
  const params: ListNearbyCollectorsRequestParams = {
    radiusKm: query.radiusKm,
    limit: NEARBY_LIMIT,
  };
  if (query.centre) {
    const centre = roundCentre(query.centre);
    params.lat = centre.lat;
    params.lng = centre.lng;
  }
  if (query.game) {
    params.game = query.game;
  }
  if (query.availability) {
    params.availability = query.availability;
  }
  if (query.freshness) {
    params.freshness = query.freshness;
  }
  if (query.tags.length) {
    params.tags = [...query.tags];
  }
  if (query.printingId) {
    params.hasPrintingId = query.printingId;
  } else if (query.cardId) {
    params.hasCardId = query.cardId;
  }
  return params;
}

/** Everything but the position: filters and chosen radius. */
export function filterKey(query: NearbyQuery): string {
  return JSON.stringify([
    query.limitKm,
    query.game,
    query.availability,
    query.freshness,
    [...query.tags].sort(),
    query.cardId,
    query.printingId,
  ]);
}

/** The circle a query covered (the centre and radius the server answered with). */
export interface CoveredArea {
  centre: LatLng;
  radiusKm: number;
  filterKey: string;
}

/**
 * True when `query` asks for nothing new: same filters, and its circle lies inside the area the
 * last answer already covered (zooming in or small pans never re-query).
 */
export function isCovered(query: NearbyQuery, area: CoveredArea | null): boolean {
  if (!area || !query.centre || filterKey(query) !== area.filterKey) {
    return false;
  }
  const centre = roundCentre(query.centre);
  return distanceKm(centre, area.centre) + query.radiusKm <= area.radiusKm + 0.25;
}
