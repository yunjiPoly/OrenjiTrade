import { bellLabel } from '@/src/features/notifications/NotificationBell';
import {
  groupByDay,
  isUnread,
  mobileTarget,
  notificationCard,
  notificationKind,
  notificationLink,
  notificationTarget,
  safeAppPath,
} from '@/src/features/notifications/notificationKinds';

import { WISH_ID, notificationFixture } from '../support/fixtures';

describe('notification kinds', () => {
  it('gives every type an icon, tone and label (and SYSTEM notices their own)', () => {
    expect(notificationKind({ type: 'WISHLIST_MATCH', data: {} })).toMatchObject({
      tone: 'match',
      label: 'Wishlist match',
    });
    expect(notificationKind({ type: 'MESSAGE', data: {} }).label).toBe('Message');
    expect(notificationKind({ type: 'SYSTEM', data: { kind: 'LIMIT_REACHED' } }).label).toBe(
      'Plan limit'
    );
    expect(notificationKind({ type: 'SYSTEM', data: { kind: 'LISTINGS_PAUSED' } }).tone).toBe(
      'warning'
    );
    expect(notificationKind({ type: 'SYSTEM', data: {} }).label).toBe('OrenjiTrade');
    expect(notificationKind({ type: 'SOMETHING_NEW' as 'SYSTEM', data: {} }).label).toBe(
      'Notification'
    );
  });

  it('follows only safe in-app paths', () => {
    expect(safeAppPath('/wishlist/abc')).toBe('/wishlist/abc');
    expect(safeAppPath('/inventory?binder=b1')).toBe('/inventory?binder=b1');
    expect(safeAppPath('//evil.example/x')).toBeNull();
    expect(safeAppPath('https://evil.example')).toBeNull();
    expect(safeAppPath('/x"><script>')).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });

  it('rebuilds the web path from ids when there is no deep link', () => {
    const link = (type: string, data: Record<string, unknown>) =>
      notificationLink({ type: type as 'SYSTEM', data });
    expect(link('WISHLIST_MATCH', { wishlistItemId: 'w1' })).toBe('/wishlist/w1');
    expect(link('MESSAGE', { conversationId: 'c1' })).toBe('/messages/c1');
    expect(link('MESSAGE', {})).toBe('/messages');
    expect(link('BINDER_HIDDEN', { binderId: 'b1' })).toBe('/inventory?binder=b1');
    expect(link('OFFER_RECEIVED', { offerId: 'o1' })).toBe('/offers/o1');
    expect(link('OFFER_ACCEPTED', { offerId: 'o1', tradeId: 't1' })).toBe('/trades/t1');
    expect(link('DISPUTE_UPDATE', { disputeId: 'd1' })).toBe('/disputes/d1');
    expect(link('REPORT_DECISION', {})).toBe('/settings/reports');
    expect(link('SYSTEM', { kind: 'LIMIT_REACHED' })).toBe('/premium');
    expect(link('SYSTEM', { kind: 'MODERATION_WARNING' })).toBe('/legal/community-guidelines');
    expect(link('MESSAGE', { conversationId: '../../x' })).toBe('/messages');
    expect(link('MESSAGE', { deepLink: '/messages/c9', conversationId: 'c1' })).toBe(
      '/messages/c9'
    );
  });

  it('maps web paths to app screens, with a note for the settings that stay on the web', () => {
    expect(mobileTarget('/wishlist/w1')).toEqual({ kind: 'route', href: '/wishlist/w1' });
    expect(mobileTarget('/messages/c1')).toEqual({ kind: 'route', href: '/messages/c1' });
    expect(mobileTarget('/community')).toEqual({ kind: 'route', href: '/messages?view=community' });
    expect(mobileTarget('/community/montreal')).toEqual({
      kind: 'route',
      href: '/community/montreal',
    });
    expect(mobileTarget('/inventory?binder=b1')).toEqual({ kind: 'route', href: '/binders/b1' });
    expect(mobileTarget('/inventory')).toEqual({ kind: 'route', href: '/inventory' });
    // RATING_RECEIVED: the profile, scrolled to the ratings.
    expect(mobileTarget('/collectors/collector5?tab=ratings')).toEqual({
      kind: 'route',
      href: '/collectors/collector5?tab=ratings',
    });
    expect(mobileTarget('/collectors/collector5')).toEqual({
      kind: 'route',
      href: '/collectors/collector5',
    });
    expect(mobileTarget('/settings/trading-area')).toEqual({
      kind: 'route',
      href: '/settings/location',
    });
    expect(mobileTarget('/settings')).toEqual({ kind: 'route', href: '/settings' });
    expect(mobileTarget('/legal/community-guidelines')).toEqual({
      kind: 'route',
      href: '/legal/community-guidelines',
    });
    expect(mobileTarget('/map')).toEqual({ kind: 'route', href: '/' });
    // Phase 7 and 8 screens (mobile stage M5).
    expect(mobileTarget('/settings/reports')).toEqual({ kind: 'route', href: '/settings/reports' });
    expect(mobileTarget('/settings/offers')).toEqual({ kind: 'route', href: '/settings/offers' });
    expect(mobileTarget('/offers/o1')).toEqual({ kind: 'route', href: '/offers/o1' });
    expect(mobileTarget('/offers')).toEqual({ kind: 'route', href: '/offers' });
    expect(mobileTarget('/trades/t1')).toEqual({ kind: 'route', href: '/trades/t1' });
    expect(mobileTarget('/trades')).toEqual({ kind: 'route', href: '/trades' });
    expect(mobileTarget('/trades/bad id!')).toEqual({ kind: 'route', href: '/trades' });
    // Phase 9 and 10 screens (mobile stage M6).
    expect(mobileTarget('/settings/payouts')).toEqual({ kind: 'route', href: '/settings/payouts' });
    expect(mobileTarget('/disputes/d1')).toEqual({ kind: 'route', href: '/disputes/d1' });
    expect(mobileTarget('/disputes/bad id!')).toEqual({ kind: 'route', href: '/trades' });
    expect(mobileTarget('/premium')).toEqual({ kind: 'route', href: '/premium' });
    expect(mobileTarget('/premium?checkout=success')).toEqual({
      kind: 'route',
      href: '/premium?checkout=success',
    });
    expect(mobileTarget('/credits')).toEqual({ kind: 'route', href: '/credits' });
    expect(mobileTarget('/support')).toEqual({ kind: 'route', href: '/support' });
    // Still on the web only: blocked users (unblocking is in the conversation's options).
    const blocked = mobileTarget('/settings/blocked');
    expect(blocked.kind === 'later' && blocked.note).toMatch(/orenjitrade\.com/);
    expect(mobileTarget('/something-else')).toEqual({ kind: 'route', href: '/notifications' });
    expect(notificationTarget(notificationFixture())).toEqual({
      kind: 'route',
      href: `/wishlist/${WISH_ID}`,
    });
  });

  it('shows the API card picture of a notification, or none', () => {
    expect(
      notificationCard({
        data: {
          cardImageUrl: '/api/v1/public/card-images/c1',
          cardName: 'Lantern Fox',
          game: 'pokemon',
        },
      })
    ).toEqual({ imageUrl: '/api/v1/public/card-images/c1', name: 'Lantern Fox', game: 'pokemon' });
    expect(notificationCard({ data: { cardImageUrl: 'javascript:alert(1)' } })).toBeNull();
    expect(notificationCard({ data: {} })).toBeNull();
    expect(isUnread({ readAt: null })).toBe(true);
    expect(isUnread({ readAt: '2026-10-05T00:00:00Z' })).toBe(false);
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(4)).toBe('Notifications, 4 unread');
  });

  it('groups the feed by day', () => {
    const now = new Date('2026-10-05T15:00:00').getTime();
    const at = (iso: string, id: string) => notificationFixture({ id, createdAt: iso });
    const sections = groupByDay(
      [
        at('2026-10-05T09:00:00', 'today'),
        at('2026-10-04T09:00:00', 'yesterday'),
        at('2026-10-01T09:00:00', 'week'),
        at('2026-09-01T09:00:00', 'old'),
        at('not a date', 'unknown'),
      ],
      now
    );
    expect(sections.map((section) => [section.title, section.data.map((item) => item.id)])).toEqual(
      [
        ['Today', ['today']],
        ['Yesterday', ['yesterday']],
        ['Earlier this week', ['week']],
        ['Older', ['old', 'unknown']],
      ]
    );
  });
});
