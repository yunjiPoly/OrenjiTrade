import type { NotificationResponse } from '@/src/api/types';
import { bellLabel } from '@/src/features/notifications/NotificationBell';
import {
  isExcludedType,
  listRows,
  notificationTime,
  pushTarget,
  reminderState,
  rowLabel,
  rowTarget,
  rowText,
  rowVisual,
  type RowTone,
} from '@/src/features/notifications/notificationRows';
import { toneColors } from '@/src/features/notifications/NotificationRow';
import { darkPalette, lightPalette } from '@/src/theme';

import { CARD_ID, notificationFixture } from '../support/fixtures';

/**
 * Stage R9 (owner prompt of 2026-10-19; mockup v50 screen 31): each kind's icon, colours, sentence
 * and target, the time labels in the phone's time zone, the reminders' states, New and Earlier.
 */

const n = (overrides: Partial<NotificationResponse>) => notificationFixture(overrides);
const OLD_DEALS = [
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'OFFER_COUNTERED',
  'OFFER_DECLINED',
  'OFFER_CANCELLED',
  'OFFER_EXPIRED',
  'TRADE_UPDATE',
  'SHIPMENT_STATUS',
  'PAYMENT_UPDATE',
  'DISPUTE_UPDATE',
] as const;

describe('kind to icon and colours', () => {
  it('gives each kind of the mockup its icon tile', () => {
    expect(rowVisual({ type: 'WISHLIST_ALERT', data: {} })).toEqual({
      tone: 'wish',
      icon: 'heart',
    });
    expect(rowVisual({ type: 'SALE_RECORDED', data: {} })).toEqual({
      tone: 'sale',
      icon: 'package-variant-closed',
    });
    expect(rowVisual({ type: 'RATING_RECEIVED', data: {} })).toEqual({
      tone: 'star',
      icon: 'star',
    });
    for (const type of ['BINDER_EXPIRING', 'BINDER_STALE_WARNING', 'BINDER_HIDDEN'] as const) {
      expect(rowVisual({ type, data: {} })).toEqual({ tone: 'remind', icon: 'timer-sand' });
    }
    expect(rowVisual({ type: 'REPORT_DECISION', data: {} })).toEqual({
      tone: 'flag',
      icon: 'flag-outline',
    });
  });

  it('shows system notices, old offers, trades, payments and disputes, and unknown types in grey', () => {
    expect(rowVisual({ type: 'SYSTEM', data: {} }).tone).toBe('flag');
    expect(rowVisual({ type: 'SYSTEM', data: { kind: 'LIMIT_REACHED' } }).icon).toBe('speedometer');
    for (const type of OLD_DEALS) {
      expect(rowVisual({ type, data: {} }).tone).toBe('flag');
    }
    expect(rowVisual({ type: 'OFFER_RECEIVED', data: {} }).icon).toBe('tag-outline');
    expect(rowVisual({ type: 'SOMETHING_NEW' as 'SYSTEM', data: {} })).toEqual({
      tone: 'flag',
      icon: 'bell-outline',
    });
  });

  it('takes the mockup colours in dark, and darker ones in light', () => {
    const dark = (tone: RowTone) => toneColors(tone, darkPalette);
    expect(dark('wish')).toEqual({ background: 'rgba(255, 143, 61, 0.14)', icon: '#FF8F3D' });
    expect(dark('sale')).toEqual({ background: '#1E3A5F', icon: '#93C5FD' });
    expect(dark('star')).toEqual({ background: '#3A2E0F', icon: '#FBBF24' });
    expect(dark('remind')).toEqual({ background: '#3A2A12', icon: '#FCD34D' });
    expect(dark('flag')).toEqual({ background: '#292524', icon: '#D6D3D1' });
    const tones: RowTone[] = ['wish', 'sale', 'star', 'remind', 'flag'];
    const light = tones.map((tone) => toneColors(tone, lightPalette).icon);
    expect(new Set(light).size).toBe(5);
    expect(light).not.toContain('#FF8F3D');
  });
});

describe('kind to target', () => {
  it('opens Who has this card for the wished printing, the chat, and your own ratings', () => {
    const alert = n({
      data: {
        cardId: CARD_ID,
        printingId: 'p1',
        deepLink: `/cards/${CARD_ID}?printing=p1`,
      },
    });
    expect(rowTarget(alert, 'maika')).toBe(`/cards/${CARD_ID}?printing=p1`);
    expect(rowTarget({ type: 'WISHLIST_ALERT', data: { cardId: CARD_ID } }, 'maika')).toBe(
      `/cards/${CARD_ID}?printing=any`
    );
    expect(
      rowTarget({ type: 'SALE_RECORDED', data: { conversationId: 'c1', saleId: 's1' } }, 'me')
    ).toBe('/messages/c1');
    expect(rowTarget({ type: 'SALE_RECORDED', data: { deepLink: '/messages/c2' } }, 'me')).toBe(
      '/messages/c2'
    );
    // Your ratings on your profile, by today's handle (the stored link may name an older one).
    expect(
      rowTarget(
        { type: 'RATING_RECEIVED', data: { deepLink: '/collectors/old_handle?tab=ratings' } },
        'maika'
      )
    ).toBe('/collectors/maika?tab=ratings');
    expect(
      rowTarget(
        { type: 'RATING_RECEIVED', data: { deepLink: '/collectors/old_handle?tab=ratings' } },
        null
      )
    ).toBe('/collectors/old_handle?tab=ratings');
    expect(
      rowTarget({ type: 'RATING_RECEIVED', data: { deepLink: '/settings' } }, null)
    ).toBeNull();
  });

  it('opens nothing for reports, system notices, reminders, old deals and unknown types', () => {
    const none = [
      { type: 'REPORT_DECISION', data: { deepLink: '/settings/reports' } },
      {
        type: 'SYSTEM',
        data: { kind: 'MODERATION_WARNING', deepLink: '/legal/community-guidelines' },
      },
      { type: 'SYSTEM', data: { kind: 'LIMIT_REACHED', notificationType: 'WISHLIST_ALERT' } },
      { type: 'BINDER_STALE_WARNING', data: { binderId: 'b1', deepLink: '/inventory?binder=b1' } },
      { type: 'BINDER_HIDDEN', data: { binderId: 'b1' } },
      ...OLD_DEALS.map((type) => ({ type, data: { tradeId: 't1', deepLink: '/trades/t1' } })),
      { type: 'SOMETHING_NEW', data: { deepLink: '/cards/x' } },
    ] as Pick<NotificationResponse, 'type' | 'data'>[];
    for (const notice of none) {
      expect(rowTarget(notice, 'me')).toBeNull();
    }
    // A sale whose link is not an app path falls back to Messages.
    expect(
      rowTarget({ type: 'SALE_RECORDED', data: { deepLink: 'https://evil.example' } }, 'me')
    ).toBe('/messages');
  });

  it('leads a tapped push notification to its row target, else to Notifications', () => {
    expect(
      pushTarget(
        { notificationId: 'n1', type: 'WISHLIST_ALERT', deepLink: `/cards/${CARD_ID}?printing=p1` },
        'me'
      )
    ).toBe(`/cards/${CARD_ID}?printing=p1`);
    expect(pushTarget({ type: 'SALE_RECORDED', deepLink: '/messages/c1' }, 'me')).toBe(
      '/messages/c1'
    );
    expect(
      pushTarget({ type: 'RATING_RECEIVED', deepLink: '/collectors/x?tab=ratings' }, 'maika')
    ).toBe('/collectors/maika?tab=ratings');
    expect(
      pushTarget({ type: 'BINDER_STALE_WARNING', deepLink: '/inventory?binder=b1' }, 'me')
    ).toBe('/notifications');
    expect(pushTarget({ type: 'REPORT_DECISION', deepLink: '/settings/reports' }, 'me')).toBe(
      '/notifications'
    );
    expect(pushTarget({ type: 'OFFER_RECEIVED', deepLink: '/offers/o1' }, 'me')).toBe(
      '/notifications'
    );
    expect(pushTarget({ type: 'WISHLIST_ALERT', deepLink: '//evil.example/x' }, 'me')).toBe(
      '/search?segment=wishlist'
    );
    expect(pushTarget(null, 'me')).toBe('/notifications');
  });

  it('leaves chats out of the bell and the list', () => {
    expect(isExcludedType('MESSAGE')).toBe(true);
    expect(isExcludedType('WISHLIST_ALERT')).toBe(false);
  });
});

describe('the sentence of a row', () => {
  it('words a wishlist alert with the province, the lister and the price as typed', () => {
    const row = rowText(
      n({
        data: {
          cardName: 'Maxx "C"',
          province: 'Quebec',
          collectorHandle: 'maya_k',
          askingPriceText: '$14.00',
          askingPrice: '14.00',
          currency: 'CAD',
        },
      })
    );
    expect(row).toEqual({
      strong: 'Maxx "C"',
      rest: 'from your wishlist was listed in Quebec',
      sub: 'maya_k · $14.00',
    });
    expect(
      rowText(
        n({
          data: {
            cardName: 'Nibiru',
            province: 'Ontario',
            collectorHandle: 'lucas',
            askingPriceText: '90% TCG',
          },
        })
      ).sub
    ).toBe('lucas · 90% TCG');
    expect(
      rowText(
        n({
          data: {
            cardName: 'Nibiru',
            province: 'Ontario',
            collectorHandle: 'lucas',
            askingPrice: '42',
            currency: 'CAD',
          },
        })
      ).sub
    ).toBe('lucas · $42.00');
    expect(rowText(n({ data: { cardName: 'Nibiru', collectorHandle: 'lucas' } })).sub).toBe(
      'lucas'
    );
    // An alert stored before stage R9: its title and body.
    const old = notificationFixture();
    expect(rowText(old)).toEqual({
      strong: old.title,
      rest: 'from your wishlist was listed',
      sub: old.body,
    });
  });

  it('words a sale, a rating, a report decision and a system notice', () => {
    expect(
      rowText(
        n({
          type: 'SALE_RECORDED',
          title: 'duelist.jp marked Ash Blossom as sold to you',
          data: {
            sellerHandle: 'duelist.jp',
            itemName: 'Ash Blossom & Joyous Spring',
            hasTracking: true,
          },
        })
      )
    ).toEqual({
      strong: 'duelist.jp',
      rest: 'marked Ash Blossom & Joyous Spring as sold to you',
      sub: 'Tracking added. Rate them when it arrives.',
    });
    expect(
      rowText(
        n({
          type: 'SALE_RECORDED',
          data: { sellerHandle: 'duelist.jp', itemName: 'Core', hasTracking: false },
        })
      ).sub
    ).toBe('Rate them when it arrives.');
    // A sale notification stored before stage R9 names the card in its title only.
    expect(
      rowText(
        n({
          type: 'SALE_RECORDED',
          title: 'duelist.jp marked Ash Blossom as sold to you',
          body: 'Open the chat to see the details and rate each other.',
          data: { sellerHandle: 'duelist.jp' },
        })
      )
    ).toEqual({
      strong: 'duelist.jp',
      rest: 'marked Ash Blossom as sold to you',
      sub: 'Open the chat to see the details and rate each other.',
    });
    expect(
      rowText(n({ type: 'RATING_RECEIVED', data: { raterHandle: 'sakura.tcg', overall: 5 } }))
    ).toEqual({ strong: 'sakura.tcg', rest: 'rated you 5 stars', sub: 'See it on your profile.' });
    expect(rowText(n({ type: 'RATING_RECEIVED', data: { overall: 1 } }))).toMatchObject({
      strong: 'A collector',
      rest: 'rated you 1 star',
    });
    expect(rowText(n({ type: 'REPORT_DECISION', data: { status: 'ACTIONED' } }))).toEqual({
      strong: 'Report reviewed:',
      rest: 'thanks for your report',
      sub: 'We took action.',
    });
    expect(rowText(n({ type: 'REPORT_DECISION', data: { status: 'DISMISSED' } })).sub).toBe(
      'We found no violation of the Community Guidelines.'
    );
    expect(
      rowText(
        n({ type: 'SYSTEM', title: 'Welcome to OrenjiTrade', body: 'Add your cards.', data: {} })
      )
    ).toEqual({ strong: 'Welcome to OrenjiTrade', rest: '', sub: 'Add your cards.' });
  });

  it('words the freshness reminders with the binder, the count and the date', () => {
    const hidesAt = new Date(2026, 9, 26, 12, 0).toISOString();
    expect(
      rowText(
        n({
          type: 'BINDER_STALE_WARNING',
          data: { binderId: 'b1', binderName: 'For trade', itemCount: 9, hidesAt },
        })
      )
    ).toEqual({
      strong: 'For trade:',
      rest: 'do you still have these 9 cards?',
      sub: 'Confirm them, or they leave search on Oct 26.',
    });
    expect(rowText(n({ type: 'BINDER_EXPIRING', data: { binderId: 'b1', itemCount: 1 } }))).toEqual(
      {
        strong: 'Your binder:',
        rest: 'do you still have this card?',
        sub: 'Confirm them, or they leave search soon.',
      }
    );
    expect(
      rowText(n({ type: 'BINDER_STALE_WARNING', data: { binderId: null, itemCount: 3 } })).strong
    ).toBe('Cards without a binder:');
    expect(
      rowText(n({ type: 'BINDER_STALE_WARNING', data: { binderId: 'b1', itemCount: 0 } })).rest
    ).toBe('do you still have these cards?');
    expect(
      rowText(n({ type: 'BINDER_HIDDEN', data: { binderId: 'b1', binderName: 'Spares' } }))
    ).toEqual({
      strong: 'Spares:',
      rest: 'these cards left search',
      sub: 'Confirm them to show them again.',
    });
  });

  it('says the row in one name: sentence, line, time and unread', () => {
    const row = {
      strong: 'Maxx "C"',
      rest: 'from your wishlist was listed in Quebec',
      sub: 'maya_k · $14.00',
    };
    expect(rowLabel(row, '5 minutes ago', true)).toBe(
      'Maxx "C" from your wishlist was listed in Quebec. maya_k · $14.00, 5 minutes ago, unread'
    );
    expect(
      rowLabel(
        {
          strong: 'duelist.jp',
          rest: 'marked X as sold to you',
          sub: 'Rate them when it arrives.',
        },
        'Yesterday',
        false
      )
    ).toBe('duelist.jp marked X as sold to you. Rate them when it arrives, Yesterday');
    // A question keeps its question mark.
    expect(
      rowLabel(
        { strong: 'For trade:', rest: 'do you still have these 9 cards?', sub: 'Confirm them.' },
        'Saturday',
        false
      )
    ).toBe('For trade: do you still have these 9 cards? Confirm them, Saturday');
  });

  it('speaks the bell with the number of new notifications', () => {
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(1)).toBe('Notifications, 1 new');
    expect(bellLabel(120)).toBe('Notifications, 120 new');
  });
});

describe('time labels, in the phone time zone', () => {
  const now = new Date(2026, 9, 21, 15, 30); // Wed 21 Oct 2026, 15:30 local (America/Toronto)
  const at = (date: Date) => notificationTime(date.toISOString(), now);

  it('runs in a time zone that is not UTC', () => {
    expect(new Date(2026, 9, 21).getTimezoneOffset()).not.toBe(0);
  });

  it('writes "now", minutes and hours today, "Yesterday", the weekday, then the date', () => {
    expect(at(new Date(2026, 9, 21, 15, 29, 40))).toEqual({ short: 'now', spoken: 'just now' });
    expect(at(new Date(2026, 9, 21, 15, 25))).toEqual({ short: '5 min', spoken: '5 minutes ago' });
    expect(at(new Date(2026, 9, 21, 15, 29))).toEqual({ short: '1 min', spoken: '1 minute ago' });
    expect(at(new Date(2026, 9, 21, 14, 30))).toEqual({ short: '1 h', spoken: '1 hour ago' });
    expect(at(new Date(2026, 9, 21, 0, 10))).toEqual({ short: '15 h', spoken: '15 hours ago' });
    expect(at(new Date(2026, 9, 20, 23, 50))).toEqual({ short: 'Yesterday', spoken: 'Yesterday' });
    expect(at(new Date(2026, 9, 20, 0, 5))).toEqual({ short: 'Yesterday', spoken: 'Yesterday' });
    expect(at(new Date(2026, 9, 17, 9, 0))).toEqual({ short: 'Sat', spoken: 'Saturday' });
    expect(at(new Date(2026, 9, 15, 9, 0))).toEqual({ short: 'Thu', spoken: 'Thursday' });
    expect(at(new Date(2026, 9, 14, 9, 0))).toEqual({ short: 'Oct 14', spoken: 'October 14' });
    expect(at(new Date(2026, 8, 30, 9, 0))).toEqual({ short: 'Sep 30', spoken: 'September 30' });
    expect(at(new Date(2025, 11, 31, 9, 0))).toEqual({
      short: 'Dec 31, 2025',
      spoken: 'December 31, 2025',
    });
  });

  it('counts minutes across midnight and treats a time ahead of the clock as now', () => {
    const justAfterMidnight = new Date(2026, 9, 21, 0, 20);
    expect(
      notificationTime(new Date(2026, 9, 20, 23, 50).toISOString(), justAfterMidnight).short
    ).toBe('30 min');
    expect(
      notificationTime(new Date(2026, 9, 20, 22, 50).toISOString(), justAfterMidnight).short
    ).toBe('Yesterday');
    expect(at(new Date(2026, 9, 21, 15, 45)).short).toBe('now');
    expect(notificationTime('not a date', now)).toEqual({ short: '', spoken: '' });
  });
});

describe('freshness reminders', () => {
  const created = '2026-10-20T12:00:00Z';
  const reminder = (type: NotificationResponse['type'], binderId: string | null) =>
    n({ type, createdAt: created, data: { binderId, binderName: 'For trade' } });
  const binder = (confirmedAt: string) => ({
    id: 'b1',
    freshness: { state: 'ACTIVE' as const, confirmedAt, updatedAt: confirmedAt, label: '' },
  });

  it('offers "Still have them" until the binder is confirmed after the reminder', () => {
    const stale = reminder('BINDER_STALE_WARNING', 'b1');
    expect(reminderState(stale, [binder('2026-09-01T00:00:00Z')])).toBe('pending');
    expect(reminderState(stale, undefined)).toBe('pending');
    expect(reminderState(stale, [binder('2026-10-20T12:00:00Z')])).toBe('confirmed');
    expect(reminderState(stale, [binder('2026-10-21T08:00:00Z')])).toBe('confirmed');
    expect(reminderState(reminder('BINDER_EXPIRING', 'b1'), [binder('2026-10-21T08:00:00Z')])).toBe(
      'confirmed'
    );
  });

  it('offers only "Review the binder" once listings left search, and nothing for a binder gone', () => {
    expect(reminderState(reminder('BINDER_HIDDEN', 'b1'), [binder('2026-09-01T00:00:00Z')])).toBe(
      'hidden'
    );
    expect(reminderState(reminder('BINDER_STALE_WARNING', 'b1'), [])).toBe('gone');
    expect(reminderState(reminder('BINDER_HIDDEN', 'b1'), [])).toBe('gone');
    expect(reminderState(reminder('BINDER_STALE_WARNING', null), [])).toBe('unfiled');
    expect(
      reminderState(n({ type: 'BINDER_STALE_WARNING', data: { binderId: 'unfiled' } }), [])
    ).toBe('unfiled');
  });
});

describe('New and Earlier', () => {
  const unread = (id: string) => n({ id, readAt: null });
  const read = (id: string) => n({ id, readAt: '2026-10-20T00:00:00Z' });

  it('puts the unread ones under New with "Mark all as read", the rest under Earlier', () => {
    const rows = listRows(
      [unread('a'), unread('b')],
      [unread('a'), read('c'), unread('b'), read('d')]
    );
    expect(
      rows.map((row) =>
        row.kind === 'heading' ? `#${row.section}${row.markAll ? '+' : ''}` : row.key
      )
    ).toEqual(['#fresh+', 'a', 'b', '#earlier', 'c', 'd']);
  });

  it('keeps a row read since in New without "Mark all as read" once none is unread', () => {
    const rows = listRows([read('a')], [read('a'), read('c')]);
    expect(rows[0]).toMatchObject({ kind: 'heading', section: 'fresh', markAll: false });
    expect(rows.map((row) => row.key)).toEqual(['heading-fresh', 'a', 'heading-earlier', 'c']);
  });

  it('shows no heading without rows', () => {
    expect(listRows([], [])).toEqual([]);
    expect(listRows([], [read('c')]).map((row) => row.key)).toEqual(['heading-earlier', 'c']);
    expect(listRows([unread('a')], [unread('a')]).map((row) => row.key)).toEqual([
      'heading-fresh',
      'a',
    ]);
  });
});
