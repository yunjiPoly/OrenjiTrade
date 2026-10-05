import type { FreshnessState, InventoryAvailability } from '@/src/api/types';

import { boundedQuery } from './catalog';

/** `binder` filter value listing the cards that are in no binder (`?unfiled=true`). */
export const UNFILED = 'unfiled';

export type InventorySort = 'updated' | 'name' | 'price' | 'price-asc';

export const INVENTORY_SORTS: readonly { value: InventorySort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price', label: 'Price (high to low)' },
  { value: 'price-asc', label: 'Price (low to high)' },
];

export const INVENTORY_PAGE_SIZE = 24;

/** The Inventory tab's view of `GET /inventory/items` (mirror of the web's `InventoryParams`). */
export interface InventoryFilters {
  q: string;
  game: string | null;
  /** The intent (trade / sale / ...): the API's `availability`. */
  availability: InventoryAvailability | null;
  /** Binder id, {@link UNFILED}, or `null` for every card. */
  binder: string | null;
  freshness: FreshnessState | null;
  sort: InventorySort;
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  q: '',
  game: null,
  availability: null,
  binder: null,
  freshness: null,
  sort: 'updated',
};

/** Query parameters of `GET /inventory/items` for a page of `filters`. */
export function inventoryListQuery(
  filters: InventoryFilters,
  page: number,
  size = INVENTORY_PAGE_SIZE
) {
  const query: {
    query?: string;
    game?: string;
    binderId?: string;
    unfiled?: boolean;
    availability?: InventoryAvailability;
    freshness?: FreshnessState;
    sort: 'updated' | 'name' | 'price';
    direction?: 'asc' | 'desc';
    page: number;
    size: number;
  } = {
    sort: filters.sort === 'price-asc' ? 'price' : filters.sort,
    page,
    size,
  };
  const q = boundedQuery(filters.q);
  if (q) {
    query.query = q;
  }
  if (filters.game) {
    query.game = filters.game;
  }
  if (filters.availability) {
    query.availability = filters.availability;
  }
  if (filters.freshness) {
    query.freshness = filters.freshness;
  }
  if (filters.sort === 'price-asc') {
    query.direction = 'asc';
  }
  if (filters.binder === UNFILED) {
    query.unfiled = true;
  } else if (filters.binder) {
    query.binderId = filters.binder;
  }
  return query;
}

/** How many filters (not the search, binder or sort) are set. */
export function activeInventoryFilterCount(filters: InventoryFilters): number {
  return [filters.game, filters.availability, filters.freshness].filter(Boolean).length;
}

/** True when the list is narrowed in any way (search, filters or a binder). */
export function isFiltered(filters: InventoryFilters): boolean {
  return !!boundedQuery(filters.q) || !!filters.binder || activeInventoryFilterCount(filters) > 0;
}
