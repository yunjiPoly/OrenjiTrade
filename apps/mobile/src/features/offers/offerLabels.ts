import type { IconName } from '@/src/components/ui/EmptyState';
import { formatMoney } from '@/src/lib/catalog';
import { relativeTime } from '@/src/lib/relativeTime';

/**
 * Display vocabulary and pure rules of offers (Phase 8 contract, mirror of the web's
 * `shared/offers/offer-labels.ts`): kinds, statuses, history events, terms summaries, expiry
 * wording and which kinds a card accepts. Every screen words them the same way through here.
 */

export type OfferKind = 'CASH' | 'TRADE' | 'MIXED';
export type OfferStatus = 'OPEN' | 'COUNTERED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type OfferActionName = 'ACCEPT' | 'COUNTER' | 'DECLINE' | 'CANCEL';
export type OfferRole = 'BUYER' | 'SELLER';

/** Limits enforced by the API (`OfferRules`). */
export const OFFER_MESSAGE_MAX = 500;
export const OFFER_REASON_MAX = 500;
export const OFFER_TRADE_ITEMS_MAX = 10;
export const OFFER_QUANTITY_MAX = 9999;
export const OFFER_CASH_MAX = 9_999_999_999.99;
export const OFFER_DEFAULT_EXPIRY_HOURS = 72;

/** Expiry choices of the offer form (`expiresInHours`, 1–168). */
export const OFFER_EXPIRY_OPTIONS: readonly { hours: number; label: string }[] = [
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

export interface OfferKindInfo {
  label: string;
  icon: IconName;
  hint: string;
}

export const OFFER_KIND_INFO: Record<OfferKind, OfferKindInfo> = {
  CASH: { label: 'Cash', icon: 'cash', hint: 'Offer an amount for the card.' },
  TRADE: { label: 'Trade', icon: 'swap-horizontal', hint: 'Offer cards from your inventory.' },
  MIXED: {
    label: 'Cash + cards',
    icon: 'card-plus-outline',
    hint: 'Offer an amount and some of your cards.',
  },
};

export const OFFER_KINDS: readonly OfferKind[] = ['CASH', 'TRADE', 'MIXED'];

export function isOfferKind(value: unknown): value is OfferKind {
  return typeof value === 'string' && (OFFER_KINDS as readonly string[]).includes(value);
}

export function offerKindLabel(kind: string | null | undefined): string {
  return OFFER_KIND_INFO[kind as OfferKind]?.label ?? 'Offer';
}

/** Whether a kind carries a cash part / cards. */
export function kindHasCash(kind: string): boolean {
  return kind === 'CASH' || kind === 'MIXED';
}

export function kindHasCards(kind: string): boolean {
  return kind === 'TRADE' || kind === 'MIXED';
}

/** Colour family of a status chip (mapped to theme colours by `StatusChip`). */
export type StatusTone = 'live' | 'success' | 'danger' | 'muted' | 'info';

export interface StatusInfo {
  label: string;
  icon: IconName;
  tone: StatusTone;
}

export const OFFER_STATUS_INFO: Record<OfferStatus, StatusInfo> = {
  OPEN: { label: 'Open', icon: 'timer-sand', tone: 'live' },
  COUNTERED: { label: 'Countered', icon: 'swap-horizontal', tone: 'live' },
  ACCEPTED: { label: 'Accepted', icon: 'handshake', tone: 'success' },
  DECLINED: { label: 'Declined', icon: 'minus-circle', tone: 'danger' },
  CANCELLED: { label: 'Withdrawn', icon: 'undo', tone: 'muted' },
  EXPIRED: { label: 'Expired', icon: 'timer-off-outline', tone: 'muted' },
};

export function offerStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    OFFER_STATUS_INFO[status as OfferStatus] ?? {
      label: status ?? '—',
      icon: 'information-outline',
      tone: 'info',
    }
  );
}

/** OPEN and COUNTERED proposals are still negotiated. */
export function isLiveOffer(status: string | null | undefined): boolean {
  return status === 'OPEN' || status === 'COUNTERED';
}

/**
 * Kinds a buyer may offer on a card (`OfferRules.kindRefusal`): nothing when offers are off or
 * the card is NOT_AVAILABLE / COLLECTION_ONLY; CASH for SALE; TRADE for TRADE; all three for
 * TRADE_OR_SALE (MIXED also needs the seller's `acceptsMixed`, which only the API knows: a
 * refusal comes back as 422 OFFERS_NOT_ACCEPTED and is explained in the form).
 */
export function allowedOfferKinds(
  availability: string | null | undefined,
  acceptsOffers: boolean
): OfferKind[] {
  if (!acceptsOffers) {
    return [];
  }
  switch (availability) {
    case 'SALE':
      return ['CASH'];
    case 'TRADE':
      return ['TRADE'];
    case 'TRADE_OR_SALE':
      return ['CASH', 'TRADE', 'MIXED'];
    default:
      return [];
  }
}

/** One line of cards in a proposal. */
export interface TermsCard {
  quantity: number;
}

/**
 * "CA$40.00", "2 cards", "CA$20.00 + 1 card": the proposal in a few words. `cards` is either the
 * card lines (quantities are added up) or the number of lines (`tradeItemCount` of summaries).
 */
export function offerTermsText(terms: {
  kind: string;
  cashAmount?: number | null;
  currency?: string | null;
  cards: readonly TermsCard[] | number;
}): string {
  const count =
    typeof terms.cards === 'number'
      ? terms.cards
      : terms.cards.reduce((sum, line) => sum + Math.max(1, line.quantity || 1), 0);
  const cash = formatMoney(terms.cashAmount, terms.currency ?? undefined);
  const cards = count > 0 ? `${count} ${count === 1 ? 'card' : 'cards'}` : null;
  switch (terms.kind) {
    case 'CASH':
      return cash ?? 'Cash offer';
    case 'TRADE':
      return cards ?? 'Trade offer';
    default:
      return [cash, cards].filter(Boolean).join(' + ') || 'Mixed offer';
  }
}

/** "You", or the other party's name. */
export function actorName(
  role: OfferRole | null | undefined,
  viewer: OfferRole | null | undefined,
  names: Record<OfferRole, string>
): string {
  if (!role) {
    return 'OrenjiTrade';
  }
  return role === viewer ? 'You' : names[role];
}

/** A history entry in words ("Devon made the offer", "You sent a counter-offer"). */
export function offerEventLabel(
  event: string,
  actorRole: OfferRole | null | undefined,
  viewerRole: OfferRole | null | undefined,
  names: Record<OfferRole, string>
): string {
  const actor = actorName(actorRole, viewerRole, names);
  switch (event) {
    case 'CREATED':
      return `${actor} made the offer`;
    case 'COUNTERED':
      return `${actor} sent a counter-offer`;
    case 'ACCEPTED':
      return `${actor} accepted`;
    case 'DECLINED':
      return `${actor} declined`;
    case 'CANCELLED':
      return `${actor} withdrew the offer`;
    case 'EXPIRED':
      return 'The offer expired';
    case 'VIEWED':
      return `${actor} viewed the offer`;
    default:
      return event.replace(/_/g, ' ').toLowerCase();
  }
}

export const OFFER_EVENT_ICONS: Record<string, IconName> = {
  CREATED: 'tag-outline',
  COUNTERED: 'swap-horizontal',
  ACCEPTED: 'handshake',
  DECLINED: 'minus-circle-outline',
  CANCELLED: 'undo',
  EXPIRED: 'timer-off-outline',
  VIEWED: 'eye-outline',
};

/** "Expires in 2 days" / "Expired 3 hours ago"; `null` without a date. */
export function expiryLabel(
  expiresAt: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (!expiresAt) {
    return null;
  }
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) {
    return null;
  }
  const relative = relativeTime(time, now);
  return time > now ? `Expires ${relative}` : `Expired ${relative}`;
}

/** The other role. */
export function otherRole(role: OfferRole): OfferRole {
  return role === 'BUYER' ? 'SELLER' : 'BUYER';
}
