import { AUDIT_LABELS, auditLabel } from '../audit/audit-entries';

/** Account statuses as the admin API reports them. */
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETION_REQUESTED' | 'DELETED';

export const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  'ACTIVE',
  'SUSPENDED',
  'DELETION_REQUESTED',
  'DELETED',
];

export const STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DELETION_REQUESTED: 'Deletion pending',
  DELETED: 'Deleted',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as AccountStatus] ?? status;
}

/** Human wording of audit actions (board A23's, one source: `audit/audit-entries.ts`). */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = AUDIT_LABELS;

export function auditActionLabel(action: string): string {
  return auditLabel(action);
}

export const CONSENT_LABELS: Record<string, string> = {
  TERMS: 'Terms of Service',
  PRIVACY: 'Privacy Policy',
  COMMUNITY_GUIDELINES: 'Community Guidelines',
  MARKETPLACE_POLICY: 'Marketplace Policy',
  PAYMENT_PROTECTION: 'Payment Protection',
  REFUND_DISPUTE: 'Refund and Dispute',
  COOKIES: 'Cookie Policy',
  ACCEPTABLE_USE: 'Acceptable Use',
  AGE_CONFIRMATION: 'Age confirmation (18+)',
};

/** Compact one-line summary of an audit entry's details object. */
export function summarizeDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details) {
    return '';
  }
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ');
}

/** The legal documents of protected payments (ADR 0018): listed only while the flag is on. */
const PAYMENT_DOCUMENTS: readonly string[] = ['PAYMENT_PROTECTION', 'REFUND_DISPUTE'];

/**
 * An account's consents as the account page lists them (spec 15.5): the Payment Protection and
 * Refund lines only while `protectedPayments` is on.
 */
export function visibleConsents<T extends { documentType?: string | null }>(
  consents: readonly T[],
  paymentsOn: boolean,
): T[] {
  return consents.filter(
    (consent) => paymentsOn || !PAYMENT_DOCUMENTS.includes(consent.documentType ?? ''),
  );
}
