import type { IconName } from '@/src/components/ui/EmptyState';
import {
  actorName,
  type OfferRole,
  type StatusInfo,
  type StatusTone,
} from '@/src/features/offers/offerLabels';

/**
 * Display vocabulary of trades (mirror of the web's `shared/offers/trade-labels.ts`): statuses,
 * timeline events and the next-action banner. The payment-protection steps (Phase 9) are worded
 * too, because a trade agreed with protection on the web can be opened in the app; paying,
 * shipping and disputes themselves stay on orenjitrade.com for now.
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

export const TRADE_STATUS_INFO: Record<TradeStatus, StatusInfo> = {
  AGREED: { label: 'Agreed', icon: 'handshake', tone: 'live' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', icon: 'cash', tone: 'live' },
  PAID: { label: 'Paid', icon: 'cash-check', tone: 'info' },
  SHIPPED: { label: 'Shipped', icon: 'truck-outline', tone: 'info' },
  RECEIVED: { label: 'Received', icon: 'package-variant-closed', tone: 'success' },
  COMPLETED: { label: 'Completed', icon: 'check-decagram-outline', tone: 'success' },
  CANCELLED: { label: 'Cancelled', icon: 'cancel', tone: 'muted' },
  DISPUTED: { label: 'Disputed', icon: 'gavel', tone: 'danger' },
};

export function tradeStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    TRADE_STATUS_INFO[status as TradeStatus] ?? {
      label: status ?? '—',
      icon: 'information-outline',
      tone: 'info',
    }
  );
}

/** Trades still in progress (neither completed nor cancelled). */
export function isOpenTrade(status: string | null | undefined): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

export const TRADE_EVENT_ICONS: Record<string, IconName> = {
  CREATED: 'handshake',
  MEETUP_PROPOSED: 'account-group-outline',
  MEETUP_AGREED: 'calendar-check-outline',
  PROTECTION_REMOVED: 'shield-off-outline',
  COMPLETION_CONFIRMED: 'check-circle-outline',
  COMPLETED: 'check-decagram-outline',
  CANCELLED: 'cancel',
  PAYMENT_STARTED: 'cart-outline',
  PAYMENT_FAILED: 'credit-card-off-outline',
  PAYMENT_CANCELLED: 'block-helper',
  PAYMENT_SECURED: 'shield-check-outline',
  SHIPPED: 'truck-outline',
  RECEIPT_CONFIRMED: 'package-variant-closed',
  PAYOUT_RELEASED: 'piggy-bank-outline',
  DISPUTE_OPENED: 'gavel',
  DISPUTE_RESOLVED: 'scale-balance',
  REFUNDED: 'cash-refund',
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

/** A timeline entry in words. */
export function tradeEventLabel(
  event: string,
  actorRole: OfferRole | null | undefined,
  viewerRole: OfferRole | null | undefined,
  names: Record<OfferRole, string>,
  details: Record<string, unknown> | null = null
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

/** The next-action banner of a trade screen. */
export interface NextActionView {
  tone: StatusTone;
  icon: IconName;
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
  /** Payment protection (Phase 9): whether it is on and the payment's status. */
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
    return { tone: 'success', icon: 'party-popper', title: 'Trade completed', description };
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
            icon: 'timer-sand',
            title: `Waiting for ${other}`,
            description: `You confirmed the exchange. ${other} still has to confirm it to complete the trade.`,
          };
    case 'PAY':
      if (!mine) {
        return {
          tone: 'info',
          icon: 'cash',
          title: `Waiting for ${other}'s payment`,
          description: `${other} pays through the payment provider, which holds the money until the card arrives. You will be asked to ship once it is secured.`,
        };
      }
      if (trade.paymentStatus === 'FAILED') {
        return {
          tone: 'live',
          icon: 'credit-card-off-outline',
          title: 'Your payment did not go through',
          description:
            'Nothing was charged. Try again: the payment provider holds the money until you confirm the card arrived.',
        };
      }
      return {
        tone: 'live',
        icon: 'cash',
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
            icon: 'truck-outline',
            title: 'Your move: ship the card',
            description: `${other}'s payment is secured by the payment provider. Ship the card with tracking, then mark it as shipped; your payout is released when ${other} confirms receipt.`,
          }
        : {
            tone: 'info',
            icon: 'truck-outline',
            title: `Waiting for ${other} to ship`,
            description:
              'Your payment is secured by the payment provider. You will be notified when the card ships.',
          };
    case 'CONFIRM_RECEIPT':
      return mine
        ? {
            tone: 'live',
            icon: 'package-variant-closed',
            title: 'Your move: confirm you received the card',
            description: `Check the card, then confirm receipt to release the payout to ${other}. Something wrong? Open a dispute${window ? ` before ${window}` : ''} instead.`,
          }
        : {
            tone: 'info',
            icon: 'package-variant-closed',
            title: `Waiting for ${other} to confirm receipt`,
            description: `The card is on its way. Your payout is released when ${other} confirms receipt${window ? `, or automatically after ${window} without a dispute` : ''}.`,
          };
    default:
      return {
        tone: 'info',
        icon: 'information-outline',
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
  other: string
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

/** Whether the viewer has the next move of a trade. */
export function isYourMove(trade: {
  nextAction: { actor?: string | null; action: string };
  viewerRole: string;
}): boolean {
  return trade.nextAction.action !== 'NONE' && trade.nextAction.actor === trade.viewerRole;
}

/** Steps of a trade's progress (meetup trades; protected trades show the Phase 9 steps). */
export interface TradeStepView {
  key: string;
  title: string;
  hint: string;
  state: 'done' | 'current' | 'todo' | 'skipped';
  marks: { who: string; done: boolean; at?: string | null }[];
  at?: string | null;
}

export interface TradeStepsInput {
  status: string;
  viewerRole: OfferRole;
  counterpartyName: string;
  meetup: boolean;
  buyerMarkedMeetup: boolean;
  sellerMarkedMeetup: boolean;
  buyerConfirmedAt?: string | null;
  sellerConfirmedAt?: string | null;
  protectionEnabled: boolean;
  paymentStatus?: string | null;
  paymentSecuredAt?: string | null;
  payoutReleasedAt?: string | null;
  shippedAt?: string | null;
  disputeOpenedAt?: string | null;
  disputeResolvedAt?: string | null;
  disputed: boolean;
}

const SECURED_OR_LATER = new Set([
  'SECURED',
  'PAYOUT_PENDING',
  'PAID_OUT',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

/** The progress steps of a trade (web: `TradeStepsComponent`). */
export function tradeSteps(trade: TradeStepsInput): TradeStepView[] {
  if (trade.protectionEnabled && !trade.meetup) {
    return protectedSteps(trade);
  }
  const buyer = trade.viewerRole === 'BUYER';
  const other = trade.counterpartyName;
  const cancelled = trade.status === 'CANCELLED';
  const completed = trade.status === 'COMPLETED';
  const meMeetup = buyer ? trade.buyerMarkedMeetup : trade.sellerMarkedMeetup;
  const otherMeetup = buyer ? trade.sellerMarkedMeetup : trade.buyerMarkedMeetup;
  const meConfirmed = (buyer ? trade.buyerConfirmedAt : trade.sellerConfirmedAt) ?? null;
  const otherConfirmed = (buyer ? trade.sellerConfirmedAt : trade.buyerConfirmedAt) ?? null;
  const confirmedBoth = !!meConfirmed && !!otherConfirmed;
  const open = !cancelled && !completed;
  return [
    {
      key: 'accepted',
      title: 'Offer accepted',
      hint: 'You agreed on the deal.',
      state: 'done',
      marks: [],
    },
    {
      key: 'meetup',
      title: 'In-person meetup',
      hint: 'Optional: both of you mark that you meet in person.',
      state: trade.meetup ? 'done' : open ? (meMeetup ? 'todo' : 'current') : 'skipped',
      marks: [
        { who: 'You', done: meMeetup },
        { who: other, done: otherMeetup },
      ],
    },
    {
      key: 'confirmed',
      title: 'Exchange confirmed',
      hint: 'After the exchange, both of you confirm it.',
      state: confirmedBoth ? 'done' : open ? (meConfirmed ? 'todo' : 'current') : 'skipped',
      marks: [
        { who: 'You', done: !!meConfirmed, at: meConfirmed },
        { who: other, done: !!otherConfirmed, at: otherConfirmed },
      ],
    },
    {
      key: 'completed',
      title: cancelled ? 'Cancelled' : 'Completed',
      hint: cancelled
        ? 'The trade was cancelled.'
        : 'The cards leave the inventories; you can rate each other.',
      state: completed ? 'done' : cancelled ? 'skipped' : 'todo',
      marks: [],
    },
  ];
}

function protectedSteps(trade: TradeStepsInput): TradeStepView[] {
  const buyer = trade.viewerRole === 'BUYER';
  const other = trade.counterpartyName;
  const status = trade.status;
  const cancelled = status === 'CANCELLED';
  const completed = status === 'COMPLETED';
  const secured = !!trade.paymentStatus && SECURED_OR_LATER.has(trade.paymentStatus);
  const shipped = !!trade.shippedAt;
  const received = completed || status === 'RECEIVED';
  const state = (done: boolean, current: boolean): TradeStepView['state'] =>
    done ? 'done' : cancelled ? 'skipped' : current ? 'current' : 'todo';
  return [
    {
      key: 'accepted',
      title: 'Offer accepted',
      hint: 'You agreed on the deal with payment protection.',
      state: 'done',
      marks: [],
    },
    {
      key: 'paid',
      title: 'Payment secured',
      hint: buyer
        ? 'You pay; the payment provider holds the money.'
        : `${other} pays; the payment provider holds the money.`,
      state: state(secured, status === 'AWAITING_PAYMENT'),
      marks: [],
      at: trade.paymentSecuredAt ?? null,
    },
    {
      key: 'shipped',
      title: 'Shipped',
      hint: buyer ? `${other} ships the card with tracking.` : 'You ship the card with tracking.',
      state: state(shipped, status === 'PAID'),
      marks: [],
      at: trade.shippedAt ?? null,
    },
    trade.disputed
      ? {
          key: 'dispute',
          title: 'Dispute',
          hint: trade.disputeResolvedAt
            ? 'An OrenjiTrade admin decided.'
            : 'An OrenjiTrade admin reviews it; the payout is on hold.',
          state: trade.disputeResolvedAt ? 'done' : 'current',
          marks: [],
          at: trade.disputeOpenedAt ?? null,
        }
      : {
          key: 'received',
          title: 'Received',
          hint: buyer
            ? 'You confirm the card arrived as described.'
            : `${other} confirms the card arrived.`,
          state: state(received, status === 'SHIPPED'),
          marks: [],
        },
    {
      key: 'completed',
      title: cancelled ? 'Cancelled' : 'Payout released',
      hint: cancelled
        ? 'The trade was cancelled.'
        : buyer
          ? `The payout goes to ${other}; you can rate each other.`
          : 'Your payout is released; you can rate each other.',
      state: completed ? 'done' : cancelled ? 'skipped' : 'todo',
      marks: [],
      at: trade.payoutReleasedAt ?? null,
    },
  ];
}
