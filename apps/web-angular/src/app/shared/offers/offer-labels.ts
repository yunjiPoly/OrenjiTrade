import { formatRelativeTime, toDate } from '../pipes/relative-time.pipe';
import { formatPrice } from '../inventory/inventory-labels';

/**
 * Display vocabulary and pure rules of offers and trades (Phase 8 contract): kinds, statuses,
 * history events, terms summaries, expiry wording and which kinds a card accepts. Values mirror
 * the generated `@orenji/api-client` enums; every screen words them the same way through here.
 */

export type OfferKind = 'CASH' | 'TRADE' | 'MIXED';
export type OfferStatus = 'OPEN' | 'COUNTERED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type OfferAction = 'ACCEPT' | 'COUNTER' | 'DECLINE' | 'CANCEL';
export type OfferRole = 'BUYER' | 'SELLER';

/** Limits enforced by the API (`OfferRules`). */
export const OFFER_MESSAGE_MAX = 500;
export const OFFER_REASON_MAX = 500;
export const OFFER_TRADE_ITEMS_MAX = 10;
export const OFFER_QUANTITY_MAX = 9999;
export const OFFER_CASH_MAX = 9_999_999_999.99;
export const OFFER_DEFAULT_EXPIRY_HOURS = 72;

/** Expiry choices of the offer dialog (`expiresInHours`, 1–168). */
export const OFFER_EXPIRY_OPTIONS: readonly { hours: number; label: string }[] = [
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

export interface OfferKindInfo {
  label: string;
  /** Material Symbols glyph. */
  icon: string;
  hint: string;
}

export const OFFER_KIND_INFO: Record<OfferKind, OfferKindInfo> = {
  CASH: { label: 'Cash', icon: 'payments', hint: 'Offer an amount for the card.' },
  TRADE: { label: 'Trade', icon: 'swap_horiz', hint: 'Offer cards from your inventory.' },
  MIXED: {
    label: 'Cash + cards',
    icon: 'add_card',
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
export function kindHasCash(kind: OfferKind): boolean {
  return kind === 'CASH' || kind === 'MIXED';
}

export function kindHasCards(kind: OfferKind): boolean {
  return kind === 'TRADE' || kind === 'MIXED';
}

/** Colour family of a status chip (mapped to tokens by the chip). */
export type StatusTone = 'live' | 'success' | 'danger' | 'muted' | 'info';

export interface StatusInfo {
  label: string;
  icon: string;
  tone: StatusTone;
}

export const OFFER_STATUS_INFO: Record<OfferStatus, StatusInfo> = {
  OPEN: { label: 'Open', icon: 'hourglass_top', tone: 'live' },
  COUNTERED: { label: 'Countered', icon: 'swap_horiz', tone: 'live' },
  ACCEPTED: { label: 'Accepted', icon: 'handshake', tone: 'success' },
  DECLINED: { label: 'Declined', icon: 'do_not_disturb_on', tone: 'danger' },
  CANCELLED: { label: 'Withdrawn', icon: 'undo', tone: 'muted' },
  EXPIRED: { label: 'Expired', icon: 'timer_off', tone: 'muted' },
};

export function offerStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    OFFER_STATUS_INFO[status as OfferStatus] ?? { label: status ?? '—', icon: 'info', tone: 'info' }
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
 * refusal comes back as 422 OFFERS_NOT_ACCEPTED and is explained in the dialog).
 */
export function allowedOfferKinds(
  availability: string | null | undefined,
  acceptsOffers: boolean,
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
  const cash = formatPrice(terms.cashAmount, terms.currency ?? undefined);
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
function who(
  role: OfferRole | null | undefined,
  viewer: OfferRole | null | undefined,
  names: Record<OfferRole, string>,
): string {
  if (!role) {
    return 'OrenjiTrade';
  }
  return role === viewer ? 'You' : names[role];
}

/** A history entry in words ("Devon made an offer", "You countered"). */
export function offerEventLabel(
  event: string,
  actorRole: OfferRole | null | undefined,
  viewerRole: OfferRole | null | undefined,
  names: Record<OfferRole, string>,
): string {
  const actor = who(actorRole, viewerRole, names);
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

export const OFFER_EVENT_ICONS: Record<string, string> = {
  CREATED: 'local_offer',
  COUNTERED: 'swap_horiz',
  ACCEPTED: 'handshake',
  DECLINED: 'do_not_disturb_on',
  CANCELLED: 'undo',
  EXPIRED: 'timer_off',
  VIEWED: 'visibility',
};

/** "Expires in 2 days" / "Expired 3 hours ago"; `null` without a date. */
export function expiryLabel(
  expiresAt: string | null | undefined,
  now: Date | number = Date.now(),
): string | null {
  const date = toDate(expiresAt);
  if (!date) {
    return null;
  }
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const relative = formatRelativeTime(date, nowMs);
  return date.getTime() > nowMs ? `Expires ${relative}` : `Expired ${relative}`;
}

/** The other role. */
export function otherRole(role: OfferRole): OfferRole {
  return role === 'BUYER' ? 'SELLER' : 'BUYER';
}
