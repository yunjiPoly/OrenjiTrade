import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { inventoryListQuery, type InventoryFilters } from '@/src/lib/inventoryFilters';

import { ApiError, isApiError } from '../ApiError';
import { api, required } from '../client';
import { imageFormData, type PickedImage } from '../imageFormData';
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

/**
 * How many of the caller's cards `filters` keep (`GET /inventory/items` with one card per page):
 * "Show {n} cards" of the filter sheet, while the collector changes the filters.
 */
export function useInventoryCount(filters: InventoryFilters, enabled = true) {
  const uid = useUid();
  return useQuery<number, ApiError>({
    queryKey: [...meKeys.inventory(uid), 'count', filters],
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/inventory/items', {
            params: { query: inventoryListQuery(filters, 0, 1) },
          })
        ).data
      ).totalItems ?? 0,
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

/**
 * `POST /api/v1/inventory/items/{id}/restore` ("Undo" of a delete, stage R2): brings back a card
 * deleted less than 10 minutes ago with everything it had (409 `RESTORE_WINDOW_CLOSED` after).
 * A plain function: the "Undo" of a toast runs after the screen that deleted the card has gone.
 */
export async function restoreInventoryItem(
  queryClient: QueryClient,
  uid: string | null,
  id: string
): Promise<InventoryItemResponse> {
  const item = required(
    (await api.POST('/api/v1/inventory/items/{id}/restore', { params: { path: { id } } })).data
  );
  queryClient.setQueryData(meKeys.inventoryItem(uid, item.id), item);
  await refreshInventory(queryClient, uid);
  return item;
}

/** Restores several cards (the "Undo" of a bulk delete); answers how many came back. */
export async function restoreInventoryItems(
  queryClient: QueryClient,
  uid: string | null,
  ids: readonly string[]
): Promise<number> {
  let restored = 0;
  let failure: unknown = null;
  for (const id of ids) {
    try {
      await api.POST('/api/v1/inventory/items/{id}/restore', { params: { path: { id } } });
      restored += 1;
    } catch (error) {
      failure = failure ?? error;
    }
  }
  await refreshInventory(queryClient, uid);
  if (restored === 0 && failure) {
    throw failure;
  }
  return restored;
}

export interface UploadItemPhotoInput {
  id: string;
  photo: PickedImage;
}

/**
 * `POST /api/v1/inventory/items/{id}/images` (multipart `file`: JPEG / PNG / WebP up to 8 MB,
 * re-encoded by the API without metadata; at most 4 per item, 409 beyond). Answers the item with
 * its photos.
 */
export function useUploadItemPhoto() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryItemResponse, ApiError, UploadItemPhotoInput>({
    mutationFn: async ({ id, photo }) => {
      const body = await imageFormData(photo, 'card');
      return required(
        (
          await api.POST('/api/v1/inventory/items/{id}/images', {
            params: { path: { id } },
            // The contract types the multipart body as `{ file: binary }`; the FormData is sent as is.
            body: body as unknown as { file: string },
            bodySerializer: () => body,
          })
        ).data
      );
    },
    onSuccess: async (item) => {
      queryClient.setQueryData(meKeys.inventoryItem(uid, item.id), item);
      await refreshInventory(queryClient, uid);
    },
  });
}

export interface PhotoChangesInput {
  id: string;
  /** Photos to upload, in order. */
  add: readonly (PickedImage & { key: string })[];
  /** Photos of the card to delete. */
  remove: readonly string[];
}

export interface PhotoChangesResult {
  /** The keys of the photos that could not be uploaded (the card is kept: "Try again"). */
  failed: string[];
  /**
   * Why each of them failed, by key: the API's refusal of the photo itself (400, 409, 413, 415:
   * trying again cannot work) or a network or server error.
   */
  errors: Record<string, ApiError>;
  /** The photos that could not be deleted. */
  notRemoved: string[];
}

/**
 * The photo changes of a card, made after the card itself was saved (stage R2: photos while
 * adding, and with "Save changes"): deletes, then uploads one after the other (`POST
 * .../images`: JPEG / PNG / WebP up to 8 MB, re-encoded without metadata). A photo that fails does
 * not stop the others; the card stays as saved.
 */
export function useApplyPhotoChanges() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<PhotoChangesResult, ApiError, PhotoChangesInput>({
    mutationFn: async ({ id, add, remove }) => {
      const notRemoved: string[] = [];
      for (const imageId of remove) {
        try {
          await api.DELETE('/api/v1/inventory/items/{id}/images/{imageId}', {
            params: { path: { id, imageId } },
          });
        } catch (error) {
          // Already gone is what was wanted.
          if ((error as ApiError).status !== 404) {
            notRemoved.push(imageId);
          }
        }
      }
      const failed: string[] = [];
      const errors: Record<string, ApiError> = {};
      for (const photo of add) {
        try {
          const body = await imageFormData(photo, 'card');
          await api.POST('/api/v1/inventory/items/{id}/images', {
            params: { path: { id } },
            body: body as unknown as { file: string },
            bodySerializer: () => body,
          });
        } catch (error) {
          failed.push(photo.key);
          // A photo the phone could not even read is no answer of the server: as a network error.
          errors[photo.key] = isApiError(error) ? error : ApiError.network(error);
        }
      }
      return { failed, errors, notRemoved };
    },
    onSettled: async () => refreshInventory(queryClient, uid),
  });
}

export interface DeleteItemPhotoInput {
  id: string;
  imageId: string;
}

/** `DELETE /api/v1/inventory/items/{id}/images/{imageId}`: removes one owner photo. */
export function useDeleteItemPhoto() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, DeleteItemPhotoInput>({
    mutationFn: async ({ id, imageId }) => {
      await api.DELETE('/api/v1/inventory/items/{id}/images/{imageId}', {
        params: { path: { id, imageId } },
      });
    },
    onSuccess: async (_, { id, imageId }) => {
      queryClient.setQueryData<InventoryItemResponse | undefined>(
        meKeys.inventoryItem(uid, id),
        (item) =>
          item ? { ...item, images: item.images.filter((image) => image.id !== imageId) } : item
      );
      await refreshInventory(queryClient, uid);
    },
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
