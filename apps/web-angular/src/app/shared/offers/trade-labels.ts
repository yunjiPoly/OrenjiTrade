import type { OfferRole, StatusInfo, StatusTone } from './offer-labels';

/**
 * Display vocabulary of trades (Phase 8 contract "Trades"; payment, shipping and dispute states
 * belong to Phase 9 and are only named here): statuses, timeline events and the next-action
 * banner.
 */

export type TradeStatus =
  | 'AGREED'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export type TradeNextActionKind = 'PAY' | 'SHIP' | 'CONFIRM_RECEIPT' | 'MEET' | 'NONE';

export const TRADE_STATUS_INFO: Record<TradeStatus, StatusInfo> = {
  AGREED: { label: 'Agreed', icon: 'handshake', tone: 'live' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', icon: 'payments', tone: 'live' },
  PAID: { label: 'Paid', icon: 'paid', tone: 'info' },
  SHIPPED: { label: 'Shipped', icon: 'local_shipping', tone: 'info' },
  RECEIVED: { label: 'Received', icon: 'inventory', tone: 'success' },
  COMPLETED: { label: 'Completed', icon: 'task_alt', tone: 'success' },
  CANCELLED: { label: 'Cancelled', icon: 'cancel', tone: 'muted' },
  DISPUTED: { label: 'Disputed', icon: 'gavel', tone: 'danger' },
};

export function tradeStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    TRADE_STATUS_INFO[status as TradeStatus] ?? { label: status ?? '—', icon: 'info', tone: 'info' }
  );
}

/** Trades still in progress (neither completed nor cancelled). */
export function isOpenTrade(status: string | null | undefined): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

export const TRADE_EVENT_ICONS: Record<string, string> = {
  CREATED: 'handshake',
  MEETUP_PROPOSED: 'groups',
  MEETUP_AGREED: 'event_available',
  PROTECTION_REMOVED: 'shield',
  COMPLETION_CONFIRMED: 'check_circle',
  COMPLETED: 'task_alt',
  CANCELLED: 'cancel',
};

function actorName(
  role: OfferRole | null | undefined,
  viewer: OfferRole | null | undefined,
  names: Record<OfferRole, string>,
): string {
  if (!role) {
    return 'OrenjiTrade';
  }
  return role === viewer ? 'You' : names[role];
}

/** A timeline entry in words. */
export function tradeEventLabel(
  event: string,
  actorRole: OfferRole | null | undefined,
  viewerRole: OfferRole | null | undefined,
  names: Record<OfferRole, string>,
): string {
  const actor = actorName(actorRole, viewerRole, names);
  switch (event) {
    case 'CREATED':
      return `${actor} accepted the offer: the trade is open`;
    case 'MEETUP_PROPOSED':
      return `${actor} marked the trade as an in-person meetup`;
    case 'MEETUP_AGREED':
      return 'In-person meetup agreed by both of you';
    case 'PROTECTION_REMOVED':
      return 'Payment protection removed for the meetup';
    case 'COMPLETION_CONFIRMED':
      return `${actor} confirmed the exchange`;
    case 'COMPLETED':
      return 'Trade completed';
    case 'CANCELLED':
      return `${actor} cancelled the trade`;
    default:
      return event.replace(/_/g, ' ').toLowerCase();
  }
}

/** The next-action banner of a trade page. */
export interface NextActionView {
  tone: StatusTone;
  icon: string;
  title: string;
  description: string;
}

export interface NextActionInput {
  status: string;
  nextAction: { actor?: OfferRole | null; action: string };
  viewerRole: OfferRole;
  /** The other party's display name. */
  other: string;
  cancelReason?: string | null;
}

export function nextActionView(trade: NextActionInput): NextActionView {
  const { status, nextAction, viewerRole, other } = trade;
  if (status === 'COMPLETED') {
    return {
      tone: 'success',
      icon: 'celebration',
      title: 'Trade completed',
      description: `Both of you confirmed the exchange. You can now rate ${other}.`,
    };
  }
  if (status === 'CANCELLED') {
    return {
      tone: 'muted',
      icon: 'cancel',
      title: 'Trade cancelled',
      description: trade.cancelReason
        ? `Reason given: “${trade.cancelReason}”`
        : 'Nothing else to do. The cards stay with their owners.',
    };
  }
  const mine = nextAction.actor === viewerRole;
  switch (nextAction.action) {
    case 'MEET':
      return mine
        ? {
            tone: 'live',
            icon: 'handshake',
            title: 'Your move: meet and exchange the cards',
            description: `Agree on a public place with ${other} in your conversation, exchange the cards, then confirm the trade here.`,
          }
        : {
            tone: 'info',
            icon: 'hourglass_top',
            title: `Waiting for ${other}`,
            description: `You confirmed the exchange. ${other} still has to confirm it to complete the trade.`,
          };
    case 'PAY':
      return {
        tone: mine ? 'live' : 'info',
        icon: 'payments',
        title: mine ? 'Your move: pay with payment protection' : `Waiting for ${other}'s payment`,
        description:
          'Protected payments open with an upcoming release. Until then you can both mark the trade as an in-person meetup.',
      };
    case 'SHIP':
      return {
        tone: mine ? 'live' : 'info',
        icon: 'local_shipping',
        title: mine ? 'Your move: ship the card' : `Waiting for ${other} to ship`,
        description: 'Shipping steps open with payment protection.',
      };
    case 'CONFIRM_RECEIPT':
      return {
        tone: mine ? 'live' : 'info',
        icon: 'inventory',
        title: mine ? 'Your move: confirm you received the card' : `Waiting for ${other}`,
        description: 'Receipt confirmation opens with payment protection.',
      };
    default:
      return {
        tone: 'info',
        icon: 'info',
        title: 'Nothing to do right now',
        description: 'You will be notified when something changes.',
      };
  }
}

/** Short next-action wording of a trade list row. */
export function nextActionShort(
  status: string,
  nextAction: { actor?: OfferRole | null; action: string },
  viewerRole: OfferRole,
  other: string,
): string {
  if (status === 'COMPLETED') {
    return 'Completed';
  }
  if (status === 'CANCELLED') {
    return 'Cancelled';
  }
  if (nextAction.action === 'NONE') {
    return 'Nothing to do';
  }
  if (nextAction.actor === viewerRole) {
    return nextAction.action === 'MEET' ? 'Your move: meet and confirm' : 'Your move';
  }
  return `Waiting for ${other}`;
}
