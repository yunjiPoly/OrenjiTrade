import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { boundedQuery } from '@/src/lib/catalog';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
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

/** Writes answering the updated binder: it replaces the cached one, then everything refreshes. */
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
      if (refreshItems) {
        // Publishing confirms the binder and its items; visibility changes their effective state.
        await refreshInventory(queryClient, uid);
      } else {
        await queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) });
      }
    },
  });
}

export interface UpdateBinderInput {
  id: string;
  patch: UpdateBinderRequest;
}

/** `PATCH /api/v1/binders/{id}`: rename, kind, description (absent fields unchanged). */
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
 * distance bucket only, never a point). Signed-in reads carry the token (the API counts
 * `binder.views.per_day` and adds the distance bucket); 404 when it is not public.
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
