import type { IconName } from '@/src/components/ui/EmptyState';
import type { StatusInfo } from '@/src/features/offers/offerLabels';
import { formatMoney } from '@/src/lib/catalog';
import { formatDateTime } from '@/src/lib/dates';

/**
 * Display vocabulary of payment protection (Phase 9 contract and the API's documented
 * deviations; mirror of the web's `shared/payments/payment-labels.ts`): payment, dispute and
 * payout-account statuses, dispute reasons, evidence kinds, the dispute timeline, the limits the
 * API enforces and the explanatory copy. The wording is always "payment protection" /
 * "protected payment", never "escrow": OrenjiTrade is an intermediary and the payment provider
 * holds the funds until the buyer confirms receipt.
 */

export type PaymentStatus =
  | 'REQUIRES_ACTION'
  | 'SECURED'
  | 'PAYOUT_PENDING'
  | 'PAID_OUT'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'FAILED'
  | 'CANCELLED';

export type DisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'FROZEN'
  | 'RESOLVED_BUYER'
  | 'RESOLVED_SELLER'
  | 'RESOLVED_SPLIT'
  | 'CLOSED';

export type DisputeReason =
  'NOT_RECEIVED' | 'NOT_AS_DESCRIBED' | 'COUNTERFEIT' | 'DAMAGED' | 'OTHER';
export type EvidenceKind = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'TRACKING' | 'VIDEO';
export type SellerAccountStatus = 'NOT_STARTED' | 'PENDING' | 'ACTIVE' | 'RESTRICTED';

/** Limits enforced by the API (`DisputeService`, `PaymentRequests`). */
export const DISPUTE_TEXT_MAX = 2000;
export const SHIP_CARRIER_MAX = 80;
export const SHIP_TRACKING_MAX = 100;
export const SHIP_NOTES_MAX = 500;
export const EVIDENCE_PER_PARTY = 10;
export const EVIDENCE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const EVIDENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** A description needs a few words: at least 10 characters besides spaces. */
export const DISPUTE_DESCRIPTION_MIN = 10;

/** The explanatory copy shown wherever a collector chooses or uses payment protection. */
export const PROTECTION_COPY = {
  title: 'Payment protection',
  short:
    'Pay through OrenjiTrade: the payment provider holds the money until you confirm the card arrived.',
  steps: [
    'The buyer pays through our payment provider. OrenjiTrade never sees card details.',
    'The provider holds the money while the seller ships the card with tracking.',
    'The buyer confirms receipt, then the payout is released to the seller.',
    'Something wrong? The buyer opens a dispute before the window closes and the payout stays on hold until an OrenjiTrade admin decides.',
  ],
  intermediary:
    'OrenjiTrade is an intermediary: it does not hold the money itself. A small platform fee is deducted from the seller’s payout.',
} as const;

export const PAYMENT_STATUS_INFO: Record<PaymentStatus, StatusInfo> = {
  REQUIRES_ACTION: { label: 'Waiting for payment', icon: 'timer-sand', tone: 'live' },
  SECURED: { label: 'Payment secured', icon: 'shield-check-outline', tone: 'info' },
  PAYOUT_PENDING: { label: 'Payout on its way', icon: 'send-clock-outline', tone: 'info' },
  PAID_OUT: { label: 'Paid out', icon: 'piggy-bank-outline', tone: 'success' },
  REFUNDED: { label: 'Refunded', icon: 'cash-refund', tone: 'muted' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', icon: 'cash-refund', tone: 'info' },
  FAILED: { label: 'Payment failed', icon: 'alert-circle-outline', tone: 'danger' },
  CANCELLED: { label: 'Payment cancelled', icon: 'block-helper', tone: 'muted' },
};

export function paymentStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    PAYMENT_STATUS_INFO[status as PaymentStatus] ?? {
      label: status ?? '—',
      icon: 'cash',
      tone: 'info',
    }
  );
}

export const DISPUTE_STATUS_INFO: Record<DisputeStatus, StatusInfo> = {
  OPEN: { label: 'Open', icon: 'gavel', tone: 'live' },
  UNDER_REVIEW: { label: 'Under review', icon: 'text-search', tone: 'info' },
  FROZEN: { label: 'On hold', icon: 'snowflake', tone: 'danger' },
  RESOLVED_BUYER: {
    label: 'Resolved for the buyer',
    icon: 'check-decagram-outline',
    tone: 'success',
  },
  RESOLVED_SELLER: {
    label: 'Resolved for the seller',
    icon: 'check-decagram-outline',
    tone: 'success',
  },
  RESOLVED_SPLIT: {
    label: 'Resolved with a split',
    icon: 'check-decagram-outline',
    tone: 'success',
  },
  CLOSED: { label: 'Closed', icon: 'lock-outline', tone: 'muted' },
};

export function disputeStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    DISPUTE_STATUS_INFO[status as DisputeStatus] ?? {
      label: status ?? '—',
      icon: 'gavel',
      tone: 'info',
    }
  );
}

/** Whether a dispute still waits for a decision (OPEN, UNDER_REVIEW or FROZEN). */
export function isOpenDispute(status: string | null | undefined): boolean {
  return status === 'OPEN' || status === 'UNDER_REVIEW' || status === 'FROZEN';
}

export const DISPUTE_REASONS: readonly { value: DisputeReason; label: string; hint: string }[] = [
  {
    value: 'NOT_RECEIVED',
    label: 'The card never arrived',
    hint: 'Nothing arrived, or the tracking shows a problem.',
  },
  {
    value: 'NOT_AS_DESCRIBED',
    label: 'Not as described',
    hint: 'Wrong card, printing, language or a worse condition than listed.',
  },
  {
    value: 'DAMAGED',
    label: 'Damaged in transit',
    hint: 'The card arrived bent, creased or wet.',
  },
  {
    value: 'COUNTERFEIT',
    label: 'Counterfeit',
    hint: 'You believe the card is not authentic.',
  },
  { value: 'OTHER', label: 'Something else', hint: 'Explain what happened below.' },
];

export function disputeReasonLabel(reason: string | null | undefined): string {
  return DISPUTE_REASONS.find((entry) => entry.value === reason)?.label ?? reason ?? '—';
}

export const EVIDENCE_KIND_INFO: Record<EvidenceKind, { label: string; icon: IconName }> = {
  TEXT: { label: 'Statement', icon: 'note-text-outline' },
  IMAGE: { label: 'Photo', icon: 'image-outline' },
  DOCUMENT: { label: 'Document', icon: 'file-pdf-box' },
  TRACKING: { label: 'Tracking', icon: 'truck-outline' },
  VIDEO: { label: 'Video', icon: 'video-outline' },
};

export function evidenceKindInfo(kind: string | null | undefined): {
  label: string;
  icon: IconName;
} {
  return EVIDENCE_KIND_INFO[kind as EvidenceKind] ?? { label: 'Evidence', icon: 'paperclip' };
}

export const SELLER_ACCOUNT_INFO: Record<SellerAccountStatus, StatusInfo> = {
  NOT_STARTED: { label: 'Not set up', icon: 'bank-outline', tone: 'muted' },
  PENDING: { label: 'Verification pending', icon: 'timer-sand', tone: 'live' },
  ACTIVE: { label: 'Ready for payouts', icon: 'check-decagram', tone: 'success' },
  RESTRICTED: { label: 'Action needed', icon: 'alert-outline', tone: 'danger' },
};

export function sellerAccountInfo(status: string | null | undefined): StatusInfo {
  return SELLER_ACCOUNT_INFO[status as SellerAccountStatus] ?? SELLER_ACCOUNT_INFO.NOT_STARTED;
}

/** What each payout-account status means and what to do (web: Settings → Payouts). */
export const SELLER_ACCOUNT_TEXT: Record<
  SellerAccountStatus,
  { lead: string; action: string | null }
> = {
  NOT_STARTED: {
    lead: 'Set up payouts to sell with payment protection. The payment provider checks your identity and bank details; OrenjiTrade never sees them.',
    action: 'Set up payouts',
  },
  PENDING: {
    lead: 'The payment provider is checking your details. Buyers can pay you once it is done.',
    action: 'Continue the setup',
  },
  ACTIVE: {
    lead: 'Your payouts are ready: buyers can pay you with payment protection, and each payout reaches you once the buyer confirms receipt.',
    action: null,
  },
  RESTRICTED: {
    lead: 'The payment provider needs more information before it can pay you out.',
    action: 'Update your details',
  },
};

export function sellerAccountText(status: string | null | undefined): {
  lead: string;
  action: string | null;
} {
  return SELLER_ACCOUNT_TEXT[status as SellerAccountStatus] ?? SELLER_ACCOUNT_TEXT.NOT_STARTED;
}

/** Name of a payment provider for people (the local fake is never presented as real). */
export function providerLabel(provider: string | null | undefined): string {
  switch (provider) {
    case 'fake':
      return 'Local test provider';
    case 'stripe':
      return 'Stripe';
    default:
      return provider ?? '—';
  }
}

/** A money amount with its currency (`$40.00`), `—` when unknown. */
export function money(amount: number | null | undefined, currency: string | null | undefined) {
  return formatMoney(amount, currency || 'CAD') ?? '—';
}

/** Human size of a file (`1.2 MB`). */
export function fileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Role = 'BUYER' | 'SELLER' | 'ADMIN' | string;

function actorOf(
  role: Role | null | undefined,
  viewer: Role | null | undefined,
  names: { BUYER: string; SELLER: string }
): string {
  if (!role || role === 'ADMIN' || role === 'PLATFORM') {
    return 'OrenjiTrade';
  }
  if (role === viewer) {
    return 'You';
  }
  return role === 'BUYER' ? names.BUYER : role === 'SELLER' ? names.SELLER : 'OrenjiTrade';
}

export const DISPUTE_EVENT_ICONS: Record<string, IconName> = {
  OPENED: 'gavel',
  EVIDENCE_ADDED: 'paperclip',
  MESSAGE_POSTED: 'message-text-outline',
  FROZEN: 'snowflake',
  UNFROZEN: 'lock-open-outline',
  NOTE_ADDED: 'note-outline',
  UNDER_REVIEW: 'text-search',
  RESOLVED: 'check-decagram-outline',
};

/** A dispute timeline entry in words (`viewer` is the reader's side). */
export function disputeEventLabel(
  event: { event: string; actorRole?: string | null; details?: Record<string, unknown> | null },
  viewer: Role | null | undefined,
  names: { BUYER: string; SELLER: string },
  currency?: string | null
): string {
  const actor = actorOf(event.actorRole, viewer, names);
  const details = event.details ?? {};
  switch (event.event) {
    case 'OPENED':
      return `${actor} opened the dispute: ${disputeReasonLabel(String(details['reason'] ?? ''))}`;
    case 'EVIDENCE_ADDED':
      return `${actor} added evidence (${evidenceKindInfo(String(details['kind'] ?? '')).label.toLowerCase()})`;
    case 'MESSAGE_POSTED':
      return `${actor} posted a message`;
    case 'FROZEN':
      return 'OrenjiTrade put the dispute on hold';
    case 'UNFROZEN':
      return 'OrenjiTrade lifted the hold';
    case 'NOTE_ADDED':
      return 'OrenjiTrade added an internal note';
    case 'UNDER_REVIEW':
      return 'OrenjiTrade started reviewing the dispute';
    case 'RESOLVED': {
      const outcome = String(details['outcome'] ?? '');
      const refund = Number(details['refundAmount'] ?? 0);
      const refundText =
        refund > 0
          ? ` with a refund of ${money(refund, currency ?? String(details['currency'] ?? ''))}`
          : '';
      if (outcome === 'BUYER') {
        return `OrenjiTrade decided for the buyer${refundText}`;
      }
      if (outcome === 'SELLER') {
        return 'OrenjiTrade decided for the seller: the payout is released';
      }
      return `OrenjiTrade split the payment${refundText}`;
    }
    default:
      return event.event.replace(/_/g, ' ').toLowerCase();
  }
}

/** The end of a dispute window in words, or `null`. */
export function windowEnd(value: string | null | undefined): string | null {
  return value ? formatDateTime(value) || null : null;
}

/**
 * Local check of a photo before it is added as evidence: JPEG, PNG or WebP up to 8 MB (the API
 * re-encodes it as JPEG without metadata). The size is checked when the picker reports it.
 */
export function evidencePhotoProblem(photo: {
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  if (photo.size === 0) {
    return 'That file is empty.';
  }
  const type = (photo.mimeType ?? 'image/jpeg').toLowerCase();
  if (!(EVIDENCE_IMAGE_TYPES as readonly string[]).includes(type)) {
    return 'Use a photo (JPEG, PNG or WebP).';
  }
  if (typeof photo.size === 'number' && photo.size > EVIDENCE_IMAGE_MAX_BYTES) {
    return 'Photos can be at most 8 MB.';
  }
  return null;
}

/** One row of a trade's payment card. */
export interface PaymentRow {
  key: string;
  label: string;
  value: string;
  strong?: boolean;
}

/**
 * The rows of a trade's payment card (web: `TradePaymentCardComponent`): what the buyer pays,
 * the platform fee taken from the payout, a refund, and the payout (released, or what the seller
 * receives). Nothing is paid out of a refunded, cancelled or failed payment.
 */
export function paymentRows(
  payment: {
    status: string;
    amount: number;
    currency: string;
    platformFee?: number;
    sellerAmount?: number;
    refundedAmount?: number;
    payoutAmount?: number | null;
    payoutReleasedAt?: string | null;
  },
  viewerRole: string
): PaymentRow[] {
  const seller = viewerRole === 'SELLER';
  const rows: PaymentRow[] = [
    {
      key: 'amount',
      label: seller ? 'Buyer pays' : 'You pay',
      value: money(payment.amount, payment.currency),
    },
  ];
  const settledWithoutPayout = ['REFUNDED', 'CANCELLED', 'FAILED'].includes(payment.status);
  if (payment.platformFee !== undefined && !settledWithoutPayout) {
    rows.push({
      key: 'fee',
      label: 'Platform fee (from the payout)',
      value: money(payment.platformFee, payment.currency),
    });
  }
  if ((payment.refundedAmount ?? 0) > 0) {
    rows.push({
      key: 'refunded',
      label: seller ? 'Refunded to the buyer' : 'Refunded to you',
      value: money(payment.refundedAmount, payment.currency),
    });
  }
  if (
    payment.payoutReleasedAt &&
    payment.payoutAmount !== null &&
    payment.payoutAmount !== undefined
  ) {
    rows.push({
      key: 'payout',
      label: seller ? 'Payout released to you' : 'Payout released to the seller',
      value: money(payment.payoutAmount, payment.currency),
      strong: true,
    });
  } else if (payment.sellerAmount !== undefined && !settledWithoutPayout) {
    rows.push({
      key: 'seller-amount',
      label: seller ? 'You receive' : 'Seller receives',
      value: money(payment.sellerAmount, payment.currency),
      strong: true,
    });
  }
  return rows;
}
