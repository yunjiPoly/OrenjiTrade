import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { tradesRequest, type TradesFilter } from '@/src/features/trades/tradeList';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { TradePage, TradeResponse } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/trades`: the caller's trades (both sides), most recent activity first, for a
 * status filter, in cursor pages. Trade and accepted-offer notifications invalidate it.
 */
export function useTrades(filter: TradesFilter) {
  const uid = useUid();
  return useInfiniteQuery<TradePage, ApiError>({
    queryKey: meKeys.tradeList(uid, filter),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/trades', {
            params: { query: tradesRequest(filter, (pageParam as string | null) ?? null) },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: useIsAuthenticated(),
    staleTime: 0,
  });
}

/**
 * `GET /api/v1/trades/{id}`: one trade with its accepted offer, timeline, `nextAction` and
 * `allowedOperations` (parties only: 404 for anybody else).
 */
export function useTrade(id: string | null | undefined) {
  const uid = useUid();
  return useQuery<TradeResponse, ApiError>({
    queryKey: meKeys.trade(uid, id ?? ''),
    queryFn: async () =>
      required((await api.GET('/api/v1/trades/{id}', { params: { path: { id: id ?? '' } } })).data),
    enabled: useIsAuthenticated() && !!id,
    staleTime: 0,
  });
}

export type TradeStep = 'meetup' | 'complete' | 'cancel';

/**
 * The Phase 8 operations of a trade: mark the in-person meetup, confirm the exchange (both
 * confirmations complete it; the cards leave the inventories) and cancel with a required reason.
 * Refusals: 409 `INVALID_STATE_TRANSITION` / `ITEM_UNAVAILABLE`, 403 `TRADING_BLOCKED`.
 */
export function useTradeStep() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<TradeResponse, ApiError, { id: string; step: TradeStep; reason?: string }>({
    mutationFn: async ({ id, step, reason }) => {
      const path = { params: { path: { id } } };
      switch (step) {
        case 'meetup':
          return required((await api.POST('/api/v1/trades/{id}/meetup', path)).data);
        case 'complete':
          return required((await api.POST('/api/v1/trades/{id}/complete', path)).data);
        default:
          return required(
            (
              await api.POST('/api/v1/trades/{id}/cancel', {
                ...path,
                body: { reason: reason ?? '' },
              })
            ).data
          );
      }
    },
    onSuccess: (trade) => {
      queryClient.setQueryData(meKeys.trade(uid, trade.id), trade);
      void queryClient.invalidateQueries({ queryKey: [...meKeys.trades(uid), 'list'] });
      if (trade.status === 'COMPLETED') {
        // The cards left the inventories; the other collector can now be rated.
        void queryClient.invalidateQueries({ queryKey: meKeys.inventory(uid) });
        void queryClient.invalidateQueries({ queryKey: meKeys.binders(uid) });
        void queryClient.invalidateQueries({
          queryKey: meKeys.ratingEligibility(uid, trade.counterparty.id),
        });
      }
    },
  });
}
