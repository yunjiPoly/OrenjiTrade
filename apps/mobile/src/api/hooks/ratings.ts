import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  CreateRatingRequest,
  CreateReferenceRequest,
  RatingEligibility,
  RatingResponse,
  ReferenceResponse,
  UpdateRatingRequest,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** The collector a rating or a reference is about (what the screens refresh afterwards). */
export interface RatedCollectorRef {
  /** Account id (`subjectId`, `GET /ratings/eligibility?userId=`). */
  id: string;
  handle: string;
}

/**
 * `GET /api/v1/ratings/eligibility?userId=`: the caller's interactions with a collector
 * (completed trades, accepted offers, conversations with at least 3 messages from each side),
 * each with `alreadyRated`. Never asked about oneself (the API answers 400).
 */
export function useRatingEligibility(userId: string | null | undefined, enabled = true) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<RatingEligibility, ApiError>({
    queryKey: meKeys.ratingEligibility(uid, userId ?? ''),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/ratings/eligibility', {
            params: { query: { userId: userId ?? '' } },
          })
        ).data
      ),
    enabled: !!userId && authenticated && enabled,
    staleTime: 0,
  });
}

/** After a rating or a reference: the profile (summary), its lists and the eligibility. */
function refreshCollector(queryClient: QueryClient, uid: string | null, who: RatedCollectorRef) {
  void queryClient.invalidateQueries({ queryKey: meKeys.collector(uid, who.handle) });
  void queryClient.invalidateQueries({ queryKey: meKeys.ratingEligibility(uid, who.id) });
}

/**
 * `POST /api/v1/ratings` (overall 1–5 required, optional breakdown and comment ≤ 600): 403
 * `RATING_NOT_ELIGIBLE`, 409 `ALREADY_RATED`, 400 for banned terms. The collector gets a
 * RATING_RECEIVED notification.
 */
export function useCreateRating() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    RatingResponse,
    ApiError,
    { collector: RatedCollectorRef; body: CreateRatingRequest }
  >({
    mutationFn: async ({ body }) => required((await api.POST('/api/v1/ratings', { body })).data),
    onSuccess: (_, { collector }) => refreshCollector(queryClient, uid, collector),
  });
}

/** `PUT /api/v1/ratings/{id}` within the 14-day window (409 `RATING_EDIT_WINDOW_CLOSED`). */
export function useUpdateRating() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    RatingResponse,
    ApiError,
    { collector: RatedCollectorRef; id: string; body: UpdateRatingRequest }
  >({
    mutationFn: async ({ id, body }) =>
      required((await api.PUT('/api/v1/ratings/{id}', { params: { path: { id } }, body })).data),
    onSuccess: (_, { collector }) => refreshCollector(queryClient, uid, collector),
  });
}

/**
 * `POST /api/v1/references` (≤ 400 characters, banned terms refused, one per author and
 * collector: 409 `CONFLICT`; 403 `RATING_NOT_ELIGIBLE` without an interaction).
 */
export function useCreateReference() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    ReferenceResponse,
    ApiError,
    { collector: RatedCollectorRef; body: Omit<CreateReferenceRequest, 'subjectId'> }
  >({
    mutationFn: async ({ collector, body }) =>
      required(
        (await api.POST('/api/v1/references', { body: { ...body, subjectId: collector.id } })).data
      ),
    onSuccess: (_, { collector }) => refreshCollector(queryClient, uid, collector),
  });
}
