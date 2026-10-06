import type { operations } from '@orenji/shared-types';

import { INTENT_FILTERS, isIntentFilter, type IntentFilter } from '@/src/features/map/discovery';

/**
 * Filters of the card-holders view (mirror of the web's `features/search/data/search-params.ts`:
 * `HolderFilters`, `cardHoldersRequest`, `activeHolderFilterCount`, `priceRangeError`). The
 * request never carries the viewer's position: either nothing (the server uses their trading
 * area) or a public city centre.
 */

export type HoldersTarget = { kind: 'card' | 'printing'; id: string };

export type HolderSort = 'distance' | 'price' | 'freshness';
export const HOLDER_SORTS: readonly { value: HolderSort; label: string }[] = [
  { value: 'distance', label: 'Closest first' },
  { value: 'price', label: 'Lowest price' },
  { value: 'freshness', label: 'Freshest listings' },
];

export function isHolderSort(value: unknown): value is HolderSort {
  return HOLDER_SORTS.some((option) => option.value === value);
}

/** The availability filter of `/search/card-holders` is the map's intent filter. */
export const AVAILABILITY_FILTERS = INTENT_FILTERS;
export type AvailabilityFilter = IntentFilter;
export const isAvailabilityFilter = isIntentFilter;

/** `freshness` filter: STALE and HIDDEN listings never appear (the web's `FRESHNESS_FILTERS`). */
export type FreshnessFilter = 'ACTIVE' | 'AGING';
export const FRESHNESS_FILTERS: readonly { value: FreshnessFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Fresh listings' },
  { value: 'AGING', label: 'Aging listings' },
];

export function isFreshnessFilter(value: unknown): value is FreshnessFilter {
  return value === 'ACTIVE' || value === 'AGING';
}

/** Asking prices accepted by the filters (the API stores `NUMERIC(12,2)`). */
export const MAX_PRICE = 100_000;
export const HOLDERS_PAGE_SIZE = 20;

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
}

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
};

/** A price typed in a field: 2 decimals within [0, MAX_PRICE]; `null` when empty or invalid. */
export function parsePrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(number) || number < 0 || number > MAX_PRICE) {
    return null;
  }
  return Math.round(number * 100) / 100;
}

/** Inline validation of one price field; `null` when valid or empty. */
export function priceFieldError(value: string): string | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  return parsePrice(text) === null ? `Enter 0 to ${MAX_PRICE}.` : null;
}

/** Inline validation of a price range; `null` when valid. */
export function priceRangeError(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null && min > max) {
    return 'The minimum price must not be above the maximum.';
  }
  return null;
}

/** Number of narrowing filters (the sort excluded). */
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

export type CardHoldersQuery = NonNullable<operations['searchCardHolders']['parameters']['query']>;

/** Query parameters of one page of holders (filters left out when unset). */
export function cardHoldersQuery(
  target: HoldersTarget,
  filters: HolderFilters,
  centre: { lat?: number; lng?: number }
): Omit<CardHoldersQuery, 'page' | 'size'> {
  const query: Omit<CardHoldersQuery, 'page' | 'size'> = { sort: filters.sort };
  if (target.kind === 'printing') {
    query.printingId = target.id;
  } else {
    query.cardId = target.id;
  }
  if (centre.lat !== undefined && centre.lng !== undefined) {
    query.lat = centre.lat;
    query.lng = centre.lng;
  }
  if (filters.availability) {
    query.availability = filters.availability;
  }
  if (filters.condition) {
    query.condition = filters.condition;
  }
  if (filters.minPrice !== null) {
    query.minPrice = filters.minPrice;
  }
  if (filters.maxPrice !== null) {
    query.maxPrice = filters.maxPrice;
  }
  if (filters.freshness) {
    query.freshness = filters.freshness;
  }
  if (filters.edition) {
    query.edition = filters.edition;
  }
  if (filters.language) {
    query.language = filters.language;
  }
  if (filters.acceptsOffers) {
    query.acceptsOffers = true;
  }
  return query;
}

/** "3 listings near you" / "Looking for holders…". */
export function holdersCountLabel(total: number | null): string {
  if (total === null) {
    return 'Looking for holders…';
  }
  return `${total} ${total === 1 ? 'listing' : 'listings'} near you`;
}

/** Fallback conditions when the card's game schema is unknown (the web's list). */
export const FALLBACK_CONDITIONS: readonly string[] = [
  'MINT',
  'NEAR_MINT',
  'LIGHTLY_PLAYED',
  'MODERATELY_PLAYED',
  'HEAVILY_PLAYED',
  'DAMAGED',
];
