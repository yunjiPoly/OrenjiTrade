import type { FreshnessState } from '@/src/api/types';

import { boundedQuery } from './catalog';

/** `binder` filter value listing the cards that are in no binder (`?unfiled=true`). */
export const UNFILED = 'unfiled';

/**
 * Sorts of the Inventory's "Filter and sort" sheet (owner spec 2026-10-14, section 6, screen 2):
 * Recently added (creation, newest first), Name (A–Z), Price (highest first; prices that are not a
 * plain amount, like "85% TCG", come after every amount, then the cards without a price).
 */
export type InventorySort = 'created' | 'name' | 'price';

export const INVENTORY_SORTS: readonly InventorySort[] = ['created', 'name', 'price'];

export const INVENTORY_PAGE_SIZE = 24;

/** "Who can see it" of the sheet: everything, the public cards or the private ones. */
export type VisibilityFilter = 'PUBLIC' | 'PRIVATE';

/** The Inventory tab's view of `GET /inventory/items`. */
export interface InventoryFilters {
  q: string;
  game: string | null;
  /** Binder id, {@link UNFILED}, or `null` for every card. */
  binder: string | null;
  visibility: VisibilityFilter | null;
  /** Only stale or hidden cards (not in the sheet; the "needs a confirmation" notice). */
  freshness: FreshnessState | null;
  sort: InventorySort;
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  q: '',
  game: null,
  binder: null,
  visibility: null,
  freshness: null,
  sort: 'created',
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
    visibility?: VisibilityFilter;
    freshness?: FreshnessState;
    sort: InventorySort;
    page: number;
    size: number;
  } = { sort: filters.sort, page, size };
  const q = boundedQuery(filters.q);
  if (q) {
    query.query = q;
  }
  if (filters.game) {
    query.game = filters.game;
  }
  if (filters.visibility) {
    query.visibility = filters.visibility;
  }
  if (filters.freshness) {
    query.freshness = filters.freshness;
  }
  if (filters.binder === UNFILED) {
    query.unfiled = true;
  } else if (filters.binder) {
    query.binderId = filters.binder;
  }
  return query;
}

/** How many filters of the sheet are on (game, binder, who can see it; the sort is no filter). */
export function activeInventoryFilterCount(filters: InventoryFilters): number {
  return [filters.game, filters.binder, filters.visibility, filters.freshness].filter(Boolean)
    .length;
}

/** True when the list is narrowed in any way (search or filters). */
export function isFiltered(filters: InventoryFilters): boolean {
  return !!boundedQuery(filters.q) || activeInventoryFilterCount(filters) > 0;
}

/** The sheet's "Clear all": every filter off, the search kept, the sort back to its default. */
export function clearedFilters(filters: InventoryFilters): InventoryFilters {
  return { ...DEFAULT_INVENTORY_FILTERS, q: filters.q };
}
