import type { ListInventoryItemsRequestParams } from '@orenji/api-client';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import {
  API_FRESHNESS_STATES,
  ApiFreshnessState,
} from '../../../shared/inventory/inventory-labels';

/** `?binder=unfiled` lists the items that are in no binder. */
export const UNFILED = 'unfiled';

export type InventoryTab = 'cards' | 'binders';
export type InventorySort = 'created' | 'name' | 'price';
export type SortDirection = 'asc' | 'desc';
export type InventoryView = 'table' | 'grid';
/** The toolbar's [All | Public | Private] (Public is every card set to public). */
export type VisibilityFilter = 'PUBLIC' | 'PRIVATE';

export const INVENTORY_SORTS: readonly { value: InventorySort; label: string }[] = [
  { value: 'created', label: 'Recently added' },
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
];

/** The direction each sort starts in: newest first, A to Z, highest price first. */
export const DEFAULT_DIRECTION: Readonly<Record<InventorySort, SortDirection>> = {
  created: 'desc',
  name: 'asc',
  price: 'desc',
};

/** Rows per load (spec 9.4: 100, then "Load more"; the API's largest page). */
export const INVENTORY_PAGE_SIZE = 100;

/**
 * State of `/inventory` (spec 4.11), mirrored in the URL
 * (`?tab=&binder=&q=&game=&visibility=&freshness=&sort=&dir=&view=&item=`) so a view can be
 * reloaded, bookmarked and navigated with back and forward. The table and grid choice is also
 * remembered in this browser (spec 9.3).
 */
export interface InventoryParams {
  tab: InventoryTab;
  /** Binder id, {@link UNFILED}, or `null` for every card. */
  binder: string | null;
  q: string;
  game: string | null;
  visibility: VisibilityFilter | null;
  /** "Show them" of the freshness banner. */
  freshness: ApiFreshnessState | null;
  sort: InventorySort;
  dir: SortDirection;
  /** `null`: the view remembered in this browser (table by default). */
  view: InventoryView | null;
  /** The card open in the Edit drawer. */
  item: string | null;
}

export type RawInventoryParams = Partial<Record<keyof InventoryParams, string | null | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Parses (and bounds, like the API's validation) the query parameters of `/inventory`. */
export function parseInventoryParams(raw: RawInventoryParams): InventoryParams {
  const binder = (raw.binder ?? '').trim();
  const game = (raw.game ?? '').trim().toLowerCase();
  const freshness = (raw.freshness ?? '').trim().toUpperCase();
  const visibility = (raw.visibility ?? '').trim().toUpperCase();
  // Old links: `sort=updated` (now Recently added) and `sort=price-asc`.
  const rawSort =
    raw.sort === 'price-asc' ? 'price' : raw.sort === 'updated' ? 'created' : raw.sort;
  const sort = INVENTORY_SORTS.find((option) => option.value === rawSort)?.value ?? 'created';
  const dir: SortDirection =
    raw.dir === 'asc' || raw.dir === 'desc'
      ? raw.dir
      : raw.sort === 'price-asc'
        ? 'asc'
        : DEFAULT_DIRECTION[sort];
  const item = (raw.item ?? '').trim();
  return {
    tab: raw.tab === 'binders' ? 'binders' : 'cards',
    binder: binder === UNFILED || UUID.test(binder) ? binder.toLowerCase() : null,
    q: (raw.q ?? '').trim().slice(0, QUERY_MAX_LENGTH),
    game: SLUG.test(game) ? game : null,
    visibility:
      visibility === 'PRIVATE'
        ? 'PRIVATE'
        : visibility === 'PUBLIC' || visibility === 'TEMPORARILY_PUBLIC'
          ? 'PUBLIC'
          : null,
    freshness: (API_FRESHNESS_STATES as readonly string[]).includes(freshness)
      ? (freshness as ApiFreshnessState)
      : null,
    sort,
    dir,
    view: raw.view === 'grid' ? 'grid' : raw.view === 'table' ? 'table' : null,
    item: UUID.test(item) ? item.toLowerCase() : null,
  };
}

/** Request of the generated `InventoryService.listInventoryItems` for one load. */
export function toListRequest(
  params: InventoryParams,
  page = 0,
  size = INVENTORY_PAGE_SIZE,
): ListInventoryItemsRequestParams {
  const request: ListInventoryItemsRequestParams = {
    query: params.q || undefined,
    game: params.game ?? undefined,
    freshness: params.freshness ?? undefined,
    sort: params.sort,
    direction: params.dir,
    page,
    size,
  };
  if (params.visibility === 'PRIVATE') {
    request.visibility = 'PRIVATE';
  } else if (params.visibility === 'PUBLIC') {
    request.markedPublic = true;
  }
  if (params.binder === UNFILED) {
    request.unfiled = true;
  } else if (params.binder) {
    request.binderId = params.binder;
  }
  return request;
}

/** The part of the params that decides which cards are listed (not the view or the drawer). */
export function listKey(params: InventoryParams): string {
  const { binder, q, game, visibility, freshness, sort, dir } = params;
  return JSON.stringify({ binder, q, game, visibility, freshness, sort, dir });
}

/** Whether anything differs from the defaults ("Clear filters", spec 9.3). */
export function hasActiveFilters(params: InventoryParams): boolean {
  return (
    !!params.q ||
    !!params.game ||
    !!params.visibility ||
    !!params.freshness ||
    params.sort !== 'created' ||
    params.dir !== DEFAULT_DIRECTION.created
  );
}

/** Query parameters that clear the search, the filters and the sort (binder and view stay). */
export const CLEARED_FILTERS: Readonly<Record<string, null>> = {
  q: null,
  game: null,
  visibility: null,
  freshness: null,
  sort: null,
  dir: null,
};

const VIEW_KEY = 'orenji.inventory.view';

/** The table or grid choice of this browser (table by default). */
export function rememberedView(): InventoryView {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

export function rememberView(view: InventoryView): void {
  try {
    globalThis.localStorage?.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked: the URL still carries the view.
  }
}
