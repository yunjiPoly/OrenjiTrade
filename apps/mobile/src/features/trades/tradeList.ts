import type { TradeStatus } from '@/src/api/types';

/**
 * The trades list's status filter (mirror of the web's `features/trades/data/trades-list.store.ts`).
 */

/** Trades per page of `GET /trades`. */
export const TRADES_PAGE = 20;

export type TradesFilter = 'all' | 'active' | 'completed' | 'cancelled';

export const TRADES_FILTERS: readonly { value: TradesFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const FILTER_STATUSES: Record<TradesFilter, TradeStatus[] | undefined> = {
  all: undefined,
  active: ['AGREED', 'AWAITING_PAYMENT', 'PAID', 'SHIPPED', 'RECEIVED', 'DISPUTED'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
};

/** Reads `?status=` (default: all). */
export function parseTradesFilter(raw: string | string[] | null | undefined): TradesFilter {
  return TRADES_FILTERS.some((option) => option.value === raw) ? (raw as TradesFilter) : 'all';
}

/** `GET /trades` query parameters of a filter. */
export function tradesRequest(filter: TradesFilter, cursor: string | null) {
  const status = FILTER_STATUSES[filter];
  return {
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
    limit: TRADES_PAGE,
  };
}
