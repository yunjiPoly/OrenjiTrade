import type { AuditLogEntry } from '@orenji/api-client';
import { ROLE_LABELS, type StaffRole } from '../console/admin-nav';
import { gameName, regionName, roomNameOfSlug } from '../console/console-labels';
import { editionLabel, finishLabel, languageLabel } from '../../../shared/catalog/catalog-labels';

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
  previousStatus: 'was',
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
  kind: 'kind',
  scope: 'scope',
  pattern: 'pattern',
  action: 'action',
  active: 'active',
  note: 'note',
  source: 'source',
  subjectType: 'about',
  outcome: 'outcome',
  amount: 'amount',
  currency: 'currency',
  version: 'version',
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

/** Words for the stored enum values the details carry (board A23 reads sentences). */
const VALUE_WORDS: Readonly<Record<string, string>> = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  TEMPORARILY_PUBLIC: 'temporarily public',
  ACTIVE: 'active',
  AGING: 'aging',
  STALE: 'stale',
  HIDDEN: 'hidden',
  ARCHIVED: 'archived',
  DRAFT: 'draft',
  BETA: 'beta',
  DISABLED: 'disabled',
  UNRESPONSIVE: 'unanswered chats',
  REPORT_THRESHOLD: 'reports from several collectors',
  MODERATION: 'a moderator',
  ADMIN: 'staff',
  BANNED_TERM: 'banned term',
  RATE_THRESHOLD: 'unusual posting rate',
  REPEATED_CONTENT: 'repeated content',
  MESSAGE: 'a private message',
  COMMUNITY_POST: 'a post',
  COMMUNITY_REPLY: 'a reply',
  USER: 'an account',
};

/** A stored enum value as words ("TEMPORARILY_PUBLIC" reads "temporarily public"). */
function valueWords(value: unknown): string {
  const text = String(value ?? '');
  if (VALUE_WORDS[text]) {
    return VALUE_WORDS[text];
  }
  return /^[A-Z][A-Z0-9_]+$/.test(text) ? text.replace(/_/g, ' ').toLowerCase() : text;
}

function capitalized(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** The API's name of a value in the details (an id, a region code, a room's slug), if any. */
function labelOf(entry: AuditLogEntry, value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const labels = (entry.detailLabels ?? {}) as Record<string, string>;
  return labels[value] ?? null;
}

/** A platform region by name, never its code (spec 15.2). */
function regionWords(entry: AuditLogEntry, code: unknown): string {
  return labelOf(entry, code) ?? regionName(String(code ?? '')) ?? 'another region';
}

/** A room by name, never its slug ("Americas (North) · Yu-Gi-Oh!"). */
function roomWords(entry: AuditLogEntry, slug: unknown): string {
  return labelOf(entry, slug) ?? roomNameOfSlug(typeof slug === 'string' ? slug : null);
}

/** Staff roles as the console names them ("Moderator"); a collector without one reads so. */
function roleWords(roles: unknown): string {
  if (!Array.isArray(roles)) {
    return '';
  }
  const staff = (roles as string[])
    .filter((role) => role !== 'USER')
    .map((role) => ROLE_LABELS[role as StaffRole] ?? capitalized(valueWords(role)));
  return staff.length ? staff.join(', ') : 'Collector';
}

function plural(count: unknown, one: string, many = `${one}s`): string {
  const n = Number(count ?? 0);
  return `${n} ${n === 1 ? one : many}`;
}

function megabytes(bytes: unknown): string {
  const mb = Number(bytes ?? 0) / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** The import limits' words (board A15), by setting key. */
const IMPORT_SETTINGS: Readonly<Record<string, { label: string; unit: string }>> = {
  'inventory.import.ydk_max_kb': { label: 'Largest .ydk file', unit: 'kB' },
  'inventory.import.ydk_max_lines': { label: 'Most .ydk lines', unit: 'lines' },
  'inventory.import.csv_max_kb': { label: 'Largest CSV file', unit: 'kB' },
  'inventory.import.csv_max_rows': { label: 'Most CSV rows', unit: 'rows' },
  'inventory.import.preview_ttl_minutes': { label: 'Previews kept', unit: 'minutes' },
};

/** The auto-delist thresholds' words (board A17). */
const DELIST_THRESHOLDS: Readonly<Record<string, { label: string; unit: string }>> = {
  agingAfterDays: { label: 'Aging after', unit: 'days' },
  staleAfterDays: { label: 'Stale after', unit: 'days' },
  hiddenAfterDays: { label: 'Hidden after', unit: 'days' },
  warnBeforeHiddenDays: { label: 'Warn before hiding', unit: 'days' },
  unansweredAfterHours: { label: 'Unanswered after', unit: 'hours' },
  maxStrikes: { label: 'Strikes before a pause', unit: '' },
};

function withUnit(value: unknown, unit: string): string {
  return unit ? `${String(value)} ${unit}` : String(value);
}

function joined(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}

/** One line in words for an entry's details (board A23); ids and codes never show. */
export function detailSummary(entry: AuditLogEntry): string {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case 'consent.accept': {
      const type = String(d['documentType'] ?? '');
      const name = DOCUMENTS[type] ?? type;
      return joined([
        name,
        type !== 'AGE_CONFIRMATION' && d['version'] ? `v${String(d['version'])}` : null,
        d['language'] ? (LANGUAGES[String(d['language'])] ?? String(d['language'])) : null,
      ]);
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
      return joined([
        d['reason'] ? quote(d['reason']) : null,
        d['until'] || d['suspendUntil']
          ? `until ${formatDay(d['until'] ?? d['suspendUntil'])}`
          : 'no end date',
      ]);
    case 'listings.resume':
      return joined([
        d['source'] ? `Paused by ${valueWords(d['source'])}` : null,
        d['note'] ? quote(d['note']) : null,
        d['expired'] ? 'the pause reached its end date' : null,
      ]);
    case 'listing.hide':
    case 'binder.unpublish':
      return joined([
        d['reason'] ? quote(d['reason']) : null,
        d['previousVisibility'] ? `was ${valueWords(d['previousVisibility'])}` : null,
      ]);
    case 'listing.restore':
      return d['previousState'] ? `Was ${valueWords(d['previousState'])}` : 'Restored';
    case 'usage_limit.update': {
      const before = d['previousMaxValue'] ?? '';
      const after = d['maxValue'] ?? '';
      return before !== '' ? `${String(before)} → ${String(after)}` : `Now ${String(after)}`;
    }
    case 'feature_flag.update':
      return `${d['enabled'] ? 'On' : 'Off'}${
        d['rolloutPercent'] !== undefined ? ` · ${String(d['rolloutPercent'])}%` : ''
      }`;
    case 'region.country.update': {
      const moved =
        d['previousRegion'] && d['previousRegion'] !== d['region']
          ? `${regionWords(entry, d['previousRegion'])} → ${regionWords(entry, d['region'])}`
          : `In ${regionWords(entry, d['region'])}`;
      const switched =
        d['previousActive'] !== undefined && d['previousActive'] !== d['active']
          ? d['active']
            ? 'turned on'
            : 'turned off'
          : null;
      return joined([moved, switched]);
    }
    case 'community.post.remove':
    case 'community.reply.remove':
    case 'community.post.delete':
    case 'community.reply.delete':
      return joined([
        d['reason'] ? quote(d['reason']) : null,
        d['channel'] ? `In ${roomWords(entry, d['channel'])}` : null,
        Number(d['flagsResolved'] ?? 0) > 0
          ? `${plural(d['flagsResolved'], 'flag')} resolved`
          : null,
      ]);
    case 'community.channel.create':
      return joined([
        roomWords(entry, d['slug']),
        d['kind'] ? capitalized(valueWords(d['kind'])) : null,
      ]);
    case 'community.channel.update':
      return joined([
        roomWords(entry, d['slug']),
        d['previousStatus'] && d['previousStatus'] !== d['status']
          ? `${capitalized(valueWords(d['previousStatus']))} → ${valueWords(d['status'])}`
          : d['status']
            ? capitalized(valueWords(d['status']))
            : null,
        d['previousPostRateLimitPerHour'] !== undefined &&
        d['previousPostRateLimitPerHour'] !== d['postRateLimitPerHour']
          ? `posts per hour ${String(d['previousPostRateLimitPerHour'])} → ${String(
              d['postRateLimitPerHour'],
            )}`
          : null,
      ]);
    case 'catalog.sync.request': {
      const game = String(d['game'] ?? '');
      const mode = d['mode'] === 'FULL' ? 'Full' : 'Incremental';
      const images: Record<string, string> = {
        REFERENCED: 'only images in use',
        ALL: 'all images',
        NONE: 'no images',
        LIMIT: `up to ${String(d['imageLimit'] ?? '')} images`,
      };
      return joined([gameName(game) ?? game, mode, images[String(d['imageMode'])] ?? null]);
    }
    case 'card.create':
    case 'card.update':
    case 'card_set.create':
    case 'card_set.update':
      return joined([
        gameName(String(d['game'] ?? '')),
        d['code'] ? `Set ${String(d['code'])}` : null,
        d['changed'] === false ? 'nothing changed' : null,
      ]);
    case 'card_printing.create':
    case 'card_printing.update':
      return joined([
        d['set'] ? `Set ${String(d['set'])}` : null,
        d['collectorNumber'] ? `No. ${String(d['collectorNumber'])}` : null,
        d['finish'] ? finishLabel(String(d['finish'])) : null,
        d['edition'] ? editionLabel(String(d['edition'])) : null,
        d['language'] ? languageLabel(String(d['language'])) : null,
      ]);
    case 'card_images.cache.clear': {
      const game = String(d['game'] ?? '');
      const name = game === '*' ? 'Every game' : (gameName(game) ?? game);
      return `${name} · ${String(d['images'] ?? 0)} images`;
    }
    case 'card_images.cache.reconcile': {
      const orphans = Number(d['orphanFiles'] ?? 0) + Number(d['orphanTempFiles'] ?? 0);
      const missing = Number(d['missingFiles'] ?? 0);
      return joined([
        orphans || missing
          ? joined([
              orphans ? `${plural(orphans, 'stray file')} removed` : null,
              missing ? `${plural(missing, 'missing file')}` : null,
            ])
          : 'Nothing to fix',
        `${megabytes(d['usedBytes'])} in use`,
      ]);
    }
    case 'card_images.cache.evict':
      return 'The file was removed; it is fetched again when needed';
    case 'inventory.import.settings.update':
      return joined(
        Object.entries(d).map(([key, value]) => {
          const setting = IMPORT_SETTINGS[key];
          return setting ? `${setting.label} ${withUnit(value, setting.unit)}` : null;
        }),
      );
    case 'wishlist.settings.update': {
      const terms = String(d['wishlist.price_terms'] ?? '')
        .split(',')
        .filter(Boolean)
        .join(', ');
      const before = String(d['before'] ?? '')
        .split(',')
        .filter(Boolean)
        .join(', ');
      return joined([terms ? `Terms: ${terms}` : 'No terms', before ? `were ${before}` : null]);
    }
    case 'delist_policy.update': {
      const previous = (d['previous'] ?? {}) as Record<string, unknown>;
      const updated = (d['updated'] ?? {}) as Record<string, unknown>;
      const changes = Object.entries(DELIST_THRESHOLDS)
        .filter(([key]) => updated[key] !== undefined && previous[key] !== updated[key])
        .map(
          ([key, info]) =>
            `${info.label} ${String(previous[key] ?? '—')} → ${withUnit(updated[key], info.unit)}`,
        );
      return changes.length ? joined(changes) : 'Nothing changed';
    }
    case 'game.create':
    case 'game.update':
      return joined([
        d['previousStatus'] && d['previousStatus'] !== d['status']
          ? `${capitalized(valueWords(d['previousStatus']))} → ${valueWords(d['status'])}`
          : d['status']
            ? capitalized(valueWords(d['status']))
            : null,
        d['schemaChanged'] ? 'fields changed' : null,
      ]);
    case 'notification.broadcast':
      return `${d['title'] ? quote(d['title']) : 'An announcement'} · ${String(
        d['recipients'] ?? 0,
      )} accounts`;
    case 'user.roles.update':
      return Array.isArray(d['previousRoles'])
        ? `${roleWords(d['previousRoles'])} → ${roleWords(d['roles'])}`
        : roleWords(d['roles']);
    case 'user.handle.change':
      return d['previousHandle'] ? `@${String(d['previousHandle'])} → @${String(d['handle'])}` : '';
    case 'moderation.flag.resolve':
      return joined([
        d['reason'] ? capitalized(valueWords(d['reason'])) : null,
        d['subjectId']
          ? `about ${labelOf(entry, d['subjectId']) ?? valueWords(d['subjectType'])}`
          : null,
      ]);
    case 'account.deletion.request':
      return joined([
        d['scheduledFor'] ? `Deleted on ${formatDay(d['scheduledFor'])}` : null,
        d['exportRequested'] ? 'with a copy of their data' : null,
      ]);
    case 'account.deletion.cancel':
      return 'The account stays';
    case 'account.deletion.complete':
      return 'The account and its data were deleted';
    default:
      return genericSummary(entry, d);
  }
}

function genericSummary(entry: AuditLogEntry, details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([key, value]) => {
      if (value === null || value === undefined || value === '' || typeof value === 'object') {
        return false;
      }
      return !UUID.test(String(value)) && !/Id$/.test(key);
    })
    .slice(0, 4)
    .map(([key, value]) => {
      const name = READABLE_KEYS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      const shown =
        typeof value === 'boolean'
          ? value
            ? 'yes'
            : 'no'
          : (labelOf(entry, value) ?? valueWords(value));
      return `${name}: ${shown}`;
    })
    .join(' · ');
}

/**
 * The details as JSON, with every id and code the API names replaced by its name (the actor by
 * its handle, the target by its label, the others by `detailLabels`): "Ids are shown as handles,
 * report numbers and names." An id nothing names never shows (spec 15.2).
 */
export function staffJson(entry: AuditLogEntry): string {
  const names = new Map<string, string>(
    Object.entries((entry.detailLabels ?? {}) as Record<string, string>),
  );
  if (entry.actor.id && entry.actor.handle) {
    names.set(entry.actor.id, `@${entry.actor.handle}`);
  }
  if (entry.targetId && entry.targetLabel) {
    names.set(entry.targetId, entry.targetLabel);
  }
  return JSON.stringify(
    entry.details ?? {},
    (_key, value: unknown) => {
      if (typeof value !== 'string') {
        return value;
      }
      return names.get(value) ?? (UUID.test(value) ? 'Not shown' : value);
    },
    2,
  );
}
