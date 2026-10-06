import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { inboxRequest, type InboxQuery } from '@/src/features/offers/offerInbox';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  CounterOfferRequest,
  CreateOfferRequest,
  OfferPage,
  OfferResponse,
  OfferSettings,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** Negotiations searched by "Share an offer" for the conversation partner (web: 50). */
export const RECENT_OFFERS = 50;

/**
 * `GET /api/v1/offers`: the live proposal of each negotiation for one tab (Received = the
 * caller's cards, Sent = offers they made) and status filter, most recent activity first, in
 * cursor pages. Offer notifications and realtime reconnections invalidate it.
 */
export function useOffers(query: InboxQuery) {
  const uid = useUid();
  return useInfiniteQuery<OfferPage, ApiError>({
    queryKey: meKeys.offerList(uid, query),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/offers', {
            params: { query: inboxRequest(query, (pageParam as string | null) ?? null) },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: useIsAuthenticated(),
    staleTime: 0,
  });
}

/** The caller's recent negotiations, both sides (the composer's "Share an offer"). */
export function useRecentOffers(enabled = true) {
  const uid = useUid();
  return useQuery<OfferPage, ApiError>({
    queryKey: meKeys.offerList(uid, { recent: RECENT_OFFERS }),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/offers', { params: { query: { limit: RECENT_OFFERS } } })).data
      ),
    enabled: useIsAuthenticated() && enabled,
    staleTime: 0,
  });
}

/**
 * `GET /api/v1/offers/{id}`: one proposal with the history of its whole counter chain (parties
 * only: 404 for anybody else). `latestOfferId` points at the live proposal once a counter-offer
 * replaced this one.
 */
export function useOffer(id: string | null | undefined) {
  const uid = useUid();
  return useQuery<OfferResponse, ApiError>({
    queryKey: meKeys.offer(uid, id ?? ''),
    queryFn: async () =>
      required((await api.GET('/api/v1/offers/{id}', { params: { path: { id: id ?? '' } } })).data),
    enabled: useIsAuthenticated() && !!id,
    staleTime: 0,
  });
}

/** After any answer: the proposal itself, every inbox, the trades (an accept opens one). */
function refreshOffers(queryClient: QueryClient, uid: string | null, offer?: OfferResponse) {
  if (offer) {
    queryClient.setQueryData(meKeys.offer(uid, offer.id), offer);
  }
  void queryClient.invalidateQueries({ queryKey: [...meKeys.offers(uid), 'list'] });
  void queryClient.invalidateQueries({ queryKey: meKeys.trades(uid) });
}

/**
 * `POST /api/v1/offers` with the form's `Idempotency-Key`: 422 `OFFERS_NOT_ACCEPTED`, 409
 * `OFFER_ALREADY_OPEN` (extension `offerId`), 404 (the card is gone or not visible), 429
 * `LIMIT_REACHED` (`offers.per_day`), 400 field errors.
 */
export function useCreateOffer() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<OfferResponse, ApiError, { body: CreateOfferRequest; idempotencyKey: string }>(
    {
      mutationFn: async ({ body, idempotencyKey }) =>
        required(
          (
            await api.POST('/api/v1/offers', {
              params: { header: { 'Idempotency-Key': idempotencyKey } },
              body,
            })
          ).data
        ),
      onSuccess: (offer) => refreshOffers(queryClient, uid, offer),
    }
  );
}

/**
 * `POST /api/v1/offers/{id}/counter` (the party whose turn it is, with the version on screen):
 * 409 `STALE_OFFER` / `NOT_YOUR_TURN` / `INVALID_STATE_TRANSITION`, 422, 403 `TRADING_BLOCKED`.
 * The answered proposal becomes COUNTERED and superseded.
 */
export function useCounterOffer() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<OfferResponse, ApiError, { id: string; body: CounterOfferRequest }>({
    mutationFn: async ({ id, body }) =>
      required(
        (await api.POST('/api/v1/offers/{id}/counter', { params: { path: { id } }, body })).data
      ),
    onSuccess: (offer, { id }) => {
      refreshOffers(queryClient, uid, offer);
      void queryClient.invalidateQueries({ queryKey: meKeys.offer(uid, id) });
    },
  });
}

export type OfferAnswer = 'accept' | 'decline' | 'cancel';

/**
 * Accept (opens the trade), decline (optional reason) or withdraw (the buyer while OPEN,
 * optional reason), each with the version on screen.
 */
export function useAnswerOffer() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    OfferResponse,
    ApiError,
    { offer: OfferResponse; answer: OfferAnswer; reason?: string }
  >({
    mutationFn: async ({ offer, answer, reason }) => {
      const path = { params: { path: { id: offer.id } } };
      const closing = { ...(reason ? { reason } : {}), version: offer.version };
      switch (answer) {
        case 'accept':
          return required(
            (
              await api.POST('/api/v1/offers/{id}/accept', {
                ...path,
                body: { version: offer.version },
              })
            ).data
          );
        case 'decline':
          return required(
            (await api.POST('/api/v1/offers/{id}/decline', { ...path, body: closing })).data
          );
        default:
          return required(
            (await api.POST('/api/v1/offers/{id}/cancel', { ...path, body: closing })).data
          );
      }
    },
    onSuccess: (offer) => refreshOffers(queryClient, uid, offer),
  });
}

/** `GET /api/v1/me/settings/offers`: whether mixed (cash + cards) offers are welcome. */
export function useOfferSettings() {
  const uid = useUid();
  return useQuery<OfferSettings, ApiError>({
    queryKey: meKeys.offerSettings(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/settings/offers')).data),
    enabled: useIsAuthenticated(),
  });
}

/** `PUT /api/v1/me/settings/offers`. */
export function useUpdateOfferSettings() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<OfferSettings, ApiError, OfferSettings>({
    mutationFn: async (body) =>
      required((await api.PUT('/api/v1/me/settings/offers', { body })).data),
    onSuccess: (saved) => queryClient.setQueryData(meKeys.offerSettings(uid), saved),
  });
}
