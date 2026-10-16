import { bellLabel } from '@/src/features/notifications/NotificationBell';
import {
  DEALS_IN_CHAT_NOTE,
  FREE_FOR_ALL_NOTE,
  groupByDay,
  isUnread,
  mobileTarget,
  notificationCard,
  notificationKind,
  notificationLink,
  notificationTarget,
  safeAppPath,
} from '@/src/features/notifications/notificationKinds';
import { categoriesOf } from '@/src/features/settings/notificationOptions';

import { CARD_ID, notificationFixture, notificationsFixture } from '../support/fixtures';

describe('notification kinds', () => {
  it('gives every type an icon, tone and label (and SYSTEM notices their own)', () => {
    expect(notificationKind({ type: 'WISHLIST_ALERT', data: {} })).toMatchObject({
      tone: 'match',
      label: 'Wishlist alert',
    });
    expect(notificationKind({ type: 'MESSAGE', data: {} }).label).toBe('Message');
    expect(notificationKind({ type: 'SYSTEM', data: { kind: 'LIMIT_REACHED' } }).label).toBe(
      'Limit reached'
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
    expect(safeAppPath('/cards/abc?printing=p1')).toBe('/cards/abc?printing=p1');
    expect(safeAppPath('/cards/abc?rarity=Secret%20Rare')).toBe('/cards/abc?rarity=Secret%20Rare');
    expect(safeAppPath('/inventory?binder=b1')).toBe('/inventory?binder=b1');
    expect(safeAppPath('//evil.example/x')).toBeNull();
    expect(safeAppPath('https://evil.example')).toBeNull();
    expect(safeAppPath('/x"><script>')).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });

  it('rebuilds the web path from ids when there is no deep link', () => {
    const link = (type: string, data: Record<string, unknown>) =>
      notificationLink({ type: type as 'SYSTEM', data });
    // A wishlist alert opens the card page with the wish's selection.
    expect(link('WISHLIST_ALERT', { cardId: 'c1', printingId: 'p1' })).toBe(
      '/cards/c1?printing=p1'
    );
    // Without a printing, "any printing" is said explicitly (the screen picks none itself).
    expect(link('WISHLIST_ALERT', { cardId: 'c1' })).toBe('/cards/c1?printing=any');
    expect(link('WISHLIST_ALERT', { cardId: '../x' })).toBe('/search?segment=wishlist');
    expect(link('MESSAGE', { conversationId: 'c1' })).toBe('/messages/c1');
    expect(link('MESSAGE', {})).toBe('/messages');
    // Stage R4: "{seller} marked {card} as sold to you" opens the chat.
    expect(link('SALE_RECORDED', { conversationId: 'c1', saleId: 's1' })).toBe('/messages/c1');
    expect(notificationKind({ type: 'SALE_RECORDED', data: {} })).toEqual({
      icon: 'package-variant-closed',
      tone: 'trade',
      label: 'Sold to you',
    });
    expect(link('BINDER_HIDDEN', { binderId: 'b1' })).toBe('/inventory?binder=b1');
    expect(link('OFFER_RECEIVED', { offerId: 'o1' })).toBe('/offers/o1');
    expect(link('OFFER_ACCEPTED', { offerId: 'o1', tradeId: 't1' })).toBe('/trades/t1');
    expect(link('DISPUTE_UPDATE', { disputeId: 'd1' })).toBe('/disputes/d1');
    expect(link('REPORT_DECISION', {})).toBe('/settings/reports');
    // The daily limit notice is about held-back alerts; nothing to buy (stage F1): an old
    // notice's `upgradeUrl` is ignored and an old `deepLink` to Premium says the app is free.
    expect(link('SYSTEM', { kind: 'LIMIT_REACHED' })).toBe('/notifications');
    expect(link('SYSTEM', { kind: 'LIMIT_REACHED', notificationType: 'WISHLIST_ALERT' })).toBe(
      '/search?segment=wishlist'
    );
    expect(link('SYSTEM', { kind: 'LIMIT_REACHED', upgradeUrl: '/premium' })).toBe(
      '/notifications'
    );
    expect(link('SYSTEM', { kind: 'LIMIT_REACHED', upgradeUrl: 'https://evil.example' })).toBe(
      '/notifications'
    );
    expect(link('SYSTEM', { kind: 'MODERATION_WARNING' })).toBe('/legal/community-guidelines');
    expect(link('MESSAGE', { conversationId: '../../x' })).toBe('/messages');
    expect(link('MESSAGE', { deepLink: '/messages/c9', conversationId: 'c1' })).toBe(
      '/messages/c9'
    );
  });

  it('maps web paths to app screens, with a note for the settings that stay on the web', () => {
    // The matches screen is gone (stage S2): an old wish link opens the list.
    expect(mobileTarget('/wishlist/w1')).toEqual({
      kind: 'route',
      href: '/search?segment=wishlist',
    });
    // A wishlist alert's card page keeps the wish's printing or rarity.
    expect(mobileTarget(`/cards/${CARD_ID}?printing=p1`)).toEqual({
      kind: 'route',
      href: `/cards/${CARD_ID}?printing=p1`,
    });
    expect(mobileTarget(`/cards/${CARD_ID}?rarity=Secret%20Rare`)).toEqual({
      kind: 'route',
      href: `/cards/${CARD_ID}?rarity=Secret%20Rare`,
    });
    // An "any printing" wish says so: the card screen shows "Any printing".
    expect(mobileTarget(`/cards/${CARD_ID}?printing=any`)).toEqual({
      kind: 'route',
      href: `/cards/${CARD_ID}?printing=any`,
    });
    expect(mobileTarget(`/cards/${CARD_ID}?printing=bad id`)).toEqual({
      kind: 'route',
      href: `/cards/${CARD_ID}`,
    });
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
    // The Map tab is Search's default view since stage R5, on the region and state of the link.
    expect(mobileTarget('/map')).toEqual({ kind: 'route', href: '/search' });
    expect(mobileTarget('/map?region=europe&subdivision=FR-IDF')).toEqual({
      kind: 'route',
      href: '/search?region=europe&subdivision=FR-IDF',
    });
    expect(mobileTarget('/map?region=../x&subdivision=<b>')).toEqual({
      kind: 'route',
      href: '/search',
    });
    // Phase 7 screens (mobile stage M5).
    expect(mobileTarget('/settings/reports')).toEqual({ kind: 'route', href: '/settings/reports' });
    // Offers, trades, disputes, offer settings and payouts left the phone (ADR 0018): no screen
    // opens, a note says that deals happen in the chat.
    for (const gone of [
      '/offers/o1',
      '/offers',
      '/trades/t1',
      '/trades',
      '/trades/bad id!',
      '/disputes/d1',
      '/settings/offers',
      '/settings/payouts',
    ]) {
      expect(mobileTarget(gone)).toEqual({ kind: 'note', note: DEALS_IN_CHAT_NOTE });
    }
    // Premium, credits and "Support OrenjiTrade" left with stage F1 (ADR 0019): old links say why.
    for (const path of ['/premium', '/premium?checkout=success', '/credits', '/support']) {
      expect(mobileTarget(path)).toEqual({ kind: 'note', note: FREE_FOR_ALL_NOTE });
    }
    expect(mobileTarget('/settings/blocked')).toEqual({
      kind: 'route',
      href: '/settings/blocked',
    });
    // A settings page the app does not have stays a website note.
    const unknown = mobileTarget('/settings/something-new');
    expect(unknown.kind === 'note' && unknown.note).toMatch(/orenjitrade\.com/);
    // The web's holders view is the card page, Who has this card, since stage R5; a printing
    // alone is looked up by /holders first; the search tabs map to Search's segments.
    expect(mobileTarget('/search?card=00000000-0000-4000-8a00-000000000001')).toEqual({
      kind: 'route',
      href: '/cards/00000000-0000-4000-8a00-000000000001',
    });
    expect(
      mobileTarget(
        '/search?card=00000000-0000-4000-8a00-000000000001&printing=00000000-0000-4000-8a10-00000000000a'
      )
    ).toEqual({
      kind: 'route',
      href: '/cards/00000000-0000-4000-8a00-000000000001?printing=00000000-0000-4000-8a10-00000000000a',
    });
    expect(
      mobileTarget('/search?printing=00000000-0000-4000-8a10-00000000000a&sort=price')
    ).toEqual({ kind: 'route', href: '/holders?printing=00000000-0000-4000-8a10-00000000000a' });
    expect(mobileTarget('/search?q=fox&tab=collectors')).toEqual({
      kind: 'route',
      href: '/search',
    });
    expect(mobileTarget('/search?tab=binders')).toEqual({
      kind: 'route',
      href: '/search?segment=binders',
    });
    expect(mobileTarget('/sets/00000000-0000-4000-8a20-000000000001')).toEqual({
      kind: 'route',
      href: '/sets/00000000-0000-4000-8a20-000000000001',
    });
    expect(mobileTarget('/something-else')).toEqual({ kind: 'route', href: '/notifications' });
    // A wishlist alert opens the card page.
    expect(notificationTarget(notificationFixture())).toEqual({
      kind: 'route',
      href: `/cards/${CARD_ID}`,
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

describe('notification categories', () => {
  it('lists the known categories in order, unknown ones last, never offers or trades (ADR 0018)', () => {
    const on = { inApp: true, push: true, email: true };
    const rows = categoriesOf(
      notificationsFixture({
        categories: {
          SOMETHING_NEW: on,
          OFFER: on,
          RATING: on,
          TRADE: on,
          MESSAGE: on,
        },
      })
    );
    expect(rows.map((row) => [row.key, row.label])).toEqual([
      ['MESSAGE', 'Messages'],
      ['RATING', 'Ratings'],
      ['SOMETHING_NEW', 'something new'],
    ]);
  });
});
