import { NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import {
  isHistoryNotification,
  isUnread,
  notificationCard,
  notificationKind,
  notificationLink,
  notificationText,
  safeAppPath,
} from './notification-kinds';

describe('notification kinds', () => {
  it('gives each type an icon, a tone and a label, with a neutral fallback', () => {
    expect(notificationKind({ type: Type.WishlistAlert, data: {} })).toEqual({
      icon: 'favorite',
      tone: 'match',
      label: 'Wishlist alert',
    });
    expect(notificationKind({ type: Type.Message, data: {} }).tone).toBe('message');
    expect(notificationKind({ type: Type.BinderHidden, data: {} }).tone).toBe('warning');
    expect(notificationKind({ type: 'SOMETHING_NEW' as Type, data: {} })).toEqual({
      icon: 'notifications',
      tone: 'system',
      label: 'Notification',
    });
  });

  it('shows the daily limit notice with the limit icon', () => {
    expect(notificationKind({ type: Type.System, data: { kind: 'LIMIT_REACHED' } })).toEqual({
      icon: 'speed',
      tone: 'system',
      label: 'Limit reached',
    });
  });

  it('follows only same-app paths', () => {
    expect(safeAppPath('/cards/c-1?printing=p-1')).toBe('/cards/c-1?printing=p-1');
    expect(safeAppPath('/cards/c-1?rarity=Collector%27s%20Rare')).toBe(
      '/cards/c-1?rarity=Collector%27s%20Rare',
    );
    expect(safeAppPath('/inventory?binder=unfiled')).toBe('/inventory?binder=unfiled');
    expect(safeAppPath('//evil.example/phish')).toBeNull();
    expect(safeAppPath('https://evil.example')).toBeNull();
    expect(safeAppPath('/x" onclick="y')).toBeNull();
    expect(safeAppPath('javascript:alert(1)')).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });

  it('opens the deep link, else a page rebuilt from the ids, else the list', () => {
    expect(notificationLink({ type: Type.Message, data: { deepLink: '/messages/c1' } })).toBe(
      '/messages/c1',
    );
    // A wishlist alert opens the card page with the wish's selection.
    expect(
      notificationLink({
        type: Type.WishlistAlert,
        data: { deepLink: '/cards/c-1?rarity=Secret%20Rare', cardId: 'c-1' },
      }),
    ).toBe('/cards/c-1?rarity=Secret%20Rare');
    expect(
      notificationLink({ type: Type.WishlistAlert, data: { cardId: 'c-1', printingId: 'p-1' } }),
    ).toBe('/cards/c-1?printing=p-1');
    // Without a deep link and without a printing, "any printing" is still said explicitly.
    expect(notificationLink({ type: Type.WishlistAlert, data: { cardId: 'c-1' } })).toBe(
      '/cards/c-1?printing=any',
    );
    // The API's own link carries a rarity wish's selection.
    expect(
      notificationLink({
        type: Type.WishlistAlert,
        data: { deepLink: '/cards/c-1?rarity=Secret%20Rare', cardId: 'c-1', rarity: 'Secret Rare' },
      }),
    ).toBe('/cards/c-1?rarity=Secret%20Rare');
    expect(
      notificationLink({
        type: Type.WishlistAlert,
        data: { deepLink: '/cards/c-1?printing=any', cardId: 'c-1' },
      }),
    ).toBe('/cards/c-1?printing=any');
    expect(notificationLink({ type: Type.WishlistAlert, data: {} })).toBe('/search?tab=wishlist');
    expect(notificationLink({ type: Type.Message, data: { conversationId: 'c-9' } })).toBe(
      '/messages/c-9',
    );
    expect(notificationLink({ type: Type.BinderStaleWarning, data: { binderId: 'b-2' } })).toBe(
      '/inventory?binder=b-2',
    );
    // An old limit notice never leads to Premium (stage F1: removed); nor any old link to the
    // removed paid pages.
    expect(
      notificationLink({
        type: Type.System,
        data: {
          kind: 'LIMIT_REACHED',
          notificationType: 'WISHLIST_ALERT',
          upgradeUrl: '/premium',
          deepLink: '/premium',
        },
      }),
    ).toBe('/search?tab=wishlist');
    for (const removed of [
      '/premium?checkout=success',
      '/credits',
      '/support',
      '/checkout/fake-billing/x',
    ]) {
      expect(notificationLink({ type: Type.System, data: { deepLink: removed } })).toBe(
        '/notifications',
      );
    }
    expect(
      notificationLink({
        type: Type.System,
        data: { kind: 'LIMIT_REACHED', notificationType: 'WISHLIST_ALERT' },
      }),
    ).toBe('/search?tab=wishlist');
    expect(notificationLink({ type: Type.System, data: { kind: 'LIMIT_REACHED' } })).toBe(
      '/notifications',
    );
    expect(
      notificationLink({
        type: Type.WishlistAlert,
        data: { deepLink: 'https://evil.example', cardId: '../../x' },
      }),
    ).toBe('/search?tab=wishlist');
    expect(notificationLink({ type: Type.RatingReceived, data: {} })).toBe('/notifications');
  });

  it('opens the Phase 7 notices where they belong', () => {
    expect(
      notificationLink({
        type: Type.RatingReceived,
        data: { deepLink: '/collectors/maika?tab=ratings' },
      }),
    ).toBe('/collectors/maika?tab=ratings');
    expect(notificationLink({ type: Type.ReportDecision, data: {} })).toBe('/settings/reports');
    expect(notificationLink({ type: Type.System, data: { kind: 'LISTINGS_PAUSED' } })).toBe(
      '/inventory',
    );
    expect(notificationLink({ type: Type.System, data: { kind: 'MODERATION_WARNING' } })).toBe(
      '/legal/community-guidelines',
    );
    expect(notificationKind({ type: Type.System, data: { kind: 'LISTINGS_PAUSED' } })).toEqual({
      icon: 'pause_circle',
      tone: 'warning',
      label: 'Listings paused',
    });
    expect(
      notificationKind({ type: Type.System, data: { kind: 'MODERATION_WARNING' } }).label,
    ).toBe('Moderation');
    expect(notificationKind({ type: Type.ReportDecision, data: {} }).label).toBe('Report decision');
  });

  it('reads old offer, trade, payment and dispute notices as history (decision 2, web WA)', () => {
    for (const notice of [
      { type: Type.OfferReceived, data: { deepLink: '/offers/o-1', offerId: 'o-1' } },
      { type: Type.OfferCountered, data: { offerId: 'o-2' } },
      { type: Type.OfferAccepted, data: { offerId: 'o-2', tradeId: 't-1' } },
      { type: Type.TradeUpdate, data: { tradeId: 't-1' } },
      { type: Type.OfferExpired, data: {} },
      { type: Type.PaymentUpdate, data: { deepLink: '/settings/payouts', tradeId: 't-1' } },
      { type: Type.ShipmentStatus, data: { tradeId: 't-2' } },
      { type: Type.DisputeUpdate, data: { disputeId: 'd-1', tradeId: 't-1' } },
      { type: Type.System, data: { deepLink: '/disputes/d-1' } },
      { type: Type.System, data: { deepLink: '/checkout/fake/ref-1' } },
      { type: Type.System, data: { deepLink: '/settings/offers' } },
    ]) {
      expect(notificationLink(notice), JSON.stringify(notice)).toBe('/notifications');
    }
    // Their kinds read as history and still say what happened; the list shows them unlinked.
    expect(notificationKind({ type: Type.OfferCancelled, data: {} })).toEqual({
      icon: 'undo',
      tone: 'offer',
      label: 'Past offer · withdrawn',
    });
    expect(notificationKind({ type: Type.OfferReceived, data: {} }).label).toBe('Past offer');
    expect(notificationKind({ type: Type.OfferExpired, data: {} }).label).toBe(
      'Past offer · expired',
    );
    expect(notificationKind({ type: Type.DisputeUpdate, data: {} }).label).toBe('Past dispute');
    expect(isHistoryNotification({ type: Type.OfferReceived })).toBe(true);
    expect(isHistoryNotification({ type: Type.TradeUpdate })).toBe(true);
    expect(isHistoryNotification({ type: Type.Message })).toBe(false);
    expect(isHistoryNotification({ type: Type.System })).toBe(false);
  });

  it('heads an old notice as history, never with the server’s live words (decision 2)', () => {
    const notice = (type: string, data: Record<string, unknown>) => ({
      type: type as Type,
      title: 'New offer on Azure-Eyes Sky Dragon',
      body: 'Devon Okafor offered 20.00 CAD for Azure-Eyes Sky Dragon.',
      data,
    });
    const card = { cardName: 'Azure-Eyes Sky Dragon' };
    const offersGone = 'Offers are no longer available. Deals happen in the chat.';
    const paymentsGone =
      "Payments and disputes aren't part of OrenjiTrade. Deals happen in the chat, and the buyer pays by e-Transfer outside the app.";
    expect(notificationText(notice(Type.OfferReceived, card))).toEqual({
      title: 'Past offer on Azure-Eyes Sky Dragon',
      body: offersGone,
    });
    expect(notificationText(notice(Type.OfferAccepted, {})).title).toBe('A past offer');
    expect(notificationText(notice(Type.TradeUpdate, card))).toEqual({
      title: 'Past trade of Azure-Eyes Sky Dragon',
      body: offersGone,
    });
    expect(notificationText(notice(Type.ShipmentStatus, {})).title).toBe('A past trade');
    expect(notificationText(notice(Type.PaymentUpdate, card))).toEqual({
      title: 'Past payment for Azure-Eyes Sky Dragon',
      body: paymentsGone,
    });
    expect(notificationText(notice(Type.DisputeUpdate, { cardName: '  ' }))).toEqual({
      title: 'A past dispute',
      body: paymentsGone,
    });
    // Every other notice keeps the server's words.
    expect(notificationText(notice(Type.Message, card))).toEqual({
      title: 'New offer on Azure-Eyes Sky Dragon',
      body: 'Devon Okafor offered 20.00 CAD for Azure-Eyes Sky Dragon.',
    });
  });

  it('shows the card a payload carries, only with an API picture URL', () => {
    expect(
      notificationCard({
        data: {
          cardImageUrl: 'http://localhost:8080/api/v1/public/card-images/img-1',
          cardName: 'Azure-Eyes Sky Dragon',
          game: 'yugioh',
        },
      }),
    ).toEqual({
      imageUrl: 'http://localhost:8080/api/v1/public/card-images/img-1',
      name: 'Azure-Eyes Sky Dragon',
      game: 'yugioh',
    });
    expect(
      notificationCard({ data: { cardImageUrl: '/api/v1/public/placeholder-images/a/b.svg' } }),
    ).toEqual({ imageUrl: '/api/v1/public/placeholder-images/a/b.svg', name: '', game: null });
    // Today's wishlist alerts carry ids only: the type icon stays.
    expect(notificationCard({ data: { wishlistItemId: 'w-1', game: 'yugioh' } })).toBeNull();
    expect(notificationCard({ data: { cardImageUrl: 'javascript:alert(1)' } })).toBeNull();
    expect(notificationCard({ data: { cardImageUrl: '//evil.example/x.jpg' } })).toBeNull();
    expect(notificationCard({ data: { cardImageUrl: 42 } })).toBeNull();
    expect(notificationCard({ data: {} })).toBeNull();
  });

  it('knows unread notifications', () => {
    expect(isUnread({ readAt: null })).toBe(true);
    expect(isUnread({ readAt: '2026-09-30T10:00:00Z' })).toBe(false);
  });
});
