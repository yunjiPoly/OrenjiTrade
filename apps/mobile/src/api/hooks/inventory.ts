import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { inventoryListQuery, type InventoryFilters } from '@/src/lib/inventoryFilters';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  BulkInventoryRequest,
  BulkInventoryResponse,
  CreateInventoryItemRequest,
  InventoryItemResponse,
  InventoryPage,
  InventorySummaryResponse,
  ListingStatus,
  UpdateInventoryItemRequest,
} from '../types';
import { nextPage } from './catalog';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * Inventory writes change counts everywhere (summary, binder item counts, binder freshness), so
 * every write refreshes the caller's inventory and binders (mirror of the web store's `refresh`).
 */
export async function refreshInventory(
  queryClient: QueryClient,
  uid: string | null,
  options: { deletedItemId?: string } = {}
) {
  const deleted = options.deletedItemId
    ? JSON.stringify(meKeys.inventoryItem(uid, options.deletedItemId))
    : null;
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: meKeys.inventory(uid),
      // A deleted item is not refetched (it would answer 404 while its screen closes).
      predicate: (query) => JSON.stringify(query.queryKey) !== deleted,
    }),
    queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) }),
  ]);
}

/** `GET /api/v1/inventory/items`: the caller's items for `filters`, paged for an infinite list. */
export function useInventoryItems(filters: InventoryFilters, enabled = true) {
  const uid = useUid();
  return useInfiniteQuery<InventoryPage, ApiError>({
    queryKey: meKeys.inventoryItems(uid, filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/inventory/items', {
            params: { query: inventoryListQuery(filters, pageParam as number) },
          })
        ).data
      ),
    getNextPageParam: (last) => nextPage(last),
    placeholderData: keepPreviousData,
    enabled: useIsAuthenticated() && enabled,
  });
}

/** `GET /api/v1/inventory/items/{id}`: one item of the caller (404 for anyone else's). */
export function useInventoryItem(id: string | null | undefined) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useQuery<InventoryItemResponse, ApiError>({
    queryKey: meKeys.inventoryItem(uid, id ?? ''),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/inventory/items/{id}', { params: { path: { id: id ?? '' } } })).data
      ),
    enabled: useIsAuthenticated() && !!id,
    // Opened from a list: shown at once from the list's copy, refreshed in the background.
    placeholderData: () => findListedItem(queryClient, uid, id),
  });
}

/** The item as a cached inventory or binder list holds it (placeholder of the item screen). */
function findListedItem(
  queryClient: QueryClient,
  uid: string | null,
  id: string | null | undefined
): InventoryItemResponse | undefined {
  if (!id) {
    return undefined;
  }
  for (const key of [meKeys.inventory(uid), meKeys.binders(uid)]) {
    for (const [, data] of queryClient.getQueriesData<{ pages?: InventoryPage[] }>({
      queryKey: key,
    })) {
      const found = data?.pages?.flatMap((page) => page.items ?? []).find((item) => item.id === id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** `GET /api/v1/inventory/summary`: totals, visibility counts, cards needing confirmation. */
export function useInventorySummary() {
  const uid = useUid();
  return useQuery<InventorySummaryResponse, ApiError>({
    queryKey: meKeys.inventorySummary(uid),
    queryFn: async () => required((await api.GET('/api/v1/inventory/summary')).data),
    enabled: useIsAuthenticated(),
  });
}

/** `POST /api/v1/inventory/items` (cards start private unless the collector chooses otherwise). */
export function useCreateInventoryItem() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryItemResponse, ApiError, CreateInventoryItemRequest>({
    mutationFn: async (body) =>
      required((await api.POST('/api/v1/inventory/items', { body })).data),
    onSuccess: async () => refreshInventory(queryClient, uid),
  });
}

export interface UpdateItemInput {
  id: string;
  patch: UpdateInventoryItemRequest;
}

/** `PATCH /api/v1/inventory/items/{id}` with only the changed fields (absent = unchanged). */
export function useUpdateInventoryItem() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryItemResponse, ApiError, UpdateItemInput>({
    mutationFn: async ({ id, patch }) =>
      required(
        (await api.PATCH('/api/v1/inventory/items/{id}', { params: { path: { id } }, body: patch }))
          .data
      ),
    onSuccess: async (item) => {
      queryClient.setQueryData(meKeys.inventoryItem(uid, item.id), item);
      await refreshInventory(queryClient, uid);
    },
  });
}

/** `POST /api/v1/inventory/items/{id}/confirm`: "still available" (restores a stale/hidden card). */
export function useConfirmInventoryItem() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryItemResponse, ApiError, string>({
    mutationFn: async (id) =>
      required(
        (await api.POST('/api/v1/inventory/items/{id}/confirm', { params: { path: { id } } })).data
      ),
    onSuccess: async (item) => {
      queryClient.setQueryData(meKeys.inventoryItem(uid, item.id), item);
      await refreshInventory(queryClient, uid);
    },
  });
}

/** `DELETE /api/v1/inventory/items/{id}` (soft delete on the server; gone from every list). */
export function useDeleteInventoryItem() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await api.DELETE('/api/v1/inventory/items/{id}', { params: { path: { id } } });
    },
    onSuccess: async (_, id) => refreshInventory(queryClient, uid, { deletedItemId: id }),
  });
}

/** `POST /api/v1/inventory/items/bulk` (move to a binder, confirm, ...; one transaction). */
export function useBulkInventory() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<BulkInventoryResponse, ApiError, BulkInventoryRequest>({
    mutationFn: async (body) =>
      required((await api.POST('/api/v1/inventory/items/bulk', { body })).data),
    onSuccess: async () => refreshInventory(queryClient, uid),
  });
}

/** Cards confirmed at once by "Confirm all" (the bulk endpoint takes at most 500 ids). */
const CONFIRM_ALL_MAX = 500;
const CONFIRM_ALL_PAGE = 100;

/** Ids of every stale or hidden item (up to 500), for "Confirm all". */
export async function staleItemIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const freshness of ['STALE', 'HIDDEN'] as const) {
    for (let page = 0; ids.length < CONFIRM_ALL_MAX; page++) {
      const result = required(
        (
          await api.GET('/api/v1/inventory/items', {
            params: { query: { freshness, page, size: CONFIRM_ALL_PAGE } },
          })
        ).data
      );
      ids.push(...(result.items ?? []).map((item) => item.id));
      if (page + 1 >= (result.totalPages ?? 0)) {
        break;
      }
    }
  }
  return ids.slice(0, CONFIRM_ALL_MAX);
}

/** "Confirm all": confirms every stale or hidden item at once (web: `confirmAllStale`). */
export function useConfirmAllStale() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<BulkInventoryResponse, ApiError, void>({
    mutationFn: async () => {
      const itemIds = await staleItemIds();
      if (itemIds.length === 0) {
        return { updated: 0, skipped: [] };
      }
      return required(
        (await api.POST('/api/v1/inventory/items/bulk', { body: { action: 'CONFIRM', itemIds } }))
          .data
      );
    },
    onSuccess: async () => refreshInventory(queryClient, uid),
  });
}

/** `GET /api/v1/me/listings/status`: whether the public listings are paused, and strikes. */
export function useListingStatus() {
  const uid = useUid();
  return useQuery<ListingStatus, ApiError>({
    queryKey: meKeys.listingStatus(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/listings/status')).data),
    enabled: useIsAuthenticated(),
  });
}

/** `POST /api/v1/me/listings/resume`: the owner confirms they answer collectors again. */
export function useResumeListings() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ListingStatus, ApiError, void>({
    mutationFn: async () => required((await api.POST('/api/v1/me/listings/resume')).data),
    onSuccess: async (status) => {
      queryClient.setQueryData(meKeys.listingStatus(uid), status);
      await refreshInventory(queryClient, uid);
    },
  });
}
