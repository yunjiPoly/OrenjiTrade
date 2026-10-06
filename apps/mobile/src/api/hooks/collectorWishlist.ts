import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { ApiError as ApiErrorClass } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { WishlistSummaryEntry } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/collectors/{handle}/wishlist` (the web's "Looking for" on a profile): the active
 * wishes of a collector who shows their wishlist (card, printing or any printing, minimum
 * condition; never notes, prices or radii). A 404 means the collector hides it (or is not visible
 * to the caller): an empty list, like the web.
 */
export function useCollectorWishlist(handle: string | null | undefined, enabled = true) {
  const uid = useUid();
  return useQuery<WishlistSummaryEntry[], ApiError>({
    queryKey: meKeys.collectorWishlist(uid, handle ?? ''),
    queryFn: async () => {
      try {
        return required(
          (
            await api.GET('/api/v1/collectors/{handle}/wishlist', {
              params: { path: { handle: handle ?? '' } },
            })
          ).data
        );
      } catch (error) {
        if (error instanceof ApiErrorClass && error.status === 404) {
          return [];
        }
        throw error;
      }
    },
    enabled: useIsAuthenticated() && !!handle && enabled,
    staleTime: 60_000,
  });
}
