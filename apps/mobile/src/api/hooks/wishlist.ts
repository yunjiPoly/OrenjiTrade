import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  CreateWishlistItemRequest,
  UpdateWishlistItemRequest,
  WishlistItemResponse,
  WishlistMatchPage,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** Matches per page of `GET /wishlist/{id}/matches`. */
export const MATCHES_PAGE = 10;

type MatchesData = InfiniteData<WishlistMatchPage>;

/**
 * `GET /api/v1/wishlist`: the caller's wishes, newest first, with their match counts. A pushed
 * WISHLIST_MATCH notification and every realtime reconnection re-read it (live match counts).
 */
export function useWishlist() {
  const uid = useUid();
  return useQuery<WishlistItemResponse[], ApiError>({
    queryKey: meKeys.wishlistItems(uid),
    queryFn: async () => required((await api.GET('/api/v1/wishlist')).data),
    enabled: useIsAuthenticated(),
    staleTime: 30_000,
  });
}

function useWishWrite<V>(write: (variables: V) => Promise<WishlistItemResponse>) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<WishlistItemResponse, ApiError, V>({
    mutationFn: write,
    onSuccess: (saved) => {
      queryClient.setQueryData<WishlistItemResponse[]>(meKeys.wishlistItems(uid), (items) => {
        if (!items) {
          return items;
        }
        return items.some((item) => item.id === saved.id)
          ? items.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...items];
      });
      // Usage of `wishlist.items.max`.
      void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
    },
  });
}

/**
 * `POST /api/v1/wishlist`: an identical wish answers 409, a full wishlist or a radius beyond the
 * plan 429 `LIMIT_REACHED`; field errors come back as 400 `VALIDATION_FAILED`.
 */
export function useCreateWish() {
  return useWishWrite(async (body: CreateWishlistItemRequest) =>
    required((await api.POST('/api/v1/wishlist', { body })).data)
  );
}

/** `PATCH /api/v1/wishlist/{id}`: every field, `null` clearing a filter. */
export function useUpdateWish() {
  return useWishWrite(async ({ id, body }: { id: string; body: UpdateWishlistItemRequest }) =>
    required((await api.PATCH('/api/v1/wishlist/{id}', { params: { path: { id } }, body })).data)
  );
}

/** Alerts on / off (`PATCH {active}`), optimistic: restored when the API refuses. */
export function useSetWishActive() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    WishlistItemResponse,
    ApiError,
    { item: WishlistItemResponse; active: boolean },
    { before: WishlistItemResponse[] | undefined }
  >({
    mutationFn: async ({ item, active }) =>
      required(
        (
          await api.PATCH('/api/v1/wishlist/{id}', {
            params: { path: { id: item.id } },
            body: { active },
          })
        ).data
      ),
    onMutate: ({ item, active }) => {
      const before = queryClient.getQueryData<WishlistItemResponse[]>(meKeys.wishlistItems(uid));
      queryClient.setQueryData<WishlistItemResponse[]>(meKeys.wishlistItems(uid), (items) =>
        items?.map((candidate) => (candidate.id === item.id ? { ...candidate, active } : candidate))
      );
      return { before };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(meKeys.wishlistItems(uid), context?.before);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<WishlistItemResponse[]>(meKeys.wishlistItems(uid), (items) =>
        items?.map((item) => (item.id === saved.id ? saved : item))
      );
    },
  });
}

/** `DELETE /api/v1/wishlist/{id}`: the wish and its matches. */
export function useDeleteWish() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      await api.DELETE('/api/v1/wishlist/{id}', { params: { path: { id } } });
    },
    onSuccess: (_, { id }) => {
      queryClient.setQueryData<WishlistItemResponse[]>(meKeys.wishlistItems(uid), (items) =>
        items?.filter((item) => item.id !== id)
      );
      queryClient.removeQueries({ queryKey: meKeys.wishMatches(uid, id) });
      void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
    },
  });
}

/**
 * `GET /api/v1/wishlist/{id}/matches`, newest first, cursor pages: each a public item with its
 * owner's marker (public point, distance bucket). Never a coordinate on screen.
 */
export function useWishMatches(id: string | null | undefined) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useInfiniteQuery<WishlistMatchPage, ApiError>({
    queryKey: meKeys.wishMatches(uid, id ?? ''),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/wishlist/{id}/matches', {
            params: {
              path: { id: id ?? '' },
              query: { cursor: (pageParam as string | null) ?? undefined, limit: MATCHES_PAGE },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: !!id && authenticated,
    staleTime: 0,
  });
}

/** Dismisses a match for good (`POST /wishlist/matches/{id}/dismiss`), optimistic. */
export function useDismissMatch(wishId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { matchId: string }, { before: MatchesData | undefined }>({
    mutationFn: async ({ matchId }) => {
      await api.POST('/api/v1/wishlist/matches/{id}/dismiss', {
        params: { path: { id: matchId } },
      });
    },
    onMutate: ({ matchId }) => {
      const key = meKeys.wishMatches(uid, wishId);
      const before = queryClient.getQueryData<MatchesData>(key);
      queryClient.setQueryData<MatchesData>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: (page.items ?? []).filter((match) => match.id !== matchId),
              })),
            }
          : data
      );
      return { before };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(meKeys.wishMatches(uid, wishId), context?.before);
    },
    onSuccess: () => {
      // The wish's match count changed.
      void queryClient.invalidateQueries({ queryKey: meKeys.wishlistItems(uid) });
    },
  });
}
