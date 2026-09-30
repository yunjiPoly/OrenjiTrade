import type { SearchCardHoldersRequestParams } from '@orenji/api-client';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import {
  AvailabilityFilter,
  FreshnessFilter,
  isAvailabilityFilter,
  isFreshnessFilter,
} from '../../../shared/discovery/discovery-labels';
import type { LatLng } from '../../../shared/map/map-adapter';

export type SearchTab = 'cards' | 'collectors' | 'binders';
export const SEARCH_TABS: readonly SearchTab[] = ['cards', 'collectors', 'binders'];

export type HolderSort = 'distance' | 'price' | 'freshness';
export const HOLDER_SORTS: readonly { value: HolderSort; label: string }[] = [
  { value: 'distance', label: 'Closest first' },
  { value: 'price', label: 'Lowest price' },
  { value: 'freshness', label: 'Freshest listings' },
];

/** Asking prices accepted by the filters (the API stores `NUMERIC(12,2)`). */
export const MAX_PRICE = 100_000;
export const HOLDERS_PAGE_SIZE = 20;

/** Filters of the card-holders view (`GET /search/card-holders`). */
export interface HolderFilters {
  availability: AvailabilityFilter | null;
  condition: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  freshness: FreshnessFilter | null;
  edition: string | null;
  language: string | null;
  acceptsOffers: boolean;
  sort: HolderSort;
  page: number;
}

/**
 * State of `/search`, mirrored in the URL: `?q=&tab=` for the unified results, or
 * `?card=|printing=` plus the holder filters (`availability`, `condition`, `minPrice`, `maxPrice`,
 * `freshness`, `edition`, `language`, `offers`, `sort`, `page`) for "who near me has this card".
 */
export interface SearchParams {
  q: string;
  tab: SearchTab;
  card: string | null;
  printing: string | null;
  filters: HolderFilters;
}

export type RawSearchParams = Partial<
  Record<
    | 'q'
    | 'tab'
    | 'card'
    | 'printing'
    | 'availability'
    | 'condition'
    | 'minPrice'
    | 'maxPrice'
    | 'freshness'
    | 'edition'
    | 'language'
    | 'offers'
    | 'sort'
    | 'page',
    string | null | undefined
  >
>;

export const DEFAULT_HOLDER_FILTERS: HolderFilters = {
  availability: null,
  condition: null,
  minPrice: null,
  maxPrice: null,
  freshness: null,
  edition: null,
  language: null,
  acceptsOffers: false,
  sort: 'distance',
  page: 0,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM = /^[A-Z][A-Z0-9_]{0,31}$/;
const LANGUAGE = /^[a-z]{2,3}$/;

function uuidOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return UUID.test(text) ? text.toLowerCase() : null;
}

/** A price from the URL or a form: 2 decimals, within [0, MAX_PRICE]; `null` otherwise. */
export function parsePrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_PRICE) {
    return null;
  }
  return Math.round(number * 100) / 100;
}

export function parseSearchParams(raw: RawSearchParams): SearchParams {
  const tab = (raw.tab ?? '').trim().toLowerCase();
  const availability = (raw.availability ?? '').trim().toUpperCase();
  const freshness = (raw.freshness ?? '').trim().toUpperCase();
  const condition = (raw.condition ?? '').trim().toUpperCase();
  const edition = (raw.edition ?? '').trim().toUpperCase();
  const language = (raw.language ?? '').trim().toLowerCase();
  const sort = HOLDER_SORTS.find((option) => option.value === raw.sort)?.value ?? 'distance';
  const page = Number.parseInt(raw.page ?? '', 10);
  let minPrice = parsePrice(raw.minPrice);
  let maxPrice = parsePrice(raw.maxPrice);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const printing = uuidOrNull(raw.printing);
  return {
    q: (raw.q ?? '').trim().slice(0, QUERY_MAX_LENGTH),
    tab: (SEARCH_TABS as readonly string[]).includes(tab) ? (tab as SearchTab) : 'cards',
    card: printing ? null : uuidOrNull(raw.card),
    printing,
    filters: {
      availability: isAvailabilityFilter(availability) ? availability : null,
      condition: ENUM.test(condition) ? condition : null,
      minPrice,
      maxPrice,
      freshness: isFreshnessFilter(freshness) ? freshness : null,
      edition: ENUM.test(edition) ? edition : null,
      language: LANGUAGE.test(language) ? language : null,
      acceptsOffers: raw.offers === 'true' || raw.offers === '1',
      sort,
      page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 0,
    },
  };
}

/** Query parameters of the holder filters (`null` removes a parameter). */
export function holderFiltersToQuery(filters: HolderFilters): Record<string, string | null> {
  return {
    availability: filters.availability,
    condition: filters.condition,
    minPrice: filters.minPrice === null ? null : String(filters.minPrice),
    maxPrice: filters.maxPrice === null ? null : String(filters.maxPrice),
    freshness: filters.freshness,
    edition: filters.edition,
    language: filters.language,
    offers: filters.acceptsOffers ? 'true' : null,
    sort: filters.sort === 'distance' ? null : filters.sort,
    page: filters.page > 0 ? String(filters.page) : null,
  };
}

/** Number of narrowing filters (sort and page excluded). */
export function activeHolderFilterCount(filters: HolderFilters): number {
  return (
    (filters.availability ? 1 : 0) +
    (filters.condition ? 1 : 0) +
    (filters.minPrice !== null ? 1 : 0) +
    (filters.maxPrice !== null ? 1 : 0) +
    (filters.freshness ? 1 : 0) +
    (filters.edition ? 1 : 0) +
    (filters.language ? 1 : 0) +
    (filters.acceptsOffers ? 1 : 0)
  );
}

/** Same filters (every field compared). */
export function sameHolderFilters(a: HolderFilters, b: HolderFilters): boolean {
  return (Object.keys(DEFAULT_HOLDER_FILTERS) as (keyof HolderFilters)[]).every(
    (key) => a[key] === b[key],
  );
}

/** Inline validation of a price range; `null` when valid. */
export function priceRangeError(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null && min > max) {
    return 'The minimum price must not be above the maximum.';
  }
  return null;
}

/** Generated-client parameters of a card-holders page. `centre: null` = own trading area. */
export function cardHoldersRequest(
  target: { kind: 'card' | 'printing'; id: string },
  filters: HolderFilters,
  centre: LatLng | null,
  size = HOLDERS_PAGE_SIZE,
): SearchCardHoldersRequestParams {
  const params: SearchCardHoldersRequestParams = {
    sort: filters.sort,
    page: filters.page,
    size,
  };
  if (target.kind === 'printing') {
    params.printingId = target.id;
  } else {
    params.cardId = target.id;
  }
  if (centre) {
    params.lat = Math.round(centre.lat * 1000) / 1000;
    params.lng = Math.round(centre.lng * 1000) / 1000;
  }
  if (filters.availability) {
    params.availability = filters.availability;
  }
  if (filters.condition) {
    params.condition = filters.condition;
  }
  if (filters.minPrice !== null) {
    params.minPrice = filters.minPrice;
  }
  if (filters.maxPrice !== null) {
    params.maxPrice = filters.maxPrice;
  }
  if (filters.freshness) {
    params.freshness = filters.freshness;
  }
  if (filters.edition) {
    params.edition = filters.edition;
  }
  if (filters.language) {
    params.language = filters.language;
  }
  if (filters.acceptsOffers) {
    params.acceptsOffers = true;
  }
  return params;
}
