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

/** Human wording of audit actions; unknown actions are shown as-is. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.suspend': 'Suspended an account',
  'user.unsuspend': 'Lifted a suspension',
  'user.roles.update': 'Changed roles',
  'user.handle.change': 'Changed handle',
  'consent.accept': 'Accepted a legal document',
  'account.deletion.request': 'Requested account deletion',
  'account.deletion.cancel': 'Cancelled account deletion',
  'account.deletion.complete': 'Completed account deletion',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
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
