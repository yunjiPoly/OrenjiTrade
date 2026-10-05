import type { operations } from '@orenji/shared-types';

import type { ApiError } from '@/src/api/ApiError';
import type { CollectorMarker, CollectorRating, NearbyCollectorsResponse } from '@/src/api/types';
import { distanceBucketLabel } from '@/src/lib/formatDistanceBucket';
import type { LatLng } from '@/src/lib/location';
import { distanceKm } from '@/src/lib/mapGeometry';

/**
 * Map discovery rules of the Map tab (mirror of the web's `features/map/data/map-params.ts`,
 * `map-query.ts` and `shared/discovery/discovery-labels.ts`): which `GET /collectors/nearby` call
 * the map makes, when a pan or zoom needs a new one, and the words the map uses.
 */

export type NearbyParams = NonNullable<operations['listNearbyCollectors']['parameters']['query']>;

/** `availability` filter of `/collectors/nearby` (the map's "Intent"). */
export type IntentFilter = NonNullable<NearbyParams['availability']>;

export const INTENT_FILTERS: readonly { value: IntentFilter; label: string }[] = [
  { value: 'TRADE', label: 'For trade' },
  { value: 'SALE', label: 'For sale' },
  { value: 'TRADE_OR_SALE', label: 'Trade or sale' },
  { value: 'ACCEPTS_OFFERS', label: 'Accepts offers' },
];

export function isIntentFilter(value: unknown): value is IntentFilter {
  return INTENT_FILTERS.some((option) => option.value === value);
}

export function intentLabel(value: string | null | undefined): string {
  return INTENT_FILTERS.find((option) => option.value === value)?.label ?? 'Any intent';
}

/** Radius bounds (km); the upper bound is further capped by the plan (`map.radius.max_km`). */
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 100;
/** The API's default radius (lowered to the plan cap). */
export const DEFAULT_RADIUS_KM = 10;
/** Radius choices of the filter sheet (those above the plan cap are left out). */
export const RADIUS_CHOICES: readonly number[] = [5, 10, 25, 50, 100];
/** Plan cap used until the real one is known (the FREE plan's `map.radius.max_km`). */
export const FALLBACK_RADIUS_CAP_KM = 25;
/** Plan limit capping the map radius (V011 key; the contract calls it `map.radius.max`). */
export const MAP_RADIUS_LIMIT_KEY = 'map.radius.max_km';
/** Collectors requested per query (the API accepts 1 to 500). */
export const NEARBY_LIMIT = 200;
/** Pause after the last pan or zoom before the map asks for collectors again. */
export const VIEWPORT_DEBOUNCE_MS = 400;

/** Filters of the Map tab. The map position is never part of them (ADR 0004). */
export interface MapFilters {
  game: string | null;
  intent: IntentFilter | null;
  /** Chosen radius in km; `null` = the default. */
  radiusKm: number | null;
}

export const DEFAULT_MAP_FILTERS: MapFilters = { game: null, intent: null, radiusKm: null };

/** "Who has this near me": collectors listing any printing of a card, or one printing. */
export type HoldersTarget = { kind: 'card' | 'printing'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string | string[] | null | undefined): string | null {
  const text = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  return UUID.test(text) ? text.toLowerCase() : null;
}

/** The holders target of the Map tab's route parameters (`?card=` or `?printing=`). */
export function holdersTarget(params: {
  card?: string | string[];
  printing?: string | string[];
}): HoldersTarget | null {
  const printing = uuidOrNull(params.printing);
  if (printing) {
    return { kind: 'printing', id: printing };
  }
  const card = uuidOrNull(params.card);
  return card ? { kind: 'card', id: card } : null;
}

/** Number of active filters (for "Clear filters"). */
export function activeFilterCount(filters: MapFilters): number {
  return (filters.game ? 1 : 0) + (filters.intent ? 1 : 0) + (filters.radiusKm !== null ? 1 : 0);
}

/** The plan cap as a radius bound: unlimited (`null`) plans stop at {@link MAX_RADIUS_KM}. */
export function radiusCapKm(limit: number | null | undefined): number {
  if (limit === null || limit === undefined || !Number.isFinite(limit)) {
    return MAX_RADIUS_KM;
  }
  return Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.floor(limit)));
}

/** The chosen radius (or the default), bounded by the plan. */
export function chosenRadiusKm(chosen: number | null, cap: number): number {
  const value = chosen ?? DEFAULT_RADIUS_KM;
  return Math.max(MIN_RADIUS_KM, Math.min(value, cap));
}

/**
 * Radius actually requested: what is visible on the map, never more than the chosen radius and
 * never less than 1 km; rounded up to 0.5 km so tiny pans do not produce new cache keys.
 */
export function queryRadiusKm(visibleKm: number | null, chosenKm: number): number {
  const wanted = visibleKm === null ? chosenKm : Math.min(visibleKm, chosenKm);
  return Math.max(MIN_RADIUS_KM, Math.min(chosenKm, Math.ceil(wanted * 2) / 2));
}

/** Centre sent to the API: 2 decimals (the server snaps to 0.01° anyway, ADR 0004). */
export function roundCentre(centre: LatLng): LatLng {
  return { lat: Math.round(centre.lat * 100) / 100, lng: Math.round(centre.lng * 100) / 100 };
}

/** One `GET /collectors/nearby` call. `centre: null` = the caller's own trading area. */
export interface NearbyQuery {
  centre: LatLng | null;
  /** Radius requested (the visible part of the chosen radius). */
  radiusKm: number;
  /** The radius the collector chose; results never go beyond it. */
  limitKm: number;
  game: string | null;
  intent: IntentFilter | null;
  holders: HoldersTarget | null;
}

/** Query parameters of a call (filters left out when unset; the centre at 2 decimals). */
export function nearbyParams(query: NearbyQuery): NearbyParams {
  const params: NearbyParams = { radiusKm: query.radiusKm, limit: NEARBY_LIMIT };
  if (query.centre) {
    const centre = roundCentre(query.centre);
    params.lat = centre.lat;
    params.lng = centre.lng;
  }
  if (query.game) {
    params.game = query.game;
  }
  if (query.intent) {
    params.availability = query.intent;
  }
  if (query.holders?.kind === 'printing') {
    params.hasPrintingId = query.holders.id;
  } else if (query.holders?.kind === 'card') {
    params.hasCardId = query.holders.id;
  }
  return params;
}

/** Everything but the position: filters and the chosen radius. */
export function filterKey(query: NearbyQuery): string {
  return JSON.stringify([
    query.limitKm,
    query.game,
    query.intent,
    query.holders?.kind ?? null,
    query.holders?.id ?? null,
  ]);
}

/** The circle an answer covered (the centre and radius the server answered with). */
export interface CoveredArea {
  centre: LatLng;
  radiusKm: number;
  filterKey: string;
}

/**
 * True when `query` asks for nothing new: same filters, and its circle lies inside the area the
 * last answer covered (zooming in or small pans never re-query).
 */
export function isCovered(query: NearbyQuery, area: CoveredArea | null): boolean {
  if (!area || !query.centre || filterKey(query) !== area.filterKey) {
    return false;
  }
  const centre = roundCentre(query.centre);
  return distanceKm(centre, area.centre) + query.radiusKm <= area.radiusKm + 0.25;
}

/** "8 collectors within 10 km" / "Nobody lists this card within 10 km yet". */
export function statusLabel(
  result: NearbyCollectorsResponse | undefined,
  holders: boolean,
  failed: boolean
): string {
  if (!result) {
    return failed ? 'Collectors could not load' : 'Finding collectors…';
  }
  const radius = Math.round(result.radiusKm * 10) / 10;
  const count = result.total;
  if (count === 0) {
    return holders
      ? `Nobody lists this card within ${radius} km yet`
      : `No collectors within ${radius} km yet`;
  }
  const noun = count === 1 ? 'collector' : 'collectors';
  return `${count} ${holders ? `${noun} with this card` : noun} within ${radius} km`;
}

/** The plan's radius cap from a `LIMIT_REACHED` answer (or one step down when it has none). */
export function capAfterLimit(error: ApiError, limitKm: number, current: number): number {
  const problem = (error.problem ?? {}) as Record<string, unknown>;
  const limit = typeof problem.limit === 'number' ? problem.limit : null;
  return limit !== null
    ? radiusCapKm(limit)
    : Math.max(MIN_RADIUS_KM, Math.min(current, Math.floor(limitKm) - 1));
}

/** Readable tag from its slug (`local-meetups` -> `Local meetups`). */
export function tagLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words ? (words[0]?.toUpperCase() ?? '') + words.slice(1) : slug;
}

/** "4.8 (12 ratings)" / "No ratings yet". */
export function ratingLabel(rating: CollectorRating | null | undefined): string {
  if (!rating || rating.count <= 0 || rating.average === null || rating.average === undefined) {
    return 'No ratings yet';
  }
  return `${rating.average.toFixed(1)} (${rating.count} ${rating.count === 1 ? 'rating' : 'ratings'})`;
}

/** "2 public binders · 143 cards" / "No public listings yet". */
export function listingsLabel(
  collector: Pick<CollectorMarker, 'publicBinderCount' | 'publicItemCount'>
): string {
  const binders = collector.publicBinderCount;
  const items = collector.publicItemCount;
  if (binders <= 0 && items <= 0) {
    return 'No public listings yet';
  }
  const parts: string[] = [];
  if (binders > 0) {
    parts.push(`${binders} public ${binders === 1 ? 'binder' : 'binders'}`);
  }
  if (items > 0) {
    parts.push(`${items} ${items === 1 ? 'card' : 'cards'}`);
  }
  return parts.join(' · ');
}

/**
 * Distance shown for a collector: the API's bucket only (never metres), the viewer's own public
 * position, or why there is none.
 */
export function collectorDistanceLabel(bucket: string | null | undefined, isSelf: boolean): string {
  if (isSelf) {
    return 'Your public position';
  }
  return distanceBucketLabel(bucket) ?? 'Distance hidden';
}

/** Accessible name of a collector zone ("Maïka Tremblay, Plateau-Mont-Royal"). */
export function collectorZoneLabel(
  collector: Pick<CollectorMarker, 'id' | 'displayName' | 'publicLabel'>,
  selfId: string | null
): string {
  const name =
    selfId && collector.id === selfId ? `You (${collector.displayName})` : collector.displayName;
  return collector.publicLabel ? `${name}, ${collector.publicLabel}` : name;
}
