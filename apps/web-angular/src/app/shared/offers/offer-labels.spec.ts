import {
  allowedOfferKinds,
  expiryLabel,
  isLiveOffer,
  offerEventLabel,
  offerStatusInfo,
  offerTermsText,
} from './offer-labels';
import { canOfferOn, offerTargetFromItem } from './offer-target';
import { publicItem } from './testing/offer-fixtures';

describe('offer labels', () => {
  it('offers only the kinds a card availability and its offer switch allow', () => {
    expect(allowedOfferKinds('SALE', true)).toEqual(['CASH']);
    expect(allowedOfferKinds('TRADE', true)).toEqual(['TRADE']);
    expect(allowedOfferKinds('TRADE_OR_SALE', true)).toEqual(['CASH', 'TRADE', 'MIXED']);
    expect(allowedOfferKinds('TRADE_OR_SALE', false)).toEqual([]);
    expect(allowedOfferKinds('COLLECTION_ONLY', true)).toEqual([]);
    expect(allowedOfferKinds('NOT_AVAILABLE', true)).toEqual([]);
  });

  it('words the terms of cash, trade and mixed proposals', () => {
    expect(offerTermsText({ kind: 'CASH', cashAmount: 38, currency: 'CAD', cards: [] })).toBe(
      '$38.00',
    );
    expect(offerTermsText({ kind: 'TRADE', cards: [{ quantity: 2 }, { quantity: 1 }] })).toBe(
      '3 cards',
    );
    expect(offerTermsText({ kind: 'MIXED', cashAmount: 5, currency: 'CAD', cards: 1 })).toBe(
      '$5.00 + 1 card',
    );
    expect(offerTermsText({ kind: 'CASH', cards: [] })).toBe('Cash offer');
  });

  it('names statuses (a cancelled offer was withdrawn) and knows live ones', () => {
    expect(offerStatusInfo('CANCELLED').label).toBe('Withdrawn');
    expect(offerStatusInfo('ACCEPTED').tone).toBe('success');
    expect(offerStatusInfo('SOMETHING_NEW')).toEqual({
      label: 'SOMETHING_NEW',
      icon: 'info',
      tone: 'info',
    });
    expect(isLiveOffer('OPEN')).toBe(true);
    expect(isLiveOffer('COUNTERED')).toBe(true);
    expect(isLiveOffer('EXPIRED')).toBe(false);
  });

  it('tells history events from the viewer point of view', () => {
    const names = { SELLER: 'Ada', BUYER: 'Ben' };
    expect(offerEventLabel('CREATED', 'BUYER', 'SELLER', names)).toBe('Ben made the offer');
    expect(offerEventLabel('COUNTERED', 'SELLER', 'SELLER', names)).toBe(
      'You sent a counter-offer',
    );
    expect(offerEventLabel('CANCELLED', 'BUYER', 'SELLER', names)).toBe('Ben withdrew the offer');
    expect(offerEventLabel('EXPIRED', null, 'SELLER', names)).toBe('The offer expired');
  });

  it('words the expiry relative to now', () => {
    const now = Date.parse('2026-09-30T10:00:00Z');
    expect(expiryLabel('2026-10-03T10:00:00Z', now)).toBe('Expires in 3 days');
    expect(expiryLabel('2026-09-30T07:00:00Z', now)).toBe('Expired 3 hours ago');
    expect(expiryLabel(null, now)).toBeNull();
  });

  it('shows "Make an offer" only on other collectors’ cards that accept an offer', () => {
    const seller = { id: 'seller-1', displayName: 'Ada' };
    const target = offerTargetFromItem(publicItem(), seller);
    expect(target).toMatchObject({
      itemId: 'item-1',
      cardName: 'Lantern Fox Spirit',
      printingCode: 'AZR-EN011',
      imageUrl: 'http://localhost/card.svg',
      currency: 'CAD',
    });
    expect(canOfferOn(target, 'buyer-1')).toBe(true);
    expect(canOfferOn(target, null)).toBe(true);
    expect(canOfferOn(target, 'seller-1')).toBe(false);
    expect(
      canOfferOn(offerTargetFromItem(publicItem({ acceptsOffers: false }), seller), 'buyer-1'),
    ).toBe(false);
  });
});
