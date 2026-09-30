import type { AdminTransaction } from '@orenji/api-client';
import {
  PAYMENT_STATUS_INFO,
  PaymentStatus,
  WebhookStatus,
  disputeStatusInfo,
  paymentStatusInfo,
  webhookStatusInfo,
} from '../../../shared/payments/payment-labels';
import { tradeStatusInfo } from '../../../shared/offers/trade-labels';
import type { ChipTone } from '../shared/admin-chip.component';

/** Admin wording and chip tones of protected payments, disputes and webhooks (Phase 9). */

export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_INFO) as PaymentStatus[];
export const WEBHOOK_STATUSES: readonly WebhookStatus[] = [
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED',
];

export function paymentTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'SECURED':
    case 'PAYOUT_PENDING':
      return 'info';
    case 'PAID_OUT':
      return 'success';
    case 'REQUIRES_ACTION':
      return 'primary';
    case 'FAILED':
      return 'danger';
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function disputeTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'OPEN':
      return 'danger';
    case 'UNDER_REVIEW':
      return 'primary';
    case 'FROZEN':
      return 'warning';
    case 'RESOLVED_BUYER':
    case 'RESOLVED_SELLER':
    case 'RESOLVED_SPLIT':
      return 'success';
    default:
      return 'neutral';
  }
}

export function webhookTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'PROCESSED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'IGNORED':
      return 'warning';
    default:
      return 'info';
  }
}

export const paymentLabel = (status: string | null | undefined) => paymentStatusInfo(status).label;
export const disputeLabel = (status: string | null | undefined) => disputeStatusInfo(status).label;
export const webhookLabel = (status: string | null | undefined) => webhookStatusInfo(status).label;
export const tradeLabel = (status: string | null | undefined) => tradeStatusInfo(status).label;

/** The one date that matters for a row, depending on where the transaction stands. */
export function transactionMoment(row: AdminTransaction): { label: string; at: string } {
  if (row.payoutReleasedAt) {
    return { label: 'Payout released', at: row.payoutReleasedAt };
  }
  if (row.paymentStatus === 'REFUNDED' || row.paymentStatus === 'CANCELLED') {
    return {
      label: row.paymentStatus === 'REFUNDED' ? 'Refunded' : 'Cancelled',
      at: row.updatedAt,
    };
  }
  if (row.shippedAt && row.disputeWindowEndsAt) {
    return { label: 'Window ends', at: row.disputeWindowEndsAt };
  }
  if (row.securedAt) {
    return { label: 'Secured', at: row.securedAt };
  }
  return { label: 'Started', at: row.createdAt };
}

/** Admin transaction views (`/admin/transactions?view=`). */
export type TransactionView = 'all' | 'pending-shipment' | 'pending-confirmation';

export function parseTransactionView(value: string | null | undefined): TransactionView {
  return value === 'pending-shipment' || value === 'pending-confirmation' ? value : 'all';
}
