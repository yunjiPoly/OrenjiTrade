import {
  TradeLine,
  cardsError,
  cashError,
  counterValue,
  createOfferForm,
  newOfferValue,
  sameDeal,
  toCounterRequest,
  toCreateRequest,
} from './offer-form';
import { offerResponse } from './testing/offer-fixtures';

function line(id: string, quantity = 1, maxQuantity = 3): TradeLine {
  return { inventoryItemId: id, quantity, maxQuantity, cardName: `Card ${id}`, game: 'mtg' };
}

describe('offer form', () => {
  it('requires a positive cash amount with at most 2 decimals for cash offers', () => {
    const form = createOfferForm(newOfferValue(['CASH'], 'CAD'));
    const cash = form.controls.cashAmount;
    expect(cashError(cash.errors)).toBe('Enter the amount you offer.');
    cash.setValue(0);
    expect(cashError(cash.errors)).toBe('Enter an amount above 0.');
    cash.setValue(12.345);
    expect(cashError(cash.errors)).toBe('Use at most 2 decimals.');
    cash.setValue(12.34);
    expect(cash.valid).toBe(true);
    // Cards are not needed for a cash offer.
    expect(form.controls.cards.valid).toBe(true);
  });

  it('requires cards for trade and mixed offers, and none of the cash rules for trades', () => {
    const form = createOfferForm(newOfferValue(['TRADE'], 'CAD'));
    expect(form.controls.cashAmount.valid).toBe(true);
    expect(cardsError(form.controls.cards.errors)).toBe(
      'Pick at least one of your cards to trade.',
    );
    form.controls.cards.setValue([line('a')]);
    expect(form.controls.cards.valid).toBe(true);
    form.controls.cards.setValue([line('a', 5, 3)]);
    expect(cardsError(form.controls.cards.errors)).toBe('Check the number of copies of each card.');
    form.controls.cards.setValue(Array.from({ length: 11 }, (_, index) => line(`c${index}`)));
    expect(cardsError(form.controls.cards.errors)).toBe('Offer at most 10 different cards.');
    // Switching the kind re-runs the part validators.
    form.controls.cards.setValue([line('a')]);
    form.controls.kind.setValue('MIXED');
    expect(form.controls.cashAmount.hasError('required')).toBe(true);
  });

  it('builds the POST /offers body with only the parts of the kind', () => {
    expect(
      toCreateRequest('item-1', {
        kind: 'MIXED',
        cashAmount: 20.456,
        currency: 'CAD',
        cards: [line('a', 2)],
        message: '  See you Saturday  ',
        expiresInHours: 72,
      }),
    ).toEqual({
      itemId: 'item-1',
      kind: 'MIXED',
      cashAmount: 20.46,
      currency: 'CAD',
      tradeItemIds: [{ inventoryItemId: 'a', quantity: 2 }],
      message: 'See you Saturday',
      expiresInHours: 72,
    });
    expect(
      toCreateRequest('item-1', {
        kind: 'CASH',
        cashAmount: 38,
        currency: 'CAD',
        cards: [line('a')],
        message: '',
        expiresInHours: 24,
      }),
    ).toEqual({
      itemId: 'item-1',
      kind: 'CASH',
      cashAmount: 38,
      currency: 'CAD',
      expiresInHours: 24,
    });
  });

  it('builds counter-offers with the version seen and detects an unchanged deal', () => {
    const offer = offerResponse({ version: 3 });
    const value = counterValue(offer, 'CAD');
    expect(value).toMatchObject({ kind: 'CASH', cashAmount: 38, currency: 'CAD', message: '' });
    expect(sameDeal(value, offer)).toBe(true);
    expect(sameDeal({ ...value, cashAmount: 42 }, offer)).toBe(false);
    expect(toCounterRequest({ ...value, cashAmount: 42 }, offer.version)).toEqual({
      kind: 'CASH',
      cashAmount: 42,
      currency: 'CAD',
      tradeItemIds: [],
      expiresInHours: 72,
      version: 3,
    });

    const trade = offerResponse({
      kind: 'TRADE',
      cashAmount: null,
      currency: null,
      tradeItems: [{ inventoryItemId: 'a', quantity: 2 }],
    });
    const tradeValue = counterValue(trade, 'CAD');
    expect(tradeValue.cards.map((card) => [card.inventoryItemId, card.quantity])).toEqual([
      ['a', 2],
    ]);
    expect(sameDeal(tradeValue, trade)).toBe(true);
    expect(
      sameDeal({ ...tradeValue, cards: [{ ...tradeValue.cards[0], quantity: 1 }] }, trade),
    ).toBe(false);
  });
});
