import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ListTradesRequestParams, TradeSummary, TradesService } from '@orenji/api-client';
import { filter } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { CursorList } from '../../../shared/offers/cursor-list';

/** Trades per page of `GET /trades`. */
export const TRADES_PAGE = 20;

export type TradesFilter = 'active' | 'completed' | 'cancelled' | 'all';

type TradeStatusParam = NonNullable<ListTradesRequestParams['status']>[number];

export const TRADES_FILTERS: readonly { value: TradesFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const FILTER_STATUSES: Record<TradesFilter, TradeStatusParam[] | undefined> = {
  all: undefined,
  active: ['AGREED', 'AWAITING_PAYMENT', 'PAID', 'SHIPPED', 'RECEIVED', 'DISPUTED'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
};

/** Reads `?status=` (default: all). */
export function parseTradesFilter(raw: string | null | undefined): TradesFilter {
  return TRADES_FILTERS.some((option) => option.value === raw) ? (raw as TradesFilter) : 'all';
}

/** `GET /trades` parameters of a filter. */
export function tradesRequest(
  filterValue: TradesFilter,
  cursor: string | null,
): ListTradesRequestParams {
  const status = FILTER_STATUSES[filterValue];
  return {
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
    limit: TRADES_PAGE,
  };
}

/**
 * `/trades`: the caller's trades (both sides), most recent activity first, with a status filter
 * and cursor pages; re-read on trade / accepted-offer notifications and realtime reconnections.
 * Provided by the trades page.
 */
@Injectable()
export class TradesListStore {
  private readonly api = inject(TradesService);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly filterState = signal<TradesFilter | null>(null);
  readonly filter = this.filterState.asReadonly();

  private readonly list = new CursorList<TradeSummary>((cursor) =>
    this.api.listTrades(tradesRequest(this.filterState() ?? 'all', cursor), 'body', false, {
      context: silentErrors(),
    }),
  );
  readonly items = this.list.items;
  readonly status = this.list.status;
  readonly error = this.list.error;
  readonly hasMore = this.list.hasMore;
  readonly loadingMore = this.list.loadingMore;
  readonly moreFailed = this.list.moreFailed;

  private started = false;

  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.center.pushed$
      .pipe(
        filter(
          (notification) =>
            notification.type === 'TRADE_UPDATE' || notification.type === 'OFFER_ACCEPTED',
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.list.refresh());
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.list.refresh());
    this.destroyRef.onDestroy(() => this.list.cancel());
  }

  setFilter(value: TradesFilter): void {
    if (this.filterState() === value) {
      return;
    }
    this.filterState.set(value);
    this.list.load();
  }

  load(): void {
    this.list.load();
  }

  loadMore(): void {
    this.list.loadMore();
  }
}
