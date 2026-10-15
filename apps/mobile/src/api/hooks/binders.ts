import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { boundedQuery } from '@/src/lib/catalog';

import { ApiError, isApiError } from '../ApiError';
import { api, required } from '../client';
import { imageFormData, type PickedImage } from '../imageFormData';
import { meKeys, publicKeys } from '../queryKeys';
import type {
  BinderResponse,
  CreateBinderRequest,
  InventoryAvailability,
  InventoryPage,
  PublicBinderResponse,
  PublicInventoryPage,
  PublishMode,
  UpdateBinderRequest,
} from '../types';
import { nextPage } from './catalog';
import { refreshInventory } from './inventory';
import { useIsAuthenticated, useUid } from './useUid';

export const BINDER_ITEMS_PAGE_SIZE = 24;

/** `GET /api/v1/binders`: the caller's binders in their order. */
export function useMyBinders() {
  const uid = useUid();
  return useQuery<BinderResponse[], ApiError>({
    queryKey: meKeys.binderList(uid),
    queryFn: async () => required((await api.GET('/api/v1/binders')).data),
    enabled: useIsAuthenticated(),
  });
}

/** `GET /api/v1/binders/{id}`: one of the caller's binders (404 for anyone else's). */
export function useBinder(id: string | null | undefined, enabled = true) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useQuery<BinderResponse, ApiError>({
    queryKey: meKeys.binder(uid, id ?? ''),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/binders/{id}', { params: { path: { id: id ?? '' } } })).data
      ),
    enabled: useIsAuthenticated() && !!id && enabled,
    // The binder list usually already holds it: render at once, refresh in the background.
    placeholderData: () =>
      queryClient
        .getQueryData<BinderResponse[]>(meKeys.binderList(uid))
        ?.find((binder) => binder.id === id),
  });
}

/** `GET /api/v1/binders/{id}/items`: the cards of one of the caller's binders, paged. */
export function useBinderItems(id: string, q = '', enabled = true) {
  const uid = useUid();
  const query = boundedQuery(q);
  return useInfiniteQuery<InventoryPage, ApiError>({
    queryKey: meKeys.binderItems(uid, id, { q: query }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/binders/{id}/items', {
            params: {
              path: { id },
              query: {
                query: query || undefined,
                page: pageParam as number,
                size: BINDER_ITEMS_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => nextPage(last),
    placeholderData: keepPreviousData,
    enabled: useIsAuthenticated() && enabled,
  });
}

/** `POST /api/v1/binders` (new binders are private; `binders.max` answers 429 LIMIT_REACHED). */
export function useCreateBinder() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<BinderResponse, ApiError, CreateBinderRequest>({
    mutationFn: async (body) => required((await api.POST('/api/v1/binders', { body })).data),
    onSuccess: async (binder) => {
      queryClient.setQueryData<BinderResponse[]>(meKeys.binderList(uid), (binders) =>
        binders ? [...binders, binder] : binders
      );
      await queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) });
    },
  });
}

/**
 * Writes answering the updated binder: it replaces the cached one, then everything refreshes, its
 * public page too (the deck core page an owner opened from Edit binder shows the new price).
 */
function useBinderWrite<TInput>(
  request: (input: TInput) => Promise<BinderResponse>,
  refreshItems: boolean
) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<BinderResponse, ApiError, TInput>({
    mutationFn: request,
    onSuccess: async (binder) => {
      queryClient.setQueryData(meKeys.binder(uid, binder.id), binder);
      queryClient.setQueryData<BinderResponse[]>(meKeys.binderList(uid), (binders) =>
        binders?.map((candidate) => (candidate.id === binder.id ? binder : candidate))
      );
      await Promise.all([
        // Publishing confirms the binder and its items; visibility changes their effective state.
        refreshItems
          ? refreshInventory(queryClient, uid)
          : queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) }),
        queryClient.invalidateQueries({ queryKey: publicKeys.publicBinderAll(binder.id) }),
      ]);
    },
  });
}

export interface UpdateBinderInput {
  id: string;
  patch: UpdateBinderRequest;
}

/**
 * `PATCH /api/v1/binders/{id}`: name, visibility, "Sell as a deck core", the price, the note
 * (absent fields unchanged; `confirm` also confirms the binder and its cards).
 */
export function useUpdateBinder() {
  return useBinderWrite<UpdateBinderInput>(
    async ({ id, patch }) =>
      required(
        (await api.PATCH('/api/v1/binders/{id}', { params: { path: { id } }, body: patch })).data
      ),
    false
  );
}

export interface PublishBinderInput {
  id: string;
  mode: PublishMode;
}

/** `POST /api/v1/binders/{id}/publish` (1 hour, 24 hours or until disabled). */
export function usePublishBinder() {
  return useBinderWrite<PublishBinderInput>(
    async ({ id, mode }) =>
      required(
        (
          await api.POST('/api/v1/binders/{id}/publish', {
            params: { path: { id } },
            body: { mode },
          })
        ).data
      ),
    true
  );
}

/** `POST /api/v1/binders/{id}/unpublish`: private again. */
export function useUnpublishBinder() {
  return useBinderWrite<string>(
    async (id) =>
      required(
        (await api.POST('/api/v1/binders/{id}/unpublish', { params: { path: { id } } })).data
      ),
    true
  );
}

/** `POST /api/v1/binders/{id}/confirm`: the binder and its cards are still up to date. */
export function useConfirmBinder() {
  return useBinderWrite<string>(
    async (id) =>
      required((await api.POST('/api/v1/binders/{id}/confirm', { params: { path: { id } } })).data),
    true
  );
}

/** `DELETE /api/v1/binders/{id}`: its cards stay in the inventory, unfiled. */
export function useDeleteBinder() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await api.DELETE('/api/v1/binders/{id}', {
        params: { path: { id }, query: { deleteItems: false } },
      });
    },
    onSuccess: async (_, id) => {
      queryClient.setQueryData<BinderResponse[]>(meKeys.binderList(uid), (binders) =>
        binders?.filter((binder) => binder.id !== id)
      );
      // Its public page is gone too: no screen shows it from the cache again.
      queryClient.removeQueries({ queryKey: publicKeys.publicBinderAll(id) });
      // The deleted binder's own queries are not refetched (404 while its screen closes).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.inventory(uid) }),
        queryClient.invalidateQueries({
          queryKey: meKeys.binders(uid),
          predicate: (query) => !query.queryKey.includes(id),
        }),
      ]);
    },
  });
}

/**
 * `GET /api/v1/public/binders/{id}`: a public binder with its owner (a region label and a
 * state or province only). Signed-in reads carry the token (the API counts
 * `binder.views.per_day`); 404 when it is not public.
 */
export function usePublicBinder(id: string | null | undefined, enabled = true) {
  const uid = useUid();
  return useQuery<PublicBinderResponse, ApiError>({
    queryKey: publicKeys.publicBinder(id ?? '', uid),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/public/binders/{id}', { params: { path: { id: id ?? '' } } })).data
      ),
    enabled: !!id && enabled,
  });
}

export interface PublicBinderFilters {
  q: string;
  availability: InventoryAvailability | null;
  game: string | null;
}

/** `GET /api/v1/public/binders/{id}/items`: the public cards of a public binder, paged. */
export function usePublicBinderItems(id: string, filters: PublicBinderFilters, enabled = true) {
  const uid = useUid();
  const normalized = { ...filters, q: boundedQuery(filters.q) };
  return useInfiniteQuery<PublicInventoryPage, ApiError>({
    queryKey: publicKeys.publicBinderItems(id, uid, normalized),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/public/binders/{id}/items', {
            params: {
              path: { id },
              query: {
                query: normalized.q || undefined,
                availability: normalized.availability ?? undefined,
                game: normalized.game ?? undefined,
                page: pageParam as number,
                size: BINDER_ITEMS_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => nextPage(last),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export interface BinderPhotoChangesInput {
  id: string;
  /** Photos to upload, in order. */
  add: readonly (PickedImage & { key: string })[];
  /** Photos of the binder to delete. */
  remove: readonly string[];
}

export interface BinderPhotoChangesResult {
  /** The keys of the photos that could not be uploaded (the binder is kept: "Try again"). */
  failed: string[];
  /** Why each of them failed, by key (the API's refusal of the photo, or a network error). */
  errors: Record<string, ApiError>;
  /** The photos that could not be deleted. */
  notRemoved: string[];
}

/**
 * The photos of a deck core (stage R3), with "Save changes": `DELETE /binders/{id}/images/{imageId}`
 * for the ones taken away, then `POST /binders/{id}/images` for each new one, in order (the API
 * keeps at most 4, re-encoded without location data). A photo that fails does not stop the others.
 */
export function useApplyBinderPhotoChanges() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<BinderPhotoChangesResult, ApiError, BinderPhotoChangesInput>({
    mutationFn: async ({ id, add, remove }) => {
      const notRemoved: string[] = [];
      for (const imageId of remove) {
        try {
          await api.DELETE('/api/v1/binders/{id}/images/{imageId}', {
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
          const body = await imageFormData(photo, 'binder');
          await api.POST('/api/v1/binders/{id}/images', {
            params: { path: { id } },
            body: body as unknown as { file: string },
            bodySerializer: () => body,
          });
        } catch (error) {
          failed.push(photo.key);
          errors[photo.key] = isApiError(error) ? error : ApiError.network(error);
        }
      }
      return { failed, errors, notRemoved };
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) }),
        queryClient.invalidateQueries({ queryKey: publicKeys.publicBinders }),
      ]);
    },
  });
}

/**
 * `PUT /api/v1/binders/reorder` (the web's binder manager): the listed binders come first in the
 * given order; answers every binder in the new order, which replaces the cached list.
 */
export function useReorderBinders() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<BinderResponse[], ApiError, string[]>({
    mutationFn: async (binderIds) =>
      required((await api.PUT('/api/v1/binders/reorder', { body: { binderIds } })).data),
    onSuccess: async (binders) => {
      queryClient.setQueryData(meKeys.binderList(uid), binders);
      await queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) });
    },
  });
}
