import { ApiError } from '@/src/api/ApiError';
import { historyEntries } from '@/src/features/offers/OfferHistory';
import { INBOX_PAGE, inboxRequest, parseInboxQuery } from '@/src/features/offers/offerInbox';
import {
  cardsError,
  cashError,
  counterValue,
  formKinds,
  newOfferValue,
  parseAmount,
  sameDeal,
  toCounterRequest,
  toCreateRequest,
  tradeLineFromInventory,
  tradeLineFromOffer,
  validateOffer,
  type OfferFormValue,
  type TradeLine,
} from '@/src/features/offers/offerForm';
import {
  allowedOfferKinds,
  expiryLabel,
  isLiveOffer,
  offerEventLabel,
  offerKindLabel,
  offerStatusInfo,
  offerTermsText,
  otherRole,
} from '@/src/features/offers/offerLabels';
import { offerProblem, problemExtension } from '@/src/features/offers/offerProblems';
import {
  canOfferOn,
  offerTargetFromItem,
  offerTargetFromMatch,
  sellerFromMarker,
  sellerFromParty,
} from '@/src/features/offers/offerTarget';
import { offerTargetFor, useOfferTargets } from '@/src/features/offers/offerTargetStore';

import {
  BUYER_ITEM_ID,
  OTHER_ID,
  itemFixture,
  markerFixture,
  matchingItemFixture,
  offerFixture,
  offerPartyFixture,
  publicItemFixture,
} from '../support/fixtures';

function apiError(
  status: number,
  errorCode: string,
  message = '',
  extra: Record<string, unknown> = {},
  fieldErrors: Record<string, string> = {}
): ApiError {
  return new ApiError({
    status,
    errorCode,
    message,
    fieldErrors,
    problem: { errorCode, status, ...extra },
  });
}

const line = (overrides: Partial<TradeLine> = {}): TradeLine => ({
  inventoryItemId: BUYER_ITEM_ID,
  quantity: 1,
  maxQuantity: 2,
  cardName: 'Lantern Fox',
  game: 'pokemon',
  ...overrides,
});

const value = (overrides: Partial<OfferFormValue> = {}): OfferFormValue => ({
  ...newOfferValue(['CASH'], 'CAD'),
  ...overrides,
});

describe('offer labels', () => {
  it('words kinds, statuses and terms like the web', () => {
    expect(offerKindLabel('MIXED')).toBe('Cash + cards');
    expect(offerKindLabel('???')).toBe('Offer');
    expect(offerStatusInfo('CANCELLED')).toMatchObject({ label: 'Withdrawn', tone: 'muted' });
    expect(offerStatusInfo('EXPIRED').label).toBe('Expired');
    expect(offerStatusInfo('NEW_STATUS')).toMatchObject({ label: 'NEW_STATUS', tone: 'info' });
    expect(isLiveOffer('COUNTERED')).toBe(true);
    expect(isLiveOffer('ACCEPTED')).toBe(false);
    expect(otherRole('BUYER')).toBe('SELLER');
    expect(offerTermsText({ kind: 'CASH', cashAmount: 40, currency: 'CAD', cards: 0 })).toBe(
      '$40.00'
    );
    expect(offerTermsText({ kind: 'TRADE', cards: [{ quantity: 2 }, { quantity: 1 }] })).toBe(
      '3 cards'
    );
    expect(offerTermsText({ kind: 'MIXED', cashAmount: 20, currency: 'CAD', cards: 1 })).toBe(
      '$20.00 + 1 card'
    );
    expect(offerTermsText({ kind: 'TRADE', cards: 0 })).toBe('Trade offer');
  });

  it('allows the kinds of the card availability', () => {
    expect(allowedOfferKinds('SALE', true)).toEqual(['CASH']);
    expect(allowedOfferKinds('TRADE', true)).toEqual(['TRADE']);
    expect(allowedOfferKinds('TRADE_OR_SALE', true)).toEqual(['CASH', 'TRADE', 'MIXED']);
    expect(allowedOfferKinds('TRADE_OR_SALE', false)).toEqual([]);
    expect(allowedOfferKinds('COLLECTION_ONLY', true)).toEqual([]);
  });

  it('words history events and expiries', () => {
    const names = { SELLER: 'Noé', BUYER: 'Maïka' };
    expect(offerEventLabel('CREATED', 'BUYER', 'BUYER', names)).toBe('You made the offer');
    expect(offerEventLabel('COUNTERED', 'SELLER', 'BUYER', names)).toBe('Noé sent a counter-offer');
    expect(offerEventLabel('EXPIRED', null, 'BUYER', names)).toBe('The offer expired');
    expect(offerEventLabel('SOMETHING_NEW', null, 'BUYER', names)).toBe('something new');
    const now = Date.parse('2026-10-05T12:00:00Z');
    expect(expiryLabel('2026-10-07T12:00:00Z', now)).toBe('Expires in 2 days');
    expect(expiryLabel('2026-10-05T09:00:00Z', now)).toBe('Expired 3 hours ago');
    expect(expiryLabel(null, now)).toBeNull();
  });

  it('keeps only the other party’s latest view in the history', () => {
    const offer = offerFixture();
    const created = offer.history[0]!;
    const viewed = (id: string, actor: 'BUYER' | 'SELLER') => ({
      ...created,
      id,
      event: 'VIEWED' as const,
      actorRole: actor,
    });
    const entries = historyEntries(
      [
        created,
        viewed('v1', 'SELLER'),
        viewed('v2', 'BUYER'),
        viewed('v3', 'SELLER'),
        {
          ...created,
          id: 'c2',
          event: 'COUNTERED',
          actorRole: 'SELLER',
          terms: {
            ...created.terms,
            kind: 'MIXED',
            cashAmount: 10,
            tradeItems: [{ cardName: 'Lantern Fox', quantity: 2 }],
            message: 'Add a fox?',
          },
        },
        { ...created, id: 'd1', event: 'DECLINED', actorRole: 'BUYER', reason: 'Too much' },
      ],
      'BUYER',
      { SELLER: 'Noé', BUYER: 'Maïka' }
    );
    expect(entries.map((entry) => entry.id)).toEqual([created.id, 'v3', 'c2', 'd1']);
    expect(entries[0]).toMatchObject({ label: 'You made the offer', terms: '$40.00', mine: true });
    expect(entries[2]).toMatchObject({
      label: 'Noé sent a counter-offer',
      terms: '$10.00 + 2 cards (Lantern Fox ×2)',
      note: 'Add a fox?',
    });
    expect(entries[3]).toMatchObject({ label: 'You declined', reason: 'Too much', terms: null });
  });
});

describe('offer form', () => {
  it('validates the amount, the cards, the note and the expiry', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('1e3')).toBeNaN();
    expect(cashError('CASH', '')).toBe('Enter the amount you offer.');
    expect(cashError('CASH', '0')).toBe('Enter an amount above 0.');
    expect(cashError('CASH', 'abc')).toBe('Enter an amount above 0.');
    expect(cashError('CASH', '10.123')).toBe('Use at most 2 decimals.');
    expect(cashError('CASH', '99999999999')).toBe('That amount is too large.');
    expect(cashError('TRADE', '')).toBeNull();
    expect(cardsError('TRADE', [])).toBe('Pick at least one of your cards to trade.');
    expect(cardsError('MIXED', [line({ quantity: 3 })])).toBe(
      'Check the number of copies of each card.'
    );
    expect(
      cardsError(
        'TRADE',
        Array.from({ length: 11 }, (_, i) => line({ inventoryItemId: `i${i}` }))
      )
    ).toBe('Offer at most 10 different cards.');
    expect(cardsError('CASH', [])).toBeNull();
    expect(validateOffer(value({ cashAmount: '40' }))).toEqual({});
    expect(
      validateOffer(value({ cashAmount: '', message: 'x'.repeat(501), expiresInHours: 200 }))
    ).toEqual({
      cashAmount: 'Enter the amount you offer.',
      message: 'Keep the note under 500 characters.',
      expiresInHours: 'Choose when the offer expires.',
    });
  });

  it('builds the create and counter bodies with only the parts of the kind', () => {
    expect(toCreateRequest('item-1', value({ cashAmount: '40.5', message: '  Hi  ' }))).toEqual({
      itemId: 'item-1',
      kind: 'CASH',
      cashAmount: 40.5,
      currency: 'CAD',
      message: 'Hi',
      expiresInHours: 72,
    });
    expect(
      toCreateRequest('item-1', value({ kind: 'TRADE', cards: [line({ quantity: 2 })] }))
    ).toEqual({
      itemId: 'item-1',
      kind: 'TRADE',
      tradeItemIds: [{ inventoryItemId: BUYER_ITEM_ID, quantity: 2 }],
      expiresInHours: 72,
    });
    expect(toCounterRequest(value({ cashAmount: '35', expiresInHours: 24 }), 3)).toEqual({
      kind: 'CASH',
      cashAmount: 35,
      currency: 'CAD',
      tradeItemIds: [],
      expiresInHours: 24,
      version: 3,
    });
  });

  it('starts a counter-offer from the proposal and refuses the same deal', () => {
    const offer = offerFixture({
      kind: 'MIXED',
      cashAmount: 12.5,
      tradeItems: [{ inventoryItemId: BUYER_ITEM_ID, quantity: 1, item: publicItemFixture() }],
    });
    const start = counterValue(offer, 'CAD');
    expect(start).toMatchObject({ kind: 'MIXED', cashAmount: '12.50', message: '' });
    expect(start.cards).toHaveLength(1);
    expect(sameDeal(start, offer)).toBe(true);
    expect(sameDeal({ ...start, cashAmount: '13' }, offer)).toBe(false);
    expect(sameDeal({ ...start, cards: [] }, offer)).toBe(false);
    expect(sameDeal({ ...start, kind: 'CASH' }, offer)).toBe(false);
    expect(tradeLineFromOffer({ quantity: 1 })).toBeNull();
    expect(tradeLineFromInventory(itemFixture({ quantity: 3 }))).toMatchObject({
      quantity: 1,
      maxQuantity: 3,
    });
  });

  it('offers the kinds of a new offer, a seller counter and a buyer counter', () => {
    const target = { availability: 'TRADE_OR_SALE', acceptsOffers: true };
    expect(formKinds(target, null)).toEqual(['CASH', 'TRADE', 'MIXED']);
    expect(formKinds({ availability: 'SALE', acceptsOffers: true }, null)).toEqual(['CASH']);
    expect(formKinds(target, { viewerRole: 'SELLER', poolSize: 0 })).toEqual(['CASH']);
    expect(formKinds(target, { viewerRole: 'SELLER', poolSize: 2 })).toEqual([
      'CASH',
      'TRADE',
      'MIXED',
    ]);
    // The buyer's counters follow the card even when its offers were switched off since.
    expect(
      formKinds(
        { availability: 'TRADE', acceptsOffers: false },
        {
          viewerRole: 'BUYER',
          poolSize: 0,
        }
      )
    ).toEqual(['TRADE']);
  });
});

describe('offer problems', () => {
  it('explains every refusal of the offer and trade endpoints', () => {
    expect(
      offerProblem(apiError(422, 'OFFERS_NOT_ACCEPTED', 'This card only accepts cash offers.'))
        .message
    ).toBe('This card only accepts cash offers. Try another kind of offer.');
    const open = offerProblem(apiError(409, 'OFFER_ALREADY_OPEN', '', { offerId: 'o-1' }));
    expect(open).toMatchObject({ openOfferId: 'o-1', code: 'OFFER_ALREADY_OPEN' });
    expect(open.message).toMatch(/already have an open offer/);
    expect(offerProblem(apiError(409, 'STALE_OFFER', '', { latestOfferId: 'o-2' }))).toMatchObject({
      latestOfferId: 'o-2',
      reload: true,
    });
    expect(offerProblem(apiError(409, 'NOT_YOUR_TURN'), 'Noé').message).toBe(
      "It is Noé's turn to answer this offer."
    );
    expect(
      offerProblem(apiError(409, 'INVALID_STATE_TRANSITION', '', { currentStatus: 'EXPIRED' }))
        .message
    ).toBe('This can no longer be done: it was already expired.');
    expect(
      offerProblem(
        apiError(409, 'INVALID_STATE_TRANSITION', '', { currentStatus: 'CANCELLED' }),
        'Noé',
        'trade'
      ).message
    ).toBe('This can no longer be done: it was already cancelled.');
    expect(offerProblem(apiError(409, 'ITEM_UNAVAILABLE')).reload).toBe(true);
    expect(offerProblem(apiError(403, 'TRADING_BLOCKED'), 'Noé').message).toMatch(
      /cannot trade with Noé/
    );
    expect(offerProblem(apiError(404, 'NOT_FOUND')).message).toMatch(/no longer available/);
    expect(
      offerProblem(
        apiError(429, 'LIMIT_REACHED', '', {
          limitKey: 'offers.per_day',
          limit: 10,
          used: 10,
          planCode: 'FREE',
        })
      ).message
    ).toMatch(/You have used 10 of 10 offers today on the Free plan/);
    expect(offerProblem(apiError(429, 'LIMIT_REACHED')).message).toMatch(
      /number of offers your plan allows today/
    );
    const fields = offerProblem(
      apiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        {},
        {
          cashAmount: 'A counter-offer must change the amount or the cards',
          tradeItemIds: 'not yours',
        }
      )
    );
    expect(fields.fields).toEqual({
      cashAmount: 'A counter-offer must change the amount or the cards.',
      cards: 'Check your cards: they must be yours, with enough copies.',
    });
    expect(problemExtension(apiError(409, 'X', '', { offerId: 'bad id!' }), 'offerId')).toBeNull();
  });
});

describe('offer targets', () => {
  it('builds the card and seller from public reads and decides when to offer', () => {
    const seller = sellerFromParty(offerPartyFixture());
    expect(seller).toEqual({
      id: OTHER_ID,
      displayName: 'Noé Verdun',
      handle: 'collector2',
      avatarUrl: null,
      placeLabel: 'Plateau-Mont-Royal, Montréal',
    });
    const target = offerTargetFromItem(publicItemFixture(), seller);
    expect(target).toMatchObject({
      cardName: 'Azure-Eyes Sky Dragon',
      printingCode: 'AZR-EN001',
      askingPrice: 45,
      availability: 'TRADE_OR_SALE',
    });
    expect(canOfferOn(target, 'someone-else')).toBe(true);
    expect(canOfferOn(target, OTHER_ID)).toBe(false);
    expect(canOfferOn({ ...target, acceptsOffers: false }, null)).toBe(false);
    const marker = markerFixture();
    const fromMatch = offerTargetFromMatch(
      matchingItemFixture(),
      sellerFromMarker(marker),
      '/api/v1/public/card-images/x'
    );
    expect(fromMatch.seller.placeLabel).toBe(marker.publicLabel);
    expect(fromMatch.imageUrl).toBe('/api/v1/public/card-images/x');
  });

  it('keeps the card handed over by the entry point for the offer screen', () => {
    const target = offerTargetFromItem(publicItemFixture(), sellerFromParty(offerPartyFixture()));
    useOfferTargets.getState().clear();
    expect(offerTargetFor(target.itemId)).toBeNull();
    useOfferTargets.getState().put(target);
    expect(offerTargetFor(target.itemId)).toBe(target);
    expect(offerTargetFor(null)).toBeNull();
  });
});

describe('offers inbox query', () => {
  it('reads the tab and status and builds the request', () => {
    expect(parseInboxQuery({})).toEqual({ tab: 'received', filter: 'all' });
    expect(parseInboxQuery({ tab: 'sent', status: 'closed' })).toEqual({
      tab: 'sent',
      filter: 'closed',
    });
    expect(parseInboxQuery({ tab: 'x', status: 'nope' })).toEqual({
      tab: 'received',
      filter: 'all',
    });
    expect(inboxRequest({ tab: 'received', filter: 'all' }, null)).toEqual({
      role: 'seller',
      limit: INBOX_PAGE,
    });
    expect(inboxRequest({ tab: 'sent', filter: 'closed' }, 'c1')).toEqual({
      role: 'buyer',
      status: ['DECLINED', 'CANCELLED', 'EXPIRED'],
      cursor: 'c1',
      limit: INBOX_PAGE,
    });
  });
});
