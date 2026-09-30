import type { PrintingSummary, WishlistItemResponse } from '@orenji/api-client';
import { WishlistItemResponseTradePreferenceEnum as Trade } from '@orenji/api-client';
import {
  isTradePreference,
  matchCountLabel,
  printingOptionLabel,
  tradePreferenceInfo,
  wishCriteriaChips,
  wishPrintingLabel,
} from './wishlist-labels';

const PRINTING: PrintingSummary = {
  id: 'p1',
  setCode: 'AZR',
  setName: 'Azure Dawn',
  printingCode: 'AZR-EN001',
  rarity: 'Ultra Rare',
  edition: 'FIRST_EDITION',
  language: 'en',
};

function wish(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'yugioh',
    card: { id: 'c1', name: 'Azure-Eyes Sky Dragon', imageUrl: null },
    currency: 'CAD',
    radiusKm: 25,
    tradePreference: Trade.Any,
    notes: '',
    active: true,
    matchCount: 0,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('wishlist labels', () => {
  it('describes the trade preferences', () => {
    expect(tradePreferenceInfo('TRADE').label).toBe('Trade only');
    expect(tradePreferenceInfo('SALE').label).toBe('Buy only');
    expect(tradePreferenceInfo('nonsense').value).toBe('ANY');
    expect(isTradePreference('SALE')).toBe(true);
    expect(isTradePreference('BUY')).toBe(false);
  });

  it('lists only the criteria that are set, radius and trade preference always', () => {
    expect(wishCriteriaChips(wish()).map((chip) => chip.label)).toEqual([
      'Within 25 km',
      'Trade or buy',
    ]);
    const chips = wishCriteriaChips(
      wish({
        conditionMin: 'LIGHTLY_PLAYED',
        edition: 'FIRST_EDITION',
        language: 'fr',
        rarity: 'Ultra Rare',
        maxPrice: 60,
        radiusKm: 10,
        tradePreference: Trade.Trade,
      }),
    );
    expect(chips.map((chip) => chip.kind)).toEqual([
      'condition',
      'edition',
      'language',
      'rarity',
      'price',
      'radius',
      'trade',
    ]);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Lightly Played or better',
      '1st Edition',
      'French',
      'Ultra Rare',
      'Up to $60.00',
      'Within 10 km',
      'Trade only',
    ]);
  });

  it('leaves the rarity out of a wish for one printing (the printing has one)', () => {
    const chips = wishCriteriaChips(wish({ printing: PRINTING, rarity: 'Ultra Rare' }));
    expect(chips.some((chip) => chip.kind === 'rarity')).toBe(false);
  });

  it('names printings and match counts', () => {
    expect(wishPrintingLabel(null)).toBe('Any printing');
    expect(wishPrintingLabel(PRINTING)).toBe('AZR-EN001 · Azure Dawn');
    expect(printingOptionLabel(PRINTING)).toBe(
      'AZR-EN001 · Azure Dawn · Ultra Rare · 1st Edition · English',
    );
    expect(matchCountLabel(0)).toBe('No matches yet');
    expect(matchCountLabel(undefined)).toBe('No matches yet');
    expect(matchCountLabel(1)).toBe('1 match');
    expect(matchCountLabel(4)).toBe('4 matches');
  });
});
