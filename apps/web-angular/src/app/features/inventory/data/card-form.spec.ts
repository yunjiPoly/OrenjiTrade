import { item } from '../testing/fixtures';
import {
  cardFormOf,
  legacyDetails,
  newCardForm,
  noteWithLegacy,
  quantityError,
  stepQuantity,
  switchPriceMode,
  toCreateBody,
  toPatch,
  validateCardForm,
} from './card-form';

describe("the card form (decision 8: the phone's card model)", () => {
  it("adds a card the phone's way: private, trade or sale, no stated condition", () => {
    const value = { ...newCardForm('b1', 'pct'), quantity: '2', price: '85', publicNote: ' NM ' };
    expect(toCreateBody(value, 'p1')).toEqual({
      printingId: 'p1',
      quantity: 2,
      visibility: 'PRIVATE',
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      conditionStated: false,
      askingPriceText: '85% TCG',
      publicNotes: 'NM',
      binderId: 'b1',
    });
  });

  it('saves only what changed, with confirm', () => {
    const card = item('a', { quantity: 2, askingPriceText: '$11.50' });
    const form = cardFormOf(card);
    expect(toPatch(form, card)).toBeNull();
    expect(toPatch({ ...form, quantity: '3' }, card)).toEqual({ quantity: 3, confirm: true });
    expect(toPatch({ ...form, binderId: 'b2' }, card)).toEqual({
      binderId: 'b2',
      visibility: 'PRIVATE',
      confirm: true,
    });
    expect(toPatch({ ...form, price: '' }, card)).toEqual({ askingPriceText: null, confirm: true });
  });

  it('keeps a running temporary publication when only the binder changes (F4)', () => {
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const card = item('a', {
      visibility: 'TEMPORARILY_PUBLIC' as never,
      publicUntil: future,
      binder: { id: 'b1', name: 'YGO trades' } as never,
    });
    const form = cardFormOf(card);
    expect(toPatch({ ...form, binderId: 'b2' }, card)).toEqual({
      binderId: 'b2',
      visibility: 'TEMPORARILY_PUBLIC',
      confirm: true,
    });
    expect(toPatch({ ...form, binderId: null }, card)).toEqual({
      binderId: null,
      visibility: 'TEMPORARILY_PUBLIC',
      confirm: true,
    });
    // The collector's own choice wins.
    expect(toPatch({ ...form, binderId: 'b2', visibility: 'PRIVATE' }, card)).toEqual({
      binderId: 'b2',
      visibility: 'PRIVATE',
      confirm: true,
    });
  });

  it('clears the number when the price mode switches, and steps copies within 1 to 9 999', () => {
    expect(switchPriceMode({ priceMode: 'usd' }, 'pct')).toEqual({ priceMode: 'pct', price: '' });
    expect(switchPriceMode({ priceMode: 'usd' }, 'usd')).toEqual({});
    expect(stepQuantity('1', -1)).toBe('1');
    expect(stepQuantity('9999', 1)).toBe('9999');
    expect(stepQuantity('x', 1)).toBe('2');
    expect(quantityError('')).toBe('Enter how many copies you have.');
    expect(quantityError('0')).toBe('At least 1 copy.');
  });

  it('validates the price and the note', () => {
    expect(validateCardForm({ ...newCardForm(), price: '0' }).price).toBe(
      'Enter more than $0, or leave it empty.',
    );
    expect(validateCardForm({ ...newCardForm(), publicNote: 'x'.repeat(501) }).publicNote).toBe(
      'At most 500 characters.',
    );
    expect(validateCardForm(newCardForm())).toEqual({});
  });

  it("shows an old web card's condition, language and edition read-only, never for a phone card", () => {
    const old = item('a', {
      condition: 'NEAR_MINT',
      conditionStated: true,
      language: 'en',
      edition: 'FIRST_EDITION',
    });
    expect(legacyDetails(old)).toBe('Near Mint · English · 1st Edition');
    expect(legacyDetails(item('b'))).toBeNull();
    expect(noteWithLegacy('', 'Near Mint · English')).toBe('Near Mint · English');
    expect(noteWithLegacy('For trade', 'Near Mint')).toBe('For trade\nNear Mint');
    expect(noteWithLegacy('Near Mint', 'Near Mint')).toBe('Near Mint');
  });

  it('reads a running temporary publication as Public and an ended one as Private', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(
      cardFormOf(item('a', { visibility: 'TEMPORARILY_PUBLIC' as never, publicUntil: future }))
        .visibility,
    ).toBe('PUBLIC');
    expect(
      cardFormOf(
        item('a', {
          visibility: 'TEMPORARILY_PUBLIC' as never,
          publicUntil: '2020-01-01T00:00:00Z',
        }),
      ).visibility,
    ).toBe('PRIVATE');
  });
});
