import { NotificationResponse, NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import {
  bellSections,
  reminderState,
  rowTarget,
  rowText,
  rowTime,
  rowVisual,
} from './notification-rows';

function notice(type: Type, data: Record<string, unknown> = {}, readAt: string | null = null) {
  return {
    id: `${type}-1`,
    type,
    title: 'Title',
    body: 'Body',
    data,
    createdAt: '2026-10-28T12:00:00Z',
    readAt,
  } as NotificationResponse;
}

describe('notification rows (spec 12, board W24)', () => {
  it('words a wishlist alert with the province and "{handle} · {price}", never a city', () => {
    const row = rowText(
      notice(Type.WishlistAlert, {
        cardName: 'Maxx "C"',
        province: 'Quebec',
        collectorHandle: 'maya_k',
        askingPriceText: '$14.00',
      }),
    );
    expect(row).toEqual({
      strong: 'Maxx "C"',
      rest: 'from your wishlist was listed in Quebec',
      sub: 'maya_k · $14.00',
    });
    expect(rowVisual(notice(Type.WishlistAlert))).toEqual({ tone: 'wish', icon: 'heart' });
  });

  it('words a sale, a rating, a reminder and a report decision as the phone does', () => {
    expect(
      rowText(
        notice(Type.SaleRecorded, {
          sellerHandle: 'lucas.tcg',
          itemName: 'Nibiru',
          hasTracking: false,
        }),
      ),
    ).toEqual({
      strong: 'lucas.tcg',
      rest: 'marked Nibiru as sold to you',
      sub: 'Rate them when it arrives.',
    });
    expect(rowText(notice(Type.RatingReceived, { raterHandle: 'maya_k', overall: 5 })).rest).toBe(
      'rated you 5 stars',
    );
    const reminder = rowText(
      notice(Type.BinderStaleWarning, {
        binderName: 'Trade binder',
        itemCount: 8,
        hidesAt: '2026-10-26T12:00:00Z',
      }),
    );
    expect(reminder.strong).toBe('Trade binder:');
    expect(reminder.rest).toBe('do you still have these 8 cards?');
    expect(reminder.sub).toBe('Confirm them, or they leave search on Oct 26.');
    expect(rowText(notice(Type.ReportDecision, { status: 'ACTIONED' })).sub).toBe(
      'We took action.',
    );
  });

  it('reads old offers, trades, payments and disputes as history that opens nothing', () => {
    const offer = notice(Type.OfferReceived, { cardName: 'Ash Blossom' });
    expect(rowText(offer).strong).toBe('Past offer on Ash Blossom');
    expect(rowTarget(offer, 'me')).toBeNull();
    expect(rowTarget(notice(Type.DisputeUpdate), 'me')).toBeNull();
    expect(rowVisual(notice(Type.TradeUpdate)).tone).toBe('flag');
  });

  it('leads a rating to your ratings and a reminder nowhere (it has its own buttons)', () => {
    expect(rowTarget(notice(Type.RatingReceived), 'sam_trades')).toBe(
      '/collectors/sam_trades?tab=ratings',
    );
    expect(rowTarget(notice(Type.BinderStaleWarning, { binderId: 'b1' }), 'me')).toBeNull();
  });

  it("knows a reminder's state from your binders", () => {
    const n = notice(Type.BinderStaleWarning, { binderId: 'b1' });
    expect(reminderState(n, null)).toBe('pending');
    expect(reminderState(n, [])).toBe('gone');
    expect(
      reminderState(n, [{ id: 'b1', freshness: { confirmedAt: '2026-10-29T00:00:00Z' } } as never]),
    ).toBe('confirmed');
    expect(reminderState(notice(Type.BinderStaleWarning, { binderId: 'unfiled' }), null)).toBe(
      'unfiled',
    );
  });

  it('splits the bell into New and Earlier, and words the times', () => {
    const sections = bellSections([
      notice(Type.WishlistAlert),
      notice(Type.RatingReceived, {}, '2026-10-28T13:00:00Z'),
    ]);
    expect(sections.fresh.map((n) => n.type)).toEqual([Type.WishlistAlert]);
    expect(sections.earlier.map((n) => n.type)).toEqual([Type.RatingReceived]);
    const now = new Date(2026, 9, 29, 15, 0);
    expect(rowTime(new Date(2026, 9, 29, 14, 55).toISOString(), now)).toBe('5 min');
    expect(rowTime(new Date(2026, 9, 29, 9, 0).toISOString(), now)).toBe('6 h');
    expect(rowTime(new Date(2026, 9, 26, 9, 0).toISOString(), now)).toBe('Mon');
    expect(rowTime(new Date(2026, 8, 30, 9, 0).toISOString(), now)).toBe('Sep 30');
  });
});
