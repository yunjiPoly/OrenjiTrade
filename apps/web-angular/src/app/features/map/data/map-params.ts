import {
  AvailabilityFilter,
  FreshnessFilter,
  isAvailabilityFilter,
  isFreshnessFilter,
} from '../../../shared/discovery/discovery-labels';

/** Distance slider bounds (km); the upper bound is further capped by the plan (`map.radius.max_km`). */
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 100;
/** The API's default radius (lowered to the plan cap). */
export const DEFAULT_RADIUS_KM = 10;
/** Most tag filters sent at once. */
export const MAX_TAG_FILTERS = 5;

export type MapView = 'map' | 'list';

/**
 * State of `/map`, mirrored in the URL (`?game=&availability=&freshness=&tags=&radius=&card=
 * &printing=&view=`) so a filtered map can be reloaded and shared. The map position is never put
 * in the URL (it may be derived from the collector's own trading area).
 */
export interface MapParams {
  game: string | null;
  availability: AvailabilityFilter | null;
  freshness: FreshnessFilter | null;
  /** Tag slugs (collectors with any of them). */
  tags: string[];
  /** Chosen radius in km; `null` = the default. */
  radiusKm: number | null;
  /** "Holders of X" mode: collectors listing any printing of this card... */
  card: string | null;
  /** ...or this exact printing (takes precedence over `card`). */
  printing: string | null;
  view: MapView;
}

export type RawMapParams = Partial<Record<keyof MapParams | 'radius', string | null | undefined>>;

export const DEFAULT_MAP_PARAMS: MapParams = {
  game: null,
  availability: null,
  freshness: null,
  tags: [],
  radiusKm: null,
  card: null,
  printing: null,
  view: 'map',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

function uuidOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return UUID.test(text) ? text.toLowerCase() : null;
}

/** Parses (and bounds, like the API's validation) the query parameters of `/map`. */
export function parseMapParams(raw: RawMapParams): MapParams {
  const game = (raw.game ?? '').trim().toLowerCase();
  const availability = (raw.availability ?? '').trim().toUpperCase();
  const freshness = (raw.freshness ?? '').trim().toUpperCase();
  const tags = [
    ...new Set(
      (raw.tags ?? '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => SLUG.test(tag)),
    ),
  ].slice(0, MAX_TAG_FILTERS);
  const radius = Number.parseFloat(raw.radius ?? raw.radiusKm ?? '');
  const printing = uuidOrNull(raw.printing);
  return {
    game: SLUG.test(game) ? game : null,
    availability: isAvailabilityFilter(availability) ? availability : null,
    freshness: isFreshnessFilter(freshness) ? freshness : null,
    tags,
    radiusKm: Number.isFinite(radius)
      ? Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(radius)))
      : null,
    card: printing ? null : uuidOrNull(raw.card),
    printing,
    view: raw.view === 'list' ? 'list' : 'map',
  };
}

/**
 * Query parameters for `router.navigate` (`null` removes a parameter, so defaults keep the URL
 * short).
 */
export function mapParamsToQuery(params: MapParams): Record<string, string | null> {
  return {
    game: params.game,
    availability: params.availability,
    freshness: params.freshness,
    tags: params.tags.length ? params.tags.join(',') : null,
    radius: params.radiusKm === null ? null : String(params.radiusKm),
    card: params.printing ? null : params.card,
    printing: params.printing,
    view: params.view === 'list' ? 'list' : null,
  };
}

/** Number of active filters (for the "Clear filters" affordance). */
export function activeFilterCount(params: MapParams): number {
  return (
    (params.game ? 1 : 0) +
    (params.availability ? 1 : 0) +
    (params.freshness ? 1 : 0) +
    params.tags.length
  );
}

/** Whether the page shows the holders of a card or printing. */
export function holdersTarget(
  params: Pick<MapParams, 'card' | 'printing'>,
): { kind: 'card' | 'printing'; id: string } | null {
  if (params.printing) {
    return { kind: 'printing', id: params.printing };
  }
  return params.card ? { kind: 'card', id: params.card } : null;
}
