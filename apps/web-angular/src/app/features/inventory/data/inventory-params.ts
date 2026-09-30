import type { ListInventoryItemsRequestParams } from '@orenji/api-client';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import {
  API_FRESHNESS_STATES,
  ApiFreshnessState,
  InventoryAvailability,
  Visibility,
  isInventoryAvailability,
  isVisibility,
} from '../../../shared/inventory/inventory-labels';

/** `?binder=unfiled` lists the items that are in no binder. */
export const UNFILED = 'unfiled';

export type InventorySort = 'updated' | 'name' | 'price' | 'price-asc';
export type InventoryView = 'grid' | 'table';

export const INVENTORY_SORTS: readonly { value: InventorySort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price', label: 'Price (high to low)' },
  { value: 'price-asc', label: 'Price (low to high)' },
];

export const INVENTORY_PAGE_SIZES: readonly number[] = [24, 48, 96];
export const DEFAULT_INVENTORY_PAGE_SIZE = 24;

/**
 * State of `/inventory`, mirrored in the URL
 * (`?binder=&q=&game=&visibility=&availability=&condition=&freshness=&sort=&view=&page=&size=`)
 * so a filtered view can be reloaded, bookmarked and navigated with back/forward.
 */
export interface InventoryParams {
  /** Binder id, {@link UNFILED}, or `null` for every card. */
  binder: string | null;
  q: string;
  game: string | null;
  visibility: Visibility | null;
  availability: InventoryAvailability | null;
  condition: string | null;
  freshness: ApiFreshnessState | null;
  sort: InventorySort;
  view: InventoryView;
  page: number;
  size: number;
}

export type RawInventoryParams = Partial<Record<keyof InventoryParams, string | null | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CONDITION = /^[A-Z][A-Z_]{0,31}$/;

function nonNegativeInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Parses (and bounds, like the API's validation) the query parameters of `/inventory`. */
export function parseInventoryParams(raw: RawInventoryParams): InventoryParams {
  const binder = (raw.binder ?? '').trim();
  const game = (raw.game ?? '').trim().toLowerCase();
  const condition = (raw.condition ?? '').trim().toUpperCase();
  const freshness = (raw.freshness ?? '').trim().toUpperCase();
  const sort = INVENTORY_SORTS.find((option) => option.value === raw.sort)?.value ?? 'updated';
  const size = nonNegativeInt(raw.size, DEFAULT_INVENTORY_PAGE_SIZE);
  return {
    binder: binder === UNFILED || UUID.test(binder) ? binder.toLowerCase() : null,
    q: (raw.q ?? '').trim().slice(0, QUERY_MAX_LENGTH),
    game: SLUG.test(game) ? game : null,
    visibility: isVisibility(raw.visibility) ? raw.visibility : null,
    availability: isInventoryAvailability(raw.availability) ? raw.availability : null,
    condition: CONDITION.test(condition) ? condition : null,
    freshness: (API_FRESHNESS_STATES as readonly string[]).includes(freshness)
      ? (freshness as ApiFreshnessState)
      : null,
    sort,
    view: raw.view === 'table' ? 'table' : 'grid',
    page: Math.min(nonNegativeInt(raw.page, 0), 10_000),
    size: INVENTORY_PAGE_SIZES.includes(size) ? size : DEFAULT_INVENTORY_PAGE_SIZE,
  };
}

/** Request of the generated `InventoryService.listInventoryItems`. */
export function toListRequest(params: InventoryParams): ListInventoryItemsRequestParams {
  const request: ListInventoryItemsRequestParams = {
    query: params.q || undefined,
    game: params.game ?? undefined,
    visibility: params.visibility ?? undefined,
    availability: params.availability ?? undefined,
    condition: params.condition ?? undefined,
    freshness: params.freshness ?? undefined,
    sort: params.sort === 'price-asc' ? 'price' : params.sort,
    direction: params.sort === 'price-asc' ? 'asc' : undefined,
    page: params.page,
    size: params.size,
  };
  if (params.binder === UNFILED) {
    request.unfiled = true;
  } else if (params.binder) {
    request.binderId = params.binder;
  }
  return request;
}

/** How many of the filters (not the binder, search, sort or view) are set. */
export function activeFilterCount(params: InventoryParams): number {
  return [
    params.game,
    params.visibility,
    params.availability,
    params.condition,
    params.freshness,
  ].filter(Boolean).length;
}

/** Query parameters that clear every filter and the search (binder, sort and view stay). */
export const CLEARED_FILTERS: Readonly<Record<string, null>> = {
  q: null,
  game: null,
  visibility: null,
  availability: null,
  condition: null,
  freshness: null,
  page: null,
};
