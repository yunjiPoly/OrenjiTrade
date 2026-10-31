import type { AuditLogEntry } from '@orenji/api-client';
import { ROLE_LABELS, type StaffRole } from '../console/admin-nav';
import { gameName } from '../console/console-labels';

/** One group of the Action filter (board A23), every action the API writes. */
export interface AuditActionGroup {
  label: string;
  actions: readonly string[];
}

/**
 * Every action the API writes, grouped by area (spec 15.5: "labels for every action the API
 * writes", the seven of today without one included). The words are board A23's.
 */
export const AUDIT_ACTION_GROUPS: readonly AuditActionGroup[] = [
  {
    label: 'Accounts',
    actions: [
      'user.suspend',
      'user.unsuspend',
      'user.suspension.expired',
      'user.ban',
      'user.roles.update',
      'user.handle.change',
      'consent.accept',
      'account.deletion.request',
      'account.deletion.cancel',
      'account.deletion.complete',
    ],
  },
  {
    label: 'Moderation',
    actions: [
      'REPORT_RESOLVED',
      'report.assign',
      'report.note',
      'report.conversation.view',
      'moderation.flag.resolve',
      'moderation.rule.create',
      'moderation.rule.update',
      'moderation.rule.delete',
      'rating.hide',
      'rating.unhide',
      'reference.hide',
      'reference.unhide',
    ],
  },
  {
    label: 'Community',
    actions: [
      'community.post.delete',
      'community.reply.delete',
      'community.post.remove',
      'community.reply.remove',
      'community.channel.create',
      'community.channel.update',
    ],
  },
  {
    label: 'Listings',
    actions: [
      'listings.pause',
      'listings.resume',
      'listing.restore',
      'listing.hide',
      'binder.unpublish',
    ],
  },
  {
    label: 'Catalog',
    actions: [
      'catalog.sync.request',
      'card.create',
      'card.update',
      'card_printing.create',
      'card_printing.update',
      'card_set.create',
      'card_set.update',
      'game.create',
      'game.update',
      'card_images.cache.clear',
      'card_images.cache.reconcile',
      'card_images.cache.evict',
    ],
  },
  {
    label: 'Settings',
    actions: [
      'usage_limit.update',
      'inventory.import.settings.update',
      'wishlist.settings.update',
      'delist_policy.update',
      'feature_flag.update',
      'region.country.update',
    ],
  },
  { label: 'Notifications', actions: ['notification.broadcast'] },
];

/** The PAYMENTS group's actions, listed only while `protectedPayments` is on (ADR 0018). */
export const PAYMENT_ACTION_GROUP: AuditActionGroup = {
  label: 'Payments',
  actions: [
    'dispute.freeze',
    'dispute.unfreeze',
    'dispute.note',
    'dispute.resolve',
    'payment.refund',
    'payments.settings.update',
  ],
};

/** Board A23's words for each action (older rows of removed features keep a label too). */
export const AUDIT_LABELS: Readonly<Record<string, string>> = {
  'user.suspend': 'Suspended an account',
  'user.unsuspend': 'Lifted a suspension',
  'user.suspension.expired': 'Suspension ended',
  'user.ban': 'Banned an account',
  'user.roles.update': 'Changed roles',
  'user.handle.change': 'Changed a handle',
  'consent.accept': 'Accepted a legal document',
  'account.deletion.request': 'Requested account deletion',
  'account.deletion.cancel': 'Cancelled account deletion',
  'account.deletion.complete': 'Completed account deletion',
  REPORT_RESOLVED: 'Resolved a report',
  'report.assign': 'Assigned a report',
  'report.note': 'Added a moderator note',
  'report.conversation.view': 'Viewed a reported conversation',
  'moderation.flag.resolve': 'Resolved a flag',
  'moderation.rule.create': 'Created a moderation rule',
  'moderation.rule.update': 'Changed a moderation rule',
  'moderation.rule.delete': 'Deleted a moderation rule',
  'rating.hide': 'Hid a rating',
  'rating.unhide': 'Restored a rating',
  'reference.hide': 'Hid a reference',
  'reference.unhide': 'Restored a reference',
  'community.post.delete': 'Deleted a post',
  'community.reply.delete': 'Deleted a reply',
  'community.post.remove': 'Removed a post',
  'community.reply.remove': 'Removed a reply',
  'community.channel.create': 'Created a room',
  'community.channel.update': 'Changed a room',
  'listings.pause': 'Paused listings',
  'listings.resume': 'Resumed listings',
  'listing.restore': 'Restored a listing',
  'listing.hide': 'Hid a listing',
  'binder.unpublish': 'Unpublished a binder',
  'catalog.sync.request': 'Requested a catalog sync',
  'card.create': 'Created a card',
  'card.update': 'Changed a card',
  'card_printing.create': 'Added a printing',
  'card_printing.update': 'Changed a printing',
  'card_set.create': 'Created a card set',
  'card_set.update': 'Changed a card set',
  'game.create': 'Created a game',
  'game.update': 'Changed a game',
  'card_images.cache.clear': 'Cleared card images',
  'card_images.cache.reconcile': 'Checked the card image cache',
  'card_images.cache.evict': 'Removed a card image',
  'usage_limit.update': 'Changed a usage limit',
  'inventory.import.settings.update': 'Changed import limits',
  'wishlist.settings.update': 'Changed wishlist terms',
  'delist_policy.update': 'Changed the auto-delist rules',
  'feature_flag.update': 'Changed a feature flag',
  'region.country.update': 'Moved a country',
  'notification.broadcast': 'Sent an announcement',
  'dispute.freeze': 'Put a dispute on hold',
  'dispute.unfreeze': 'Lifted a dispute hold',
  'dispute.note': 'Added a dispute note',
  'dispute.resolve': 'Resolved a dispute',
  'payment.refund': 'Refunded a payment',
  'payments.settings.update': 'Changed the payment rules',
  // Rows written before the features were removed (ADR 0019) keep a readable label.
  'plan.update': 'Changed a plan',
  'entitlement.grant': 'Granted an entitlement',
  'entitlement.revoke': 'Revoked an entitlement',
  'subscription.cancel': 'Cancelled a subscription',
  'credits.grant': 'Granted or adjusted credits',
  'donation.refund': 'Refunded a donation',
};

/** An action's words; an action without a label reads as its code. */
export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

/** The word under a target (board A23: "Report", "Account", "Moderation flag"). */
const TARGET_TYPES: Readonly<Record<string, string>> = {
  USER: 'Account',
  REPORT: 'Report',
  MODERATION_FLAG: 'Moderation flag',
  MODERATION_RULE: 'Moderation rule',
  RATING: 'Rating',
  REFERENCE: 'Reference',
  COMMUNITY_CHANNEL: 'Room',
  COMMUNITY_POST: 'Community post',
  COMMUNITY_REPLY: 'Community reply',
  INVENTORY_ITEM: 'Listing',
  BINDER: 'Binder',
  CARD: 'Card',
  CARD_PRINTING: 'Printing',
  CARD_SET: 'Card set',
  CARD_IMAGE: 'Card image',
  CARD_IMAGE_CACHE: 'Card image cache',
  CATALOG: 'Catalog sync',
  GAME: 'Game',
  USAGE_LIMIT: 'Usage limit',
  PLATFORM_SETTINGS: 'Setting',
  DELIST_POLICY: 'Auto-delist',
  FEATURE_FLAG: 'Feature flag',
  COUNTRY: 'Country',
  NOTIFICATION_BROADCAST: 'Announcement',
  PAYMENT: 'Payment',
};

export function targetTypeLabel(type: string): string {
  return TARGET_TYPES[type] ?? 'Other';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a target opens in the console, or `null` (a link never carries more than an id). */
export function targetLink(
  entry: AuditLogEntry,
): { path: string[]; query?: Record<string, string> } | null {
  const id = entry.targetId ?? '';
  switch (entry.targetType) {
    case 'USER':
      return UUID.test(id) ? { path: ['/admin/users', id] } : null;
    case 'REPORT':
      return UUID.test(id) ? { path: ['/admin/reports', id] } : null;
    case 'CARD':
      return UUID.test(id) ? { path: ['/admin/cards'], query: { open: id } } : null;
    case 'GAME':
      return id ? { path: ['/admin/games'], query: { game: id } } : null;
    case 'MODERATION_FLAG':
      return { path: ['/admin/moderation'], query: { state: 'ALL' } };
    case 'MODERATION_RULE':
      return { path: ['/admin/moderation'], query: { tab: 'rules' } };
    case 'RATING':
      return { path: ['/admin/ratings'] };
    case 'REFERENCE':
      return { path: ['/admin/ratings'], query: { tab: 'references' } };
    case 'COMMUNITY_CHANNEL':
    case 'COMMUNITY_POST':
    case 'COMMUNITY_REPLY':
      return { path: ['/admin/community'] };
    case 'INVENTORY_ITEM':
      return { path: ['/admin/listings'] };
    case 'BINDER':
      return { path: ['/admin/binders'] };
    case 'CATALOG':
    case 'CARD_IMAGE_CACHE':
    case 'CARD_IMAGE':
      return { path: ['/admin/card-data'] };
    case 'USAGE_LIMIT':
      return { path: ['/admin/usage-limits'] };
    case 'FEATURE_FLAG':
      return { path: ['/admin/feature-flags'] };
    case 'COUNTRY':
      return { path: ['/admin/regions'] };
    case 'DELIST_POLICY':
      return { path: ['/admin/auto-delist-rules'] };
    case 'NOTIFICATION_BROADCAST':
      return { path: ['/admin/notifications'] };
    case 'PLATFORM_SETTINGS':
      return id.startsWith('wishlist')
        ? { path: ['/admin/wishlist'] }
        : { path: ['/admin/import-limits'] };
    default:
      return null;
  }
}

/** The target's readable name: the API's label, never a raw id (spec 15.2). */
export function targetName(entry: AuditLogEntry): string {
  if (entry.targetLabel) {
    return entry.targetLabel;
  }
  const id = entry.targetId ?? '';
  if (!id || UUID.test(id)) {
    return entry.targetType === 'USER' ? 'A deleted account' : targetTypeLabel(entry.targetType);
  }
  return id;
}

/** "Who" (board A23): the name, then "@handle · Super admin"; System; a collector. */
export interface AuditWho {
  name: string;
  sub: string;
  system: boolean;
  initials: string;
}

export function auditWho(entry: AuditLogEntry): AuditWho {
  const actor = entry.actor;
  if (actor.type === 'SYSTEM') {
    return { name: 'System', sub: 'Automatic', system: true, initials: '' };
  }
  const handle = actor.handle ? `@${actor.handle}` : 'A deleted account';
  const role = actor.role ? ROLE_LABELS[actor.role as StaffRole] : 'Collector';
  const name = actor.displayName || (actor.handle ? `@${actor.handle}` : 'Deleted account');
  return {
    name,
    sub: actor.handle ? `${handle} · ${role}` : handle,
    system: false,
    initials: initialsOf(actor.displayName || actor.handle || '?'),
  };
}

export function initialsOf(name: string): string {
  const words = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

const READABLE_KEYS: Readonly<Record<string, string>> = {
  reason: 'reason',
  until: 'until',
  suspendUntil: 'until',
  status: 'status',
  game: 'game',
  mode: 'mode',
  imageMode: 'images',
  audience: 'audience',
  recipients: 'recipients',
  title: 'title',
  handle: 'handle',
  previousHandle: 'was',
  roles: 'roles',
  limitKey: 'limit',
};

function formatDay(value: unknown): string {
  const time = Date.parse(String(value));
  return Number.isFinite(time)
    ? new Date(time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : String(value);
}

function quote(value: unknown): string {
  return `“${String(value)}”`;
}

const DOCUMENTS: Readonly<Record<string, string>> = {
  TERMS: 'Terms of Service',
  PRIVACY: 'Privacy Policy',
  COMMUNITY_GUIDELINES: 'Community Guidelines',
  MARKETPLACE_POLICY: 'Marketplace Policy',
  COOKIES: 'Cookie Policy',
  ACCEPTABLE_USE: 'Acceptable Use',
  AGE_CONFIRMATION: 'Confirmed being 18 or older',
};

const LANGUAGES: Readonly<Record<string, string>> = { en: 'English', fr: 'French' };

/** One line in words for an entry's details (board A23); ids never show. */
export function detailSummary(entry: AuditLogEntry): string {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case 'consent.accept': {
      const type = String(d['documentType'] ?? '');
      const name = DOCUMENTS[type] ?? type;
      return [
        name,
        type !== 'AGE_CONFIRMATION' && d['version'] ? `v${String(d['version'])}` : null,
        d['language'] ? (LANGUAGES[String(d['language'])] ?? String(d['language'])) : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'report.conversation.view':
      return 'Opened the conversation the report came from';
    case 'report.note':
      return 'The note stays with the report; its text is not logged';
    case 'report.assign':
      return d['previousStatus'] === 'OPEN' ? 'Open → Under review' : 'Assigned';
    case 'user.suspension.expired':
      return 'Ended on its end date, at their next sign-in';
    case 'user.suspend':
    case 'listings.pause':
      return [
        d['reason'] ? quote(d['reason']) : null,
        d['until'] || d['suspendUntil']
          ? `until ${formatDay(d['until'] ?? d['suspendUntil'])}`
          : 'no end date',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'usage_limit.update': {
      const before = d['previousMaxValue'] ?? '';
      const after = d['maxValue'] ?? '';
      return before !== '' ? `${String(before)} → ${String(after)}` : `Now ${String(after)}`;
    }
    case 'feature_flag.update':
      return `${d['enabled'] ? 'On' : 'Off'}${
        d['rolloutPercent'] !== undefined ? ` · ${String(d['rolloutPercent'])}%` : ''
      }`;
    case 'region.country.update':
      return `${String(d['previousRegion'] ?? '')} → ${String(d['region'] ?? '')}`.trim();
    case 'catalog.sync.request': {
      const game = String(d['game'] ?? '');
      const mode = d['mode'] === 'FULL' ? 'Full' : 'Incremental';
      const images: Record<string, string> = {
        REFERENCED: 'only images in use',
        ALL: 'all images',
        NONE: 'no images',
        LIMIT: `up to ${String(d['imageLimit'] ?? '')} images`,
      };
      return [gameName(game) ?? game, mode, images[String(d['imageMode'])] ?? null]
        .filter(Boolean)
        .join(' · ');
    }
    case 'card_images.cache.clear': {
      const game = String(d['game'] ?? '');
      const name = game === '*' ? 'Every game' : (gameName(game) ?? game);
      return `${name} · ${String(d['images'] ?? 0)} images`;
    }
    case 'notification.broadcast':
      return `${d['title'] ? quote(d['title']) : 'An announcement'} · ${String(
        d['recipients'] ?? 0,
      )} accounts`;
    case 'user.roles.update':
      return Array.isArray(d['roles']) ? (d['roles'] as string[]).join(', ') : '';
    case 'user.handle.change':
      return d['previousHandle'] ? `@${String(d['previousHandle'])} → @${String(d['handle'])}` : '';
    default:
      return genericSummary(d);
  }
}

function genericSummary(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([key, value]) => {
      if (value === null || value === undefined || value === '' || typeof value === 'object') {
        return false;
      }
      return !UUID.test(String(value)) && !/Id$/.test(key);
    })
    .slice(0, 4)
    .map(([key, value]) => `${READABLE_KEYS[key] ?? key}: ${String(value)}`)
    .join(' · ');
}

/**
 * The details as JSON, with the ids the page knows replaced by names (the actor by its handle, the
 * target by its label): "Ids are shown as handles, report numbers and names."
 */
export function staffJson(entry: AuditLogEntry): string {
  const names = new Map<string, string>();
  if (entry.actor.id && entry.actor.handle) {
    names.set(entry.actor.id, `@${entry.actor.handle}`);
  }
  if (entry.targetId && entry.targetLabel) {
    names.set(entry.targetId, entry.targetLabel);
  }
  return JSON.stringify(
    entry.details ?? {},
    (_key, value: unknown) =>
      typeof value === 'string' && names.has(value) ? names.get(value) : value,
    2,
  );
}
