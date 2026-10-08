import type { OfferStatus } from './offerLabels';

/**
 * The offers inbox's query (mirror of the web's `features/offers/data/offers-inbox.store.ts`):
 * Received = offers on the caller's cards (`role=seller`), Sent = the offers they made
 * (`role=buyer`), and a status filter.
 */

/** Offers per page of `GET /offers`. */
export const INBOX_PAGE = 20;

export type InboxTab = 'received' | 'sent';
export type InboxFilter = 'all' | 'active' | 'accepted' | 'closed';

export const INBOX_TABS: readonly { value: InboxTab; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'sent', label: 'Sent' },
];

export const INBOX_FILTERS: readonly { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'closed', label: 'Closed' },
];

const FILTER_STATUSES: Record<InboxFilter, OfferStatus[] | undefined> = {
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
export function parseInboxQuery(raw: {
  tab?: string | string[] | null;
  status?: string | string[] | null;
}): InboxQuery {
  const tab: InboxTab = raw.tab === 'sent' ? 'sent' : 'received';
  const filter = INBOX_FILTERS.some((option) => option.value === raw.status)
    ? (raw.status as InboxFilter)
    : 'all';
  return { tab, filter };
}

/** `GET /offers` query parameters of an inbox query. */
export function inboxRequest(query: InboxQuery, cursor: string | null) {
  const status = FILTER_STATUSES[query.filter];
  return {
    role: query.tab === 'sent' ? ('buyer' as const) : ('seller' as const),
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
    limit: INBOX_PAGE,
  };
}
