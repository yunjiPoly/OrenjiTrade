import type { WishlistItemResponse } from '@orenji/api-client';
import { WishlistItemResponseTradePreferenceEnum as Trade } from '@orenji/api-client';
import {
  ANY,
  applyServerErrors,
  clampRadius,
  createWishForm,
  newWishDefaults,
  radiusSliderMax,
  toCreateWishRequest,
  toUpdateWishRequest,
  wishFieldError,
  wishFormFromItem,
} from './wishlist-form';

function item(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'pokemon',
    card: { id: 'c1', name: 'Emberfang Fox' },
    printing: { id: 'p1', printingCode: 'PFT-002' },
    rarity: null,
    conditionMin: 'NEAR_MINT',
    edition: null,
    language: 'en',
    maxPrice: 25,
    currency: 'USD',
    radiusKm: 12,
    tradePreference: Trade.Sale,
    notes: 'For my deck',
    active: false,
    matchCount: 0,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('wishlist form', () => {
  it('bounds the radius slider by the plan (100 km at most, unlimited plans included)', () => {
    expect(radiusSliderMax(25)).toBe(25);
    expect(radiusSliderMax(null)).toBe(100);
    expect(radiusSliderMax(undefined)).toBe(100);
    expect(radiusSliderMax(500)).toBe(100);
    expect(radiusSliderMax(0)).toBe(1);
    expect(clampRadius(40, 25)).toBe(25);
    expect(clampRadius(0, 25)).toBe(1);
    expect(clampRadius(Number.NaN, 100)).toBe(25);
  });

  it('starts a new wish on any printing (or the given one) with the default radius', () => {
    expect(newWishDefaults(null, 25)).toEqual({
      printingId: ANY,
      conditionMin: ANY,
      edition: ANY,
      language: ANY,
      rarity: ANY,
      maxPrice: null,
      currency: 'CAD',
      radiusKm: 25,
      tradePreference: 'ANY',
      notes: '',
      active: true,
    });
    expect(newWishDefaults('p1', 10).printingId).toBe('p1');
    expect(newWishDefaults('p1', 10).radiusKm).toBe(10);
  });

  it('sends the card for "any printing" (with the rarity) and the printing otherwise', () => {
    const anyPrinting = toCreateWishRequest(
      { ...newWishDefaults(null, 25), rarity: 'Ultra Rare', maxPrice: 60, notes: '  ' },
      'c1',
    );
    expect(anyPrinting).toEqual({
      cardId: 'c1',
      rarity: 'Ultra Rare',
      maxPrice: 60,
      currency: 'CAD',
      radiusKm: 25,
      tradePreference: 'ANY',
      active: true,
    });
    const onePrinting = toCreateWishRequest(
      {
        ...newWishDefaults('p1', 25),
        rarity: 'Ultra Rare',
        conditionMin: 'LIGHTLY_PLAYED',
        language: 'fr',
        notes: 'Deck',
      },
      'c1',
    );
    expect(onePrinting).toEqual({
      printingId: 'p1',
      conditionMin: 'LIGHTLY_PLAYED',
      language: 'fr',
      notes: 'Deck',
      currency: 'CAD',
      radiusKm: 25,
      tradePreference: 'ANY',
      active: true,
    });
  });

  it('round-trips an existing wish and clears filters with null on update', () => {
    const value = wishFormFromItem(item());
    expect(value).toEqual({
      printingId: 'p1',
      conditionMin: 'NEAR_MINT',
      edition: ANY,
      language: 'en',
      rarity: ANY,
      maxPrice: 25,
      currency: 'USD',
      radiusKm: 12,
      tradePreference: 'SALE',
      notes: 'For my deck',
      active: false,
    });
    expect(
      toUpdateWishRequest({ ...value, printingId: ANY, language: ANY, maxPrice: null }),
    ).toEqual({
      printingId: null,
      rarity: null,
      conditionMin: 'NEAR_MINT',
      edition: null,
      language: null,
      maxPrice: null,
      currency: 'USD',
      radiusKm: 12,
      tradePreference: 'SALE',
      notes: 'For my deck',
      active: false,
    });
  });

  it('validates like the API with friendly messages', () => {
    const form = createWishForm(newWishDefaults(null, 25));
    form.controls.maxPrice.setValue(-1);
    expect(wishFieldError('maxPrice', form.controls.maxPrice.errors)).toBe(
      'The price cannot be negative.',
    );
    form.controls.maxPrice.setValue(1.234);
    expect(wishFieldError('maxPrice', form.controls.maxPrice.errors)).toBe(
      'Use at most two decimals.',
    );
    form.controls.maxPrice.setValue(12.5);
    expect(form.controls.maxPrice.valid).toBe(true);
    form.controls.notes.setValue('x'.repeat(501));
    expect(wishFieldError('notes', form.controls.notes.errors)).toBe(
      'Notes are limited to 500 characters.',
    );
    form.controls.currency.setValue('cad');
    expect(wishFieldError('currency', form.controls.currency.errors)).toContain('three-letter');
    expect(wishFieldError('radiusKm', null)).toBeNull();
  });

  it('puts the API field errors on their controls', () => {
    const form = createWishForm(newWishDefaults(null, 25));
    const unmapped = applyServerErrors(form, {
      radiusKm: 'must be between 1 and 20000',
      cardId: 'unknown card',
    });
    expect(form.controls.radiusKm.errors).toEqual({ server: 'must be between 1 and 20000' });
    expect(wishFieldError('radiusKm', form.controls.radiusKm.errors)).toBe(
      'must be between 1 and 20000',
    );
    expect(unmapped).toEqual(['cardId: unknown card']);
  });
});
