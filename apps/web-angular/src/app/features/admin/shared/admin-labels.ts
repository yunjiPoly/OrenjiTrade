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
  'game.create': 'Created a game',
  'game.update': 'Changed a game',
  'card_set.create': 'Created a card set',
  'card_set.update': 'Changed a card set',
  'card.create': 'Created a card',
  'card.update': 'Changed a card',
  'card_printing.create': 'Added a printing',
  'card_printing.update': 'Changed a printing',
  'catalog.sync.request': 'Requested a catalog sync',
  'feature_flag.update': 'Changed a feature flag',
  'plan.update': 'Changed a plan',
  'usage_limit.update': 'Changed a usage limit',
  'entitlement.grant': 'Granted an entitlement',
  'entitlement.revoke': 'Revoked an entitlement',
  'community.channel.create': 'Created a community channel',
  'community.channel.update': 'Changed a community channel',
  'community.post.remove': 'Removed a community post',
  'community.reply.remove': 'Removed a community reply',
  'moderation.flag.resolve': 'Resolved a moderation flag',
  REPORT_RESOLVED: 'Resolved a collector report',
  'report.assign': 'Assigned a report',
  'report.note': 'Added a moderator note',
  'report.conversation.view': 'Viewed a reported conversation',
  'user.ban': 'Banned an account',
  'rating.hide': 'Hid a rating',
  'rating.unhide': 'Restored a rating',
  'reference.hide': 'Hid a reference',
  'reference.unhide': 'Restored a reference',
  'listings.pause': 'Paused listings',
  'listings.resume': 'Resumed listings',
  'listing.restore': 'Restored a listing',
  'listing.hide': 'Hid a listing',
  'binder.unpublish': 'Unpublished a binder',
  'moderation.rule.create': 'Created a moderation rule',
  'moderation.rule.update': 'Changed a moderation rule',
  'moderation.rule.delete': 'Deleted a moderation rule',
  'notification.broadcast': 'Broadcast a notification',
  'delist_policy.update': 'Changed the auto-delist rules',
  'dispute.freeze': 'Put a dispute on hold',
  'dispute.unfreeze': 'Lifted a dispute hold',
  'dispute.note': 'Added a dispute note',
  'dispute.resolve': 'Resolved a dispute',
  'payment.refund': 'Refunded a payment',
  'payments.settings.update': 'Changed the payment rules',
  'subscription.cancel': 'Cancelled a subscription',
  'credits.grant': 'Granted or adjusted credits',
  'credits.product.update': 'Changed a credit product',
  'credits.settings.update': 'Changed the referral rules',
  'ads.advertiser.create': 'Created an advertiser',
  'ads.advertiser.update': 'Changed an advertiser',
  'ads.campaign.create': 'Created an ad campaign',
  'ads.campaign.update': 'Changed an ad campaign',
  'ads.targeting.update': 'Changed ad targeting',
  'ads.creative.create': 'Added an ad creative',
  'ads.creative.update': 'Changed an ad creative',
  'ads.placement.update': 'Changed an ad placement',
  'donation.refund': 'Refunded a donation',
  'donations.settings.update': 'Changed the accepted donations',
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
