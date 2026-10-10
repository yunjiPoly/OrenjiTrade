import { NotificationResponseTypeEnum as Type } from '@orenji/api-client';
import {
  isUnread,
  notificationCard,
  notificationKind,
  notificationLink,
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

  it('shows the plan-limit notice with the premium icon', () => {
    expect(notificationKind({ type: Type.System, data: { kind: 'LIMIT_REACHED' } })).toEqual({
      icon: 'workspace_premium',
      tone: 'system',
      label: 'Plan limit',
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
    expect(notificationLink({ type: Type.WishlistAlert, data: {} })).toBe('/wishlist');
    expect(notificationLink({ type: Type.Message, data: { conversationId: 'c-9' } })).toBe(
      '/messages/c-9',
    );
    expect(notificationLink({ type: Type.BinderStaleWarning, data: { binderId: 'b-2' } })).toBe(
      '/inventory?binder=b-2',
    );
    // A plan-limit notice leads to Premium only when the API offered it (premiumPlans on).
    expect(
      notificationLink({
        type: Type.System,
        data: { kind: 'LIMIT_REACHED', upgradeUrl: '/premium', deepLink: '/premium' },
      }),
    ).toBe('/premium');
    expect(
      notificationLink({
        type: Type.System,
        data: { kind: 'LIMIT_REACHED', notificationType: 'WISHLIST_ALERT' },
      }),
    ).toBe('/wishlist');
    expect(notificationLink({ type: Type.System, data: { kind: 'LIMIT_REACHED' } })).toBe(
      '/notifications',
    );
    expect(
      notificationLink({
        type: Type.WishlistAlert,
        data: { deepLink: 'https://evil.example', cardId: '../../x' },
      }),
    ).toBe('/wishlist');
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

  it('opens offers and trades (Phase 8), with the new withdrawn / expired kinds', () => {
    expect(
      notificationLink({
        type: Type.OfferReceived,
        data: { deepLink: '/offers/o-1', offerId: 'o-1' },
      }),
    ).toBe('/offers/o-1');
    expect(notificationLink({ type: Type.OfferCountered, data: { offerId: 'o-2' } })).toBe(
      '/offers/o-2',
    );
    expect(
      notificationLink({ type: Type.OfferAccepted, data: { offerId: 'o-2', tradeId: 't-1' } }),
    ).toBe('/trades/t-1');
    expect(notificationLink({ type: Type.TradeUpdate, data: { tradeId: 't-1' } })).toBe(
      '/trades/t-1',
    );
    expect(notificationLink({ type: Type.TradeUpdate, data: {} })).toBe('/trades');
    expect(notificationLink({ type: Type.OfferExpired, data: {} })).toBe('/offers');
    expect(notificationKind({ type: Type.OfferCancelled, data: {} })).toEqual({
      icon: 'undo',
      tone: 'offer',
      label: 'Offer withdrawn',
    });
    expect(notificationKind({ type: Type.OfferExpired, data: {} }).label).toBe('Offer expired');
  });

  it('opens the Phase 9 payment, shipment and dispute notices where they belong', () => {
    expect(
      notificationLink({
        type: Type.PaymentUpdate,
        data: { deepLink: '/settings/payouts', tradeId: 't-1' },
      }),
    ).toBe('/settings/payouts');
    expect(notificationLink({ type: Type.PaymentUpdate, data: { tradeId: 't-1' } })).toBe(
      '/trades/t-1',
    );
    expect(notificationLink({ type: Type.ShipmentStatus, data: { tradeId: 't-2' } })).toBe(
      '/trades/t-2',
    );
    expect(
      notificationLink({ type: Type.DisputeUpdate, data: { disputeId: 'd-1', tradeId: 't-1' } }),
    ).toBe('/disputes/d-1');
    expect(notificationLink({ type: Type.DisputeUpdate, data: { tradeId: 't-1' } })).toBe(
      '/trades/t-1',
    );
    expect(notificationKind({ type: Type.DisputeUpdate, data: {} })).toEqual({
      icon: 'gavel',
      tone: 'warning',
      label: 'Dispute',
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
