import type { OfferRole, StatusInfo, StatusTone } from './offer-labels';

/**
 * Display vocabulary of trades (Phase 8 contract "Trades" and the Phase 9 payment protection,
 * shipping and dispute steps): statuses, timeline events and the next-action banner. Wording is
 * "payment protection": the payment provider holds the money, OrenjiTrade is an intermediary.
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
  PAYMENT_STARTED: 'shopping_cart_checkout',
  PAYMENT_FAILED: 'credit_card_off',
  PAYMENT_CANCELLED: 'block',
  PAYMENT_SECURED: 'verified_user',
  SHIPPED: 'local_shipping',
  RECEIPT_CONFIRMED: 'inventory',
  PAYOUT_RELEASED: 'savings',
  DISPUTE_OPENED: 'gavel',
  DISPUTE_RESOLVED: 'balance',
  REFUNDED: 'currency_exchange',
};

const DISPUTE_REASON_WORDS: Record<string, string> = {
  NOT_RECEIVED: 'the card never arrived',
  NOT_AS_DESCRIBED: 'not as described',
  COUNTERFEIT: 'counterfeit',
  DAMAGED: 'damaged in transit',
  OTHER: 'another problem',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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

/** A timeline entry in words (`details` words the Phase 9 payment, shipping and dispute steps). */
export function tradeEventLabel(
  event: string,
  actorRole: OfferRole | null | undefined,
  viewerRole: OfferRole | null | undefined,
  names: Record<OfferRole, string>,
  details: Record<string, unknown> | null = null,
): string {
  const actor = actorName(actorRole, viewerRole, names);
  switch (event) {
    case 'PAYMENT_STARTED':
      return `${actor} started the protected payment`;
    case 'PAYMENT_FAILED':
      return 'The payment did not go through: nothing was charged';
    case 'PAYMENT_CANCELLED':
      return 'The unpaid checkout was cancelled';
    case 'PAYMENT_SECURED':
      return 'Payment secured: the payment provider holds the money';
    case 'SHIPPED': {
      const carrier = text(details?.['carrier']);
      return `${actor} shipped the card${carrier ? ` with ${carrier}` : ''}`;
    }
    case 'RECEIPT_CONFIRMED':
      return details?.['automatic'] === true
        ? 'Receipt confirmed automatically: the dispute window ended'
        : `${actor} confirmed receiving the card`;
    case 'PAYOUT_RELEASED':
      return viewerRole === 'SELLER'
        ? 'Payout released to you'
        : `Payout released to ${names.SELLER}`;
    case 'DISPUTE_OPENED': {
      const reason = DISPUTE_REASON_WORDS[String(details?.['reason'] ?? '')];
      return `${actor} opened a dispute${reason ? `: ${reason}` : ''}`;
    }
    case 'DISPUTE_RESOLVED':
      switch (details?.['outcome']) {
        case 'BUYER':
          return 'OrenjiTrade resolved the dispute for the buyer';
        case 'SELLER':
          return 'OrenjiTrade resolved the dispute for the seller';
        case 'SPLIT':
          return 'OrenjiTrade resolved the dispute with a split';
        default:
          return 'OrenjiTrade resolved the dispute';
      }
    case 'REFUNDED':
      return viewerRole === 'BUYER' ? 'Refund issued to you' : `Refund issued to ${names.BUYER}`;
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
  /** Payment protection (Phase 9): whether it is on, the payment's status, the window end. */
  protectionEnabled?: boolean;
  paymentStatus?: string | null;
  /** End of the dispute window, already worded for people. */
  windowEndsAt?: string | null;
}

export function nextActionView(trade: NextActionInput): NextActionView {
  const { status, nextAction, viewerRole, other } = trade;
  if (status === 'COMPLETED') {
    let description = `Both of you confirmed the exchange. You can now rate ${other}.`;
    if (trade.protectionEnabled) {
      description =
        viewerRole === 'SELLER'
          ? `${other} received the card and your payout was released. You can now rate ${other}.`
          : `You received the card and the payout was released to ${other}. You can now rate ${other}.`;
    }
    return { tone: 'success', icon: 'celebration', title: 'Trade completed', description };
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
  if (status === 'DISPUTED') {
    return {
      tone: 'info',
      icon: 'gavel',
      title: 'A dispute is open',
      description:
        'An OrenjiTrade admin reviews what both of you shared. The payout stays on hold until the decision.',
    };
  }
  const mine = nextAction.actor === viewerRole;
  const window = trade.windowEndsAt;
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
      if (!mine) {
        return {
          tone: 'info',
          icon: 'payments',
          title: `Waiting for ${other}'s payment`,
          description: `${other} pays through the payment provider, which holds the money until the card arrives. You will be asked to ship once it is secured.`,
        };
      }
      if (trade.paymentStatus === 'FAILED') {
        return {
          tone: 'live',
          icon: 'credit_card_off',
          title: 'Your payment did not go through',
          description:
            'Nothing was charged. Try again: the payment provider holds the money until you confirm the card arrived.',
        };
      }
      return {
        tone: 'live',
        icon: 'payments',
        title:
          trade.paymentStatus === 'REQUIRES_ACTION'
            ? 'Your move: finish your protected payment'
            : 'Your move: pay with payment protection',
        description: `The payment provider holds the money until you confirm the card arrived, then releases it to ${other}. You can still agree to meet in person instead.`,
      };
    case 'SHIP':
      return mine
        ? {
            tone: 'live',
            icon: 'local_shipping',
            title: 'Your move: ship the card',
            description: `${other}'s payment is secured by the payment provider. Ship the card with tracking, then mark it as shipped; your payout is released when ${other} confirms receipt.`,
          }
        : {
            tone: 'info',
            icon: 'local_shipping',
            title: `Waiting for ${other} to ship`,
            description:
              'Your payment is secured by the payment provider. You will be notified when the card ships.',
          };
    case 'CONFIRM_RECEIPT':
      return mine
        ? {
            tone: 'live',
            icon: 'inventory',
            title: 'Your move: confirm you received the card',
            description: `Check the card, then confirm receipt to release the payout to ${other}. Something wrong? Open a dispute${window ? ` before ${window}` : ''} instead.`,
          }
        : {
            tone: 'info',
            icon: 'inventory',
            title: `Waiting for ${other} to confirm receipt`,
            description: `The card is on its way. Your payout is released when ${other} confirms receipt${window ? `, or automatically after ${window} without a dispute` : ''}.`,
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
  if (status === 'DISPUTED') {
    return 'Dispute open';
  }
  if (nextAction.action === 'NONE') {
    return 'Nothing to do';
  }
  if (nextAction.actor === viewerRole) {
    switch (nextAction.action) {
      case 'MEET':
        return 'Your move: meet and confirm';
      case 'PAY':
        return 'Your move: pay';
      case 'SHIP':
        return 'Your move: ship the card';
      case 'CONFIRM_RECEIPT':
        return 'Your move: confirm receipt';
      default:
        return 'Your move';
    }
  }
  return `Waiting for ${other}`;
}
