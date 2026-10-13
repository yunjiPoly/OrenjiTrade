import type { PrintingSummary, WishlistItemResponse } from '@orenji/api-client';
import { MarketPriceSourceEnum as Source } from '@orenji/api-client';
import {
  approximateAmount,
  priceTermLabel,
  removeConfirmation,
  whichCopyLabel,
  wishCardQuery,
  wishChips,
} from './wishlist-labels';

const PRINTING: PrintingSummary = {
  id: 'p1',
  setCode: 'AZR',
  setName: 'Azure Dawn',
  printingCode: 'AZR-EN001',
  rarity: 'Ultra Rare',
  edition: 'FIRST_EDITION',
  language: 'en',
  marketPrice: {
    amount: 25,
    currency: 'USD',
    source: Source.Ygoprodeck,
    updatedAt: '2026-10-01T00:00:00Z',
  },
};

function wish(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'yugioh',
    card: { id: 'c1', name: 'Azure-Eyes Sky Dragon', imageUrl: null },
    printing: undefined,
    rarity: null,
    note: '',
    nearMintOnly: false,
    priceTerm: undefined,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('wishlist labels', () => {
  it('shows the approximate amount of a term for a printing with a market price', () => {
    const term = { label: '85% TCG', percent: 85, orMore: false };
    expect(approximateAmount(term, PRINTING.marketPrice)).toBe('≈ 21.25 USD');
    expect(priceTermLabel(term, PRINTING.marketPrice)).toBe('85% TCG ≈ 21.25 USD');
    expect(priceTermLabel(term, null)).toBe('85% TCG');
    expect(
      priceTermLabel(
        { label: '90% TCG', percent: 90 },
        { amount: 0.99, currency: 'USD', source: Source.Sample },
      ),
    ).toBe('90% TCG ≈ 0.89 USD');
  });

  it('words which copy a wish wants', () => {
    expect(whichCopyLabel(null)).toBe('Any printing');
    expect(whichCopyLabel(null, 'Quarter Century Secret Rare')).toBe(
      'Any printing · Quarter Century Secret Rare',
    );
    expect(whichCopyLabel(PRINTING, 'ignored')).toBe(
      'AZR-EN001 · Ultra Rare · Azure Dawn · 1st Edition',
    );
    // Two printings of one code often differ only by their edition or finish: a special one is
    // named (Unlimited and Normal, the usual ones, are not).
    const unlimited = { ...PRINTING, edition: 'UNLIMITED' };
    expect(whichCopyLabel({ ...unlimited, finish: 'NORMAL' })).toBe(
      'AZR-EN001 · Ultra Rare · Azure Dawn',
    );
    expect(whichCopyLabel({ ...unlimited, finish: 'REVERSE_HOLO' })).toBe(
      'AZR-EN001 · Ultra Rare · Azure Dawn · Reverse holo',
    );
  });

  it('shows Near Mint only and the price term as chips (the term alone for any printing)', () => {
    expect(wishChips(wish())).toEqual([]);
    expect(
      wishChips(
        wish({
          printing: PRINTING,
          nearMintOnly: true,
          priceTerm: { label: '100% TCG+', percent: 100, orMore: true },
        }),
      ).map((chip) => chip.label),
    ).toEqual(['Near Mint only', '100% TCG+ ≥ 25.00 USD']);
    // The amount names its source and date (tooltip / screen readers); the term alone has none.
    expect(
      wishChips(
        wish({ printing: PRINTING, priceTerm: { label: '85% TCG', percent: 85, orMore: false } }),
      )[0].detail,
    ).toMatch(/^TCG market price: YGOPRODeck set price \(TCGplayer-based, USD\) · updated /);
    expect(
      wishChips(wish({ priceTerm: { label: '80% TCG', percent: 80, orMore: false } })).map(
        (chip) => chip.label,
      ),
    ).toEqual(['80% TCG']);
    expect(
      wishChips(wish({ priceTerm: { label: '80% TCG', percent: 80, orMore: false } }))[0].detail,
    ).toBeUndefined();
  });

  it('links a wish to the card page with its selection, said explicitly', () => {
    // "Any printing" is a selection too: the page must not pick a printing by itself.
    expect(wishCardQuery(wish())).toEqual({ printing: 'any' });
    expect(wishCardQuery(wish({ rarity: 'Secret Rare' }))).toEqual({ rarity: 'Secret Rare' });
    expect(wishCardQuery(wish({ printing: PRINTING, rarity: null }))).toEqual({ printing: 'p1' });
  });

  it('words the remove confirmation with the card and which copy', () => {
    expect(removeConfirmation(wish())).toBe(
      'Your wish for Azure-Eyes Sky Dragon (any printing) will be removed. You can add the card again later.',
    );
    expect(removeConfirmation(wish({ rarity: 'Secret Rare' }))).toContain(
      'Your wish for Azure-Eyes Sky Dragon (any printing in Secret Rare) will be removed.',
    );
    expect(removeConfirmation(wish({ printing: PRINTING, rarity: null }))).toContain(
      `Your wish for Azure-Eyes Sky Dragon (${whichCopyLabel(PRINTING)}) will be removed.`,
    );
  });
});
