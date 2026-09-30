import type {
  OfferParty,
  OfferResponse,
  PublicInventoryItem,
  TradeResponse,
} from '@orenji/api-client';

/** Fictional offer and trade DTOs for unit tests (shapes of the generated client). */

/** Overrides where the generated enums may be given as their string values. */
export type Loose<T> = { [K in keyof T]?: unknown };

export function publicItem(overrides: Loose<PublicInventoryItem> = {}): PublicInventoryItem {
  return {
    id: 'item-1',
    printing: {
      id: 'printing-1',
      printingCode: 'AZR-EN011',
      setName: 'Azure Dawn',
      images: [{ kind: 'FRONT', url: 'http://localhost/card.svg' }],
    },
    card: { id: 'card-1', name: 'Lantern Fox Spirit', game: 'yugioh' },
    quantity: 2,
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'FIRST_EDITION',
    finish: 'NORMAL',
    askingPrice: 45,
    currency: 'CAD',
    availability: 'TRADE_OR_SALE',
    acceptsOffers: true,
    publicNotes: '',
    images: [],
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-09-29T10:00:00Z',
      updatedAt: '2026-09-29T10:00:00Z',
      label: 'Updated yesterday',
    },
    ...overrides,
  } as PublicInventoryItem;
}

export function party(id: string, displayName: string): OfferParty {
  return {
    id,
    handle: displayName.toLowerCase().replace(/\W+/g, '_'),
    displayName,
    avatarUrl: null,
    location: { publicLabel: 'Plateau-Mont-Royal, Montréal', distanceBucket: 'KM_1_5' },
    rating: { average: null, count: 0 },
  } as OfferParty;
}

export function offerResponse(overrides: Loose<OfferResponse> = {}): OfferResponse {
  return {
    id: 'offer-1',
    rootOfferId: 'offer-1',
    counterOf: null,
    latestOfferId: 'offer-1',
    item: publicItem(),
    seller: party('seller-1', 'Ada Seller'),
    buyer: party('buyer-1', 'Ben Buyer'),
    viewerRole: 'SELLER',
    kind: 'CASH',
    cashAmount: 38,
    currency: 'CAD',
    tradeItems: [],
    message: 'Could we meet at the library?',
    status: 'OPEN',
    currentTurn: 'SELLER',
    superseded: false,
    expiresAt: '2026-10-03T10:00:00Z',
    version: 0,
    protectionRequested: false,
    allowedActions: ['ACCEPT', 'COUNTER', 'DECLINE'],
    tradeId: null,
    history: [
      {
        id: 'event-1',
        offerId: 'offer-1',
        event: 'CREATED',
        actorRole: 'BUYER',
        reason: null,
        terms: {
          status: 'OPEN',
          kind: 'CASH',
          cashAmount: 38,
          currency: 'CAD',
          tradeItems: [],
          message: 'Could we meet at the library?',
          currentTurn: 'SELLER',
          expiresAt: '2026-10-03T10:00:00Z',
          version: 0,
        },
        createdAt: '2026-09-30T10:00:00Z',
      },
    ],
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    closedAt: null,
    ...overrides,
  } as OfferResponse;
}

export function tradeResponse(overrides: Loose<TradeResponse> = {}): TradeResponse {
  const offer = offerResponse({
    status: 'ACCEPTED',
    allowedActions: [],
    tradeId: 'trade-1',
    viewerRole: 'BUYER',
  });
  return {
    id: 'trade-1',
    offer,
    viewerRole: 'BUYER',
    counterparty: offer.seller,
    kind: 'CASH',
    cashAmount: 38,
    currency: 'CAD',
    status: 'AGREED',
    protectionEnabled: false,
    meetup: false,
    buyerMarkedMeetup: false,
    sellerMarkedMeetup: false,
    buyerConfirmedAt: null,
    sellerConfirmedAt: null,
    nextAction: { actor: 'BUYER', action: 'MEET' },
    allowedOperations: ['MARK_MEETUP', 'CONFIRM_COMPLETION', 'CANCEL'],
    timeline: [
      {
        id: 'te-1',
        event: 'CREATED',
        actorRole: 'SELLER',
        details: { status: 'AGREED' },
        createdAt: '2026-09-30T11:00:00Z',
      },
    ],
    cancelReason: null,
    createdAt: '2026-09-30T11:00:00Z',
    updatedAt: '2026-09-30T11:00:00Z',
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  } as TradeResponse;
}
