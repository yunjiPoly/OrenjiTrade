import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ListOffersRequestParams, OfferSummary, OffersService } from '@orenji/api-client';
import { filter } from 'rxjs';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { CursorList } from '../../../shared/offers/cursor-list';

/** Offers per page of `GET /offers`. */
export const INBOX_PAGE = 20;

/** Received = offers on the caller's cards (`role=seller`); Sent = offers they made. */
export type InboxTab = 'received' | 'sent';
export type InboxFilter = 'all' | 'active' | 'accepted' | 'closed';

type OfferStatusParam = NonNullable<ListOffersRequestParams['status']>[number];

export const INBOX_FILTERS: readonly { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'closed', label: 'Closed' },
];

const FILTER_STATUSES: Record<InboxFilter, OfferStatusParam[] | undefined> = {
  all: undefined,
  active: ['OPEN', 'COUNTERED'],
  accepted: ['ACCEPTED'],
  closed: ['DECLINED', 'CANCELLED', 'EXPIRED'],
};

export interface InboxQuery {
  tab: InboxTab;
  filter: InboxFilter;
}

/** Reads `?tab=received|sent&status=all|active|accepted|closed` (defaults: received, all). */
export function parseInboxQuery(raw: { tab?: string | null; status?: string | null }): InboxQuery {
  const tab: InboxTab = raw.tab === 'sent' ? 'sent' : 'received';
  const filter = INBOX_FILTERS.some((option) => option.value === raw.status)
    ? (raw.status as InboxFilter)
    : 'all';
  return { tab, filter };
}

/** `GET /offers` parameters of a query. */
export function inboxRequest(query: InboxQuery, cursor: string | null): ListOffersRequestParams {
  const status = FILTER_STATUSES[query.filter];
  return {
    role: query.tab === 'sent' ? 'buyer' : 'seller',
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
    limit: INBOX_PAGE,
  };
}

/**
 * `/offers`: the caller's negotiations (the live proposal of each, most recent activity first)
 * for one tab and status filter, with cursor pages, and quietly re-read when an offer
 * notification arrives or realtime reconnects. Provided by the inbox page.
 */
@Injectable()
export class OffersInboxStore {
  private readonly api = inject(OffersService);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly queryState = signal<InboxQuery | null>(null);
  readonly query = this.queryState.asReadonly();

  private readonly list = new CursorList<OfferSummary>((cursor) =>
    this.api.listOffers(
      inboxRequest(this.queryState() ?? { tab: 'received', filter: 'all' }, cursor),
      'body',
      false,
      { context: silentErrors() },
    ),
  );
  readonly items = this.list.items;
  readonly status = this.list.status;
  readonly error = this.list.error;
  readonly hasMore = this.list.hasMore;
  readonly loadingMore = this.list.loadingMore;
  readonly moreFailed = this.list.moreFailed;
  /** Proposals on screen waiting for the caller's answer. */
  readonly yourTurnCount = computed(() => this.items().filter((offer) => offer.yourTurn).length);

  private started = false;

  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.center.pushed$
      .pipe(
        filter((notification) => notification.type.startsWith('OFFER_')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.list.refresh());
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.list.refresh());
    this.destroyRef.onDestroy(() => this.list.cancel());
  }

  /** Shows a tab and filter (reloads when they change). */
  setQuery(query: InboxQuery): void {
    const current = this.queryState();
    if (current && current.tab === query.tab && current.filter === query.filter) {
      return;
    }
    this.queryState.set(query);
    this.list.load();
  }

  load(): void {
    this.list.load();
  }

  loadMore(): void {
    this.list.loadMore();
  }

  refresh(): Promise<void> {
    return this.list.refresh();
  }
}
