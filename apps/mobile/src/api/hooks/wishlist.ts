import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  CreateWishlistItemRequest,
  UpdateWishlistItemRequest,
  WishPriceTerm,
  WishlistItemResponse,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/wishlist`: the caller's wishes, newest first (stage S2: which copy, public note,
 * Near Mint only, price term; no matches). Every realtime reconnection re-reads it.
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

/** `GET /api/v1/wishlist/price-terms`: the admin-configured price terms ("85% TCG", ...). */
export function usePriceTerms() {
  const uid = useUid();
  return useQuery<WishPriceTerm[], ApiError>({
    queryKey: meKeys.wishPriceTerms(uid),
    queryFn: async () => required((await api.GET('/api/v1/wishlist/price-terms')).data).terms ?? [],
    enabled: useIsAuthenticated(),
    staleTime: 5 * 60_000,
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
 * `POST /api/v1/wishlist`: the same selection twice answers 409, a full wishlist 429
 * `LIMIT_REACHED`; field errors come back as 400 `VALIDATION_FAILED`.
 */
export function useCreateWish() {
  return useWishWrite(async (body: CreateWishlistItemRequest) =>
    required((await api.POST('/api/v1/wishlist', { body })).data)
  );
}

/** `PATCH /api/v1/wishlist/{id}`: every field, `null` clearing a choice. */
export function useUpdateWish() {
  return useWishWrite(async ({ id, body }: { id: string; body: UpdateWishlistItemRequest }) =>
    required((await api.PATCH('/api/v1/wishlist/{id}', { params: { path: { id } }, body })).data)
  );
}

/** `DELETE /api/v1/wishlist/{id}`. */
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
      void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
    },
  });
}
