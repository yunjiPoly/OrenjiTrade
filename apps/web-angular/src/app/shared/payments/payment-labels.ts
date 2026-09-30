import type { StatusInfo } from '../offers/offer-labels';
import { formatPrice } from '../inventory/inventory-labels';

/**
 * Display vocabulary of payment protection (Phase 9 contract and the API's documented
 * deviations): payment, dispute, payout-account and webhook statuses, dispute reasons, evidence
 * kinds, the dispute timeline, the limits the API enforces and the explanatory copy. The wording
 * is always "payment protection" / "protected payment": OrenjiTrade is an intermediary and the
 * payment provider holds the funds until the buyer confirms receipt.
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

export type WebhookStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';

/** Limits enforced by the API (`DisputeService`, `PaymentRequests`). */
export const DISPUTE_TEXT_MAX = 2000;
export const DISPUTE_NOTE_MAX = 2000;
export const RESOLUTION_NOTE_MAX = 1000;
export const REFUND_REASON_MAX = 500;
export const SHIP_CARRIER_MAX = 80;
export const SHIP_TRACKING_MAX = 100;
export const SHIP_NOTES_MAX = 500;
export const EVIDENCE_PER_PARTY = 10;
export const EVIDENCE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const EVIDENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const EVIDENCE_DOCUMENT_TYPES = ['application/pdf'] as const;
export const EVIDENCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

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
  REQUIRES_ACTION: { label: 'Waiting for payment', icon: 'pending', tone: 'live' },
  SECURED: { label: 'Payment secured', icon: 'verified_user', tone: 'info' },
  PAYOUT_PENDING: { label: 'Payout on its way', icon: 'schedule_send', tone: 'info' },
  PAID_OUT: { label: 'Paid out', icon: 'savings', tone: 'success' },
  REFUNDED: { label: 'Refunded', icon: 'currency_exchange', tone: 'muted' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', icon: 'currency_exchange', tone: 'info' },
  FAILED: { label: 'Payment failed', icon: 'error', tone: 'danger' },
  CANCELLED: { label: 'Payment cancelled', icon: 'block', tone: 'muted' },
};

export function paymentStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    PAYMENT_STATUS_INFO[status as PaymentStatus] ?? {
      label: status ?? '—',
      icon: 'payments',
      tone: 'info',
    }
  );
}

export const DISPUTE_STATUS_INFO: Record<DisputeStatus, StatusInfo> = {
  OPEN: { label: 'Open', icon: 'gavel', tone: 'live' },
  UNDER_REVIEW: { label: 'Under review', icon: 'manage_search', tone: 'info' },
  FROZEN: { label: 'On hold', icon: 'ac_unit', tone: 'danger' },
  RESOLVED_BUYER: { label: 'Resolved for the buyer', icon: 'task_alt', tone: 'success' },
  RESOLVED_SELLER: { label: 'Resolved for the seller', icon: 'task_alt', tone: 'success' },
  RESOLVED_SPLIT: { label: 'Resolved with a split', icon: 'task_alt', tone: 'success' },
  CLOSED: { label: 'Closed', icon: 'lock', tone: 'muted' },
};

export const DISPUTE_STATUSES = Object.keys(DISPUTE_STATUS_INFO) as DisputeStatus[];

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

export const EVIDENCE_KIND_INFO: Record<EvidenceKind, { label: string; icon: string }> = {
  TEXT: { label: 'Statement', icon: 'notes' },
  IMAGE: { label: 'Photo', icon: 'image' },
  DOCUMENT: { label: 'Document', icon: 'picture_as_pdf' },
  TRACKING: { label: 'Tracking', icon: 'local_shipping' },
  VIDEO: { label: 'Video', icon: 'videocam' },
};

export function evidenceKindInfo(kind: string | null | undefined): { label: string; icon: string } {
  return EVIDENCE_KIND_INFO[kind as EvidenceKind] ?? { label: 'Evidence', icon: 'attach_file' };
}

export const SELLER_ACCOUNT_INFO: Record<SellerAccountStatus, StatusInfo> = {
  NOT_STARTED: { label: 'Not set up', icon: 'account_balance', tone: 'muted' },
  PENDING: { label: 'Verification pending', icon: 'hourglass_top', tone: 'live' },
  ACTIVE: { label: 'Ready for payouts', icon: 'verified', tone: 'success' },
  RESTRICTED: { label: 'Action needed', icon: 'warning', tone: 'danger' },
};

export function sellerAccountInfo(status: string | null | undefined): StatusInfo {
  return SELLER_ACCOUNT_INFO[status as SellerAccountStatus] ?? SELLER_ACCOUNT_INFO.NOT_STARTED;
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

export const WEBHOOK_STATUS_INFO: Record<WebhookStatus, StatusInfo> = {
  RECEIVED: { label: 'Received', icon: 'inbox', tone: 'live' },
  PROCESSED: { label: 'Processed', icon: 'check_circle', tone: 'success' },
  IGNORED: { label: 'Ignored', icon: 'do_not_disturb_on', tone: 'muted' },
  FAILED: { label: 'Failed', icon: 'error', tone: 'danger' },
};

export function webhookStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    WEBHOOK_STATUS_INFO[status as WebhookStatus] ?? {
      label: status ?? '—',
      icon: 'webhook',
      tone: 'info',
    }
  );
}

/** A money amount with its currency (`$40.00`), `—` when unknown. */
export function money(amount: number | null | undefined, currency: string | null | undefined) {
  return formatPrice(amount, currency) ?? '—';
}

/** What is still refundable of a payment (amount − refunded), never below 0, to the cent. */
export function refundableOf(payment: { amount: number; refundedAmount?: number | null }): number {
  const left = Math.round((payment.amount - (payment.refundedAmount ?? 0)) * 100) / 100;
  return Math.max(0, left);
}

type Role = 'BUYER' | 'SELLER' | 'ADMIN' | string;

function actorOf(
  role: Role | null | undefined,
  viewer: Role | null | undefined,
  names: { BUYER: string; SELLER: string },
): string {
  if (!role || role === 'ADMIN' || role === 'PLATFORM') {
    return 'OrenjiTrade';
  }
  if (role === viewer) {
    return 'You';
  }
  return role === 'BUYER' ? names.BUYER : role === 'SELLER' ? names.SELLER : 'OrenjiTrade';
}

export const DISPUTE_EVENT_ICONS: Record<string, string> = {
  OPENED: 'gavel',
  EVIDENCE_ADDED: 'attach_file',
  MESSAGE_POSTED: 'chat',
  FROZEN: 'ac_unit',
  UNFROZEN: 'lock_open',
  NOTE_ADDED: 'sticky_note_2',
  UNDER_REVIEW: 'manage_search',
  RESOLVED: 'task_alt',
};

/** A dispute timeline entry in words (`viewer` is the reader's side; admins read as `null`). */
export function disputeEventLabel(
  event: { event: string; actorRole?: string | null; details?: Record<string, unknown> | null },
  viewer: Role | null | undefined,
  names: { BUYER: string; SELLER: string },
  currency?: string | null,
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

/** Payment events of the admin history in words. */
export function paymentEventLabel(event: string): string {
  const labels: Record<string, string> = {
    CREATED: 'Checkout created',
    RESTARTED: 'Checkout restarted',
    SECURED: 'Payment secured by the provider',
    FAILED: 'Payment failed',
    CANCELLED: 'Checkout cancelled',
    SHIPPED: 'Seller shipped the card',
    RECEIPT_CONFIRMED: 'Buyer confirmed receipt',
    PAYOUT_RELEASED: 'Payout released',
    PAYOUT_PAID: 'Payout paid by the provider',
    PAYOUT_FROZEN: 'Payout frozen by a dispute',
    REFUNDED: 'Refund issued',
    AUTO_REFUNDED: 'Refunded automatically (late payment)',
    RELEASE_REMINDER: 'Buyer reminded to confirm receipt',
    DISPUTE_RESOLVED: 'Dispute resolved',
  };
  return labels[event] ?? event.replace(/_/g, ' ').toLowerCase();
}

/** A date and time for people (`Oct 6, 2026, 11:44 a.m.`); empty when missing or invalid. */
export function formatDateTime(value: string | null | undefined, locale = 'en-CA'): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

/**
 * Local check of an evidence file before uploading: kind from the type (IMAGE for JPEG, PNG and
 * WebP up to 8 MB; DOCUMENT for PDF up to 10 MB). Returns the kind, or the reason it is refused.
 */
export function evidenceFileKind(
  file: Pick<File, 'type' | 'size'>,
): { kind: 'IMAGE' | 'DOCUMENT' } | { error: string } {
  if (file.size === 0) {
    return { error: 'That file is empty.' };
  }
  if ((EVIDENCE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return file.size > EVIDENCE_IMAGE_MAX_BYTES
      ? { error: 'Photos can be at most 8 MB.' }
      : { kind: 'IMAGE' };
  }
  if ((EVIDENCE_DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return file.size > EVIDENCE_DOCUMENT_MAX_BYTES
      ? { error: 'PDF documents can be at most 10 MB.' }
      : { kind: 'DOCUMENT' };
  }
  return { error: 'Use a photo (JPEG, PNG or WebP) or a PDF document.' };
}
