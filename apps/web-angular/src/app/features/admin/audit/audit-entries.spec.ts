import type { AuditLogEntry } from '@orenji/api-client';
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_LABELS,
  PAYMENT_ACTION_GROUP,
  auditLabel,
  auditWho,
  detailSummary,
  staffJson,
  targetLink,
  targetName,
} from './audit-entries';
import { whoParams } from './admin-audit-logs-page.component';

/** Every action the API writes today (grep of `auditService.record` on 2026-10-31). */
const API_ACTIONS = [
  'account.deletion.cancel',
  'account.deletion.complete',
  'account.deletion.request',
  'binder.unpublish',
  'card.create',
  'card.update',
  'card_images.cache.clear',
  'card_images.cache.evict',
  'card_images.cache.reconcile',
  'card_printing.create',
  'card_printing.update',
  'card_set.create',
  'card_set.update',
  'catalog.sync.request',
  'community.channel.create',
  'community.channel.update',
  'community.post.delete',
  'community.post.remove',
  'community.reply.delete',
  'community.reply.remove',
  'consent.accept',
  'delist_policy.update',
  'feature_flag.update',
  'game.create',
  'game.update',
  'inventory.import.settings.update',
  'listing.hide',
  'listing.restore',
  'listings.pause',
  'listings.resume',
  'moderation.flag.resolve',
  'moderation.rule.create',
  'moderation.rule.delete',
  'moderation.rule.update',
  'notification.broadcast',
  'rating.hide',
  'rating.unhide',
  'reference.hide',
  'reference.unhide',
  'region.country.update',
  'report.assign',
  'report.conversation.view',
  'report.note',
  'REPORT_RESOLVED',
  'usage_limit.update',
  'user.ban',
  'user.handle.change',
  'user.roles.update',
  'user.suspend',
  'user.suspension.expired',
  'user.unsuspend',
  'wishlist.settings.update',
];
const PAYMENT_ACTIONS = [
  'dispute.freeze',
  'dispute.note',
  'dispute.resolve',
  'dispute.unfreeze',
  'payment.refund',
  'payments.settings.update',
];

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 'e1',
    occurredAt: '2026-10-20T14:52:46Z',
    actor: {
      id: 'a1',
      handle: 'alex_m',
      type: 'ADMIN',
      displayName: 'Alex Morin',
      role: 'SUPER_ADMIN',
    },
    action: 'report.assign',
    targetType: 'REPORT',
    targetId: '7b1c2d3e-0000-4000-8000-000000000047',
    details: {},
    requestId: 'req-1',
    targetLabel: 'Report #1047',
    ...overrides,
  } as AuditLogEntry;
}

describe('the audit log’s words (spec 15.5, board A23)', () => {
  it('labels every action the API writes and groups each one once', () => {
    const grouped = AUDIT_ACTION_GROUPS.flatMap((group) => group.actions);
    for (const action of API_ACTIONS) {
      expect(AUDIT_LABELS[action], action).toBeTruthy();
      expect(
        grouped.filter((a) => a === action),
        action,
      ).toHaveLength(1);
    }
    for (const action of PAYMENT_ACTIONS) {
      expect(PAYMENT_ACTION_GROUP.actions).toContain(action);
      expect(grouped).not.toContain(action);
    }
    // The seven without a label before WH2.
    expect(auditLabel('card_images.cache.clear')).toBe('Cleared card images');
    expect(auditLabel('card_images.cache.reconcile')).toBe('Checked the card image cache');
    expect(auditLabel('community.post.delete')).toBe('Deleted a post');
    expect(auditLabel('community.reply.delete')).toBe('Deleted a reply');
    expect(auditLabel('inventory.import.settings.update')).toBe('Changed import limits');
    expect(auditLabel('wishlist.settings.update')).toBe('Changed wishlist terms');
    expect(auditLabel('region.country.update')).toBe('Moved a country');
    expect(auditLabel('user.suspension.expired')).toBe('Suspension ended');
    expect(auditLabel('some.new.action')).toBe('some.new.action');
  });

  it('names who acted: staff with their role, the system, a collector', () => {
    expect(auditWho(entry({}))).toEqual({
      name: 'Alex Morin',
      sub: '@alex_m · Super admin',
      system: false,
      initials: 'AM',
    });
    expect(
      auditWho(entry({ actor: { type: 'SYSTEM', id: null, handle: null } as never })).name,
    ).toBe('System');
    expect(
      auditWho(
        entry({
          actor: {
            type: 'USER',
            id: 'c',
            handle: 'ana.cards',
            displayName: 'Ana Costa',
            role: null,
          } as never,
        }),
      ).sub,
    ).toBe('@ana.cards · Collector');
  });

  it('never shows a raw id as a target', () => {
    expect(targetName(entry({}))).toBe('Report #1047');
    expect(targetName(entry({ targetLabel: null, targetType: 'USER' }))).toBe('A deleted account');
    expect(targetName(entry({ targetLabel: null, targetType: 'BINDER' }))).toBe('Binder');
    expect(
      targetName(entry({ targetLabel: null, targetType: 'FEATURE_FLAG', targetId: 'publicChat' })),
    ).toBe('publicChat');
    expect(targetLink(entry({}))?.path).toEqual([
      '/admin/reports',
      '7b1c2d3e-0000-4000-8000-000000000047',
    ]);
    expect(
      targetLink(entry({ targetType: 'PLATFORM_SETTINGS', targetId: 'wishlist' }))?.path,
    ).toEqual(['/admin/wishlist']);
  });

  it('sums the details up in words, without ids', () => {
    expect(detailSummary(entry({ details: { previousStatus: 'OPEN', assigneeId: 'x' } }))).toBe(
      'Open → Under review',
    );
    expect(
      detailSummary(
        entry({
          action: 'consent.accept',
          details: { documentType: 'COMMUNITY_GUIDELINES', version: '3', language: 'en' },
        }),
      ),
    ).toBe('Community Guidelines · v3 · English');
    expect(
      detailSummary(
        entry({ action: 'listings.pause', details: { reason: 'Counterfeit cards', until: null } }),
      ),
    ).toBe('“Counterfeit cards” · no end date');
    expect(
      detailSummary(
        entry({
          action: 'binder.unpublish',
          details: { ownerId: '7b1c2d3e-0000-4000-8000-000000000001', reason: 'Spam' },
        }),
      ),
    ).toBe('“Spam”');
  });

  it('names regions and rooms, never their codes or slugs (review fix 1, U1)', () => {
    const moved = entry({
      action: 'region.country.update',
      targetType: 'COUNTRY',
      targetId: 'BZ',
      targetLabel: 'Belize',
      details: { previousRegion: 'americas-north', region: 'americas-south', active: true },
      detailLabels: { 'americas-north': 'Americas (North)', 'americas-south': 'Americas (South)' },
    });
    expect(detailSummary(moved)).toBe('Americas (North) → Americas (South)');
    expect(staffJson(moved)).not.toMatch(/americas-/);
    // Without the API's names, the console's own region names.
    expect(detailSummary({ ...moved, detailLabels: {} })).toBe(
      'Americas (North) → Americas (South)',
    );
    expect(
      detailSummary(
        entry({
          action: 'community.post.remove',
          targetType: 'COMMUNITY_POST',
          details: {
            reason: 'Spam',
            channel: 'americas-north-yugioh',
            authorId: '00000000-0000-4000-8000-000000000003',
            flagsResolved: 2,
          },
          detailLabels: {
            'americas-north-yugioh': 'Americas (North) · Yu-Gi-Oh!',
            '00000000-0000-4000-8000-000000000003': '@collector3',
          },
        }),
      ),
    ).toBe('“Spam” · In Americas (North) · Yu-Gi-Oh! · 2 flags resolved');
    expect(
      detailSummary(
        entry({
          action: 'community.channel.update',
          targetType: 'COMMUNITY_CHANNEL',
          details: {
            slug: 'americas-north',
            previousStatus: 'ARCHIVED',
            status: 'ARCHIVED',
            previousPostRateLimitPerHour: 10,
            postRateLimitPerHour: 20,
          },
          detailLabels: { 'americas-north': 'Americas (North)' },
        }),
      ),
    ).toBe('Americas (North) · Archived · posts per hour 10 → 20');
    expect(
      detailSummary(
        entry({
          action: 'community.post.delete',
          details: { channel: 'archived-channel' },
          detailLabels: { 'archived-channel': 'An archived channel' },
        }),
      ),
    ).toBe('In An archived channel');
  });

  it('reads stored values as sentences (review fix 1, U5)', () => {
    const summary = (action: string, details: Record<string, unknown>) =>
      detailSummary(entry({ action, details }));
    expect(
      summary('listing.hide', { reason: 'Fake', previousVisibility: 'TEMPORARILY_PUBLIC' }),
    ).toBe('“Fake” · was temporarily public');
    expect(summary('listing.restore', { previousState: 'STALE' })).toBe('Was stale');
    expect(summary('listings.resume', { source: 'ADMIN' })).toBe('Paused by staff');
    expect(
      summary('user.roles.update', { previousRoles: ['USER'], roles: ['MODERATOR', 'USER'] }),
    ).toBe('Collector → Moderator');
    expect(summary('card.create', { game: 'yugioh', slug: 'ux-review-lantern-sprite' })).toBe(
      'Yu-Gi-Oh!',
    );
    expect(
      summary('card_printing.create', {
        set: 'YDKR',
        card: 'azure-eyes-sky-dragon',
        collectorNumber: '001',
        finish: 'NORMAL',
        edition: 'UNLIMITED',
        language: 'en',
      }),
    ).not.toMatch(/azure-eyes|NORMAL|UNLIMITED/);
    expect(
      summary('card_images.cache.reconcile', { usedBytes: 0, orphanFiles: 0, missingFiles: 0 }),
    ).toBe('Nothing to fix · 0.0 MB in use');
    expect(
      summary('inventory.import.settings.update', { 'inventory.import.ydk_max_kb': 150 }),
    ).toBe('Largest .ydk file 150 kB');
    expect(
      summary('delist_policy.update', {
        previous: { agingAfterDays: 14, staleAfterDays: 30 },
        updated: { agingAfterDays: 21, staleAfterDays: 30 },
      }),
    ).toBe('Aging after 14 → 21 days');
    // Any other action: words for keys and values, never an enum code.
    expect(summary('moderation.rule.update', { kind: 'BANNED_TERM', active: true })).toBe(
      'kind: banned term · active: yes',
    );
  });

  it('names games in the summary, never their slug', () => {
    expect(
      detailSummary(
        entry({ action: 'card_images.cache.clear', details: { game: 'yugioh', images: 3 } }),
      ),
    ).toBe('Yu-Gi-Oh! · 3 images');
    expect(
      detailSummary(
        entry({
          action: 'catalog.sync.request',
          details: { game: 'pokemon', mode: 'FULL', imageMode: 'LIMIT', imageLimit: 25 },
        }),
      ),
    ).toBe('Pokémon · Full · up to 25 images');
  });

  it('shows the actor and the target by name in the JSON', () => {
    const json = staffJson(
      entry({ details: { assigneeId: 'a1', report: '7b1c2d3e-0000-4000-8000-000000000047' } }),
    );
    expect(json).toContain('"assigneeId": "@alex_m"');
    expect(json).toContain('"report": "Report #1047"');
  });

  it('names every id of the details in the JSON and never shows one raw (review fix 1, F1)', () => {
    const json = staffJson(
      entry({
        action: 'community.post.remove',
        targetType: 'COMMUNITY_POST',
        targetId: '00000000-0000-4000-8000-0000000000aa',
        targetLabel: 'A post in Americas (North) · Yu-Gi-Oh!',
        details: {
          reason: 'Spam',
          channel: 'americas-north-yugioh',
          authorId: '00000000-0000-4000-8000-000000000003',
          noteId: '00000000-0000-4000-8000-000000000004',
          unknownId: '00000000-0000-4000-8000-000000000005',
        },
        detailLabels: {
          'americas-north-yugioh': 'Americas (North) · Yu-Gi-Oh!',
          '00000000-0000-4000-8000-000000000003': '@collector3',
          '00000000-0000-4000-8000-000000000004': 'A moderator note',
        },
      }),
    );
    expect(json).toContain('"authorId": "@collector3"');
    expect(json).toContain('"noteId": "A moderator note"');
    expect(json).toContain('"channel": "Americas (North) · Yu-Gi-Oh!"');
    expect(json).toContain('"unknownId": "Not shown"');
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('turns Who into the API’s filters', () => {
    expect(whoParams('system')).toEqual({ actorType: 'SYSTEM' });
    expect(whoParams('collectors')).toEqual({ actorType: 'USER' });
    expect(whoParams('7b1c2d3e-0000-4000-8000-000000000001')).toEqual({
      actorId: '7b1c2d3e-0000-4000-8000-000000000001',
    });
    expect(whoParams('nonsense')).toEqual({});
  });
});
