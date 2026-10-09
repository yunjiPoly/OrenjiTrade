import { ApiError } from '@/src/api/ApiError';
import {
  WISH_NOTE_MAX,
  copyOptions,
  copyValue,
  hasWishErrors,
  newWishDefaults,
  noteLength,
  toCreateWishRequest,
  toUpdateWishRequest,
  validateWish,
  withCopy,
  wishFormFromItem,
  wishSaveError,
} from '@/src/features/wishlist/wishForm';
import {
  addedMessage,
  approximateAmount,
  marketPriceSource,
  priceTermLabel,
  printingOptionLabel,
  whichCopyLabel,
  wishCardParams,
  wishChips,
} from '@/src/features/wishlist/wishlistLabels';
import { alertReadiness, wishUsage } from '@/src/features/wishlist/WishlistNotices';

import {
  CARD_ID,
  PRINTING_A,
  locationFixture,
  planFixture,
  printingFixture,
  wishFixture,
} from '../support/fixtures';

describe('wish form', () => {
  it('starts new wishes on any printing, one rarity or one printing, nothing else', () => {
    expect(newWishDefaults()).toEqual({
      printingId: '',
      rarity: '',
      note: '',
      nearMintOnly: false,
      priceTerm: '',
    });
    expect(newWishDefaults({ printingId: PRINTING_A, rarity: 'x' })).toMatchObject({
      printingId: PRINTING_A,
      rarity: '',
    });
    expect(newWishDefaults({ rarity: 'Secret Rare' }).rarity).toBe('Secret Rare');
    expect(wishFormFromItem(wishFixture())).toEqual({
      printingId: '',
      rarity: '',
      note: 'For my deck.',
      nearMintOnly: true,
      priceTerm: '85% TCG',
    });
    for (const removed of [
      'maxPrice',
      'currency',
      'tradePreference',
      'notes',
      'active',
      'radiusKm',
    ]) {
      expect(wishFormFromItem(wishFixture())).not.toHaveProperty(removed);
    }
  });

  it('validates the public note like the API (280 characters, code points)', () => {
    const value = newWishDefaults();
    expect(validateWish(value)).toEqual({});
    expect(noteLength('🃏'.repeat(WISH_NOTE_MAX))).toBe(WISH_NOTE_MAX);
    expect(validateWish({ ...value, note: 'é'.repeat(WISH_NOTE_MAX) })).toEqual({});
    const tooLong = validateWish({ ...value, note: 'x'.repeat(WISH_NOTE_MAX + 1) });
    expect(tooLong.note).toBe('The note is limited to 280 characters.');
    expect(hasWishErrors(tooLong)).toBe(true);
  });

  it('chooses which copy: any printing, any printing of one rarity, one printing', () => {
    const printings = [
      printingFixture({ id: 'p1', printingCode: 'AZR-EN001', rarity: 'Ultra Rare' }),
      printingFixture({ id: 'p2', printingCode: 'AZR-EN001', rarity: 'Secret Rare' }),
    ];
    const options = copyOptions(printings);
    expect(options.map((option) => option.value)).toEqual([
      '',
      'rarity:Ultra Rare',
      'rarity:Secret Rare',
      'p1',
      'p2',
    ]);
    expect(options[1]?.label).toBe('Any printing · Ultra Rare');
    // One rarity only: no rarity choices.
    expect(copyOptions([printings[0]!]).map((option) => option.value)).toEqual(['', 'p1']);

    const base = newWishDefaults();
    const rarity = withCopy(base, 'rarity:Secret Rare');
    expect(rarity).toMatchObject({ printingId: '', rarity: 'Secret Rare' });
    expect(copyValue(rarity)).toBe('rarity:Secret Rare');
    const printing = withCopy(rarity, 'p1');
    expect(printing).toMatchObject({ printingId: 'p1', rarity: '' });
    expect(copyValue(printing)).toBe('p1');
    expect(withCopy(printing, '')).toMatchObject({ printingId: '', rarity: '' });
  });

  it('builds the API bodies with only the new fields', () => {
    expect(
      toCreateWishRequest(
        {
          printingId: '',
          rarity: 'Secret Rare',
          note: ' Mint please ',
          nearMintOnly: true,
          priceTerm: '90% TCG',
        },
        CARD_ID
      )
    ).toEqual({
      cardId: CARD_ID,
      rarity: 'Secret Rare',
      note: 'Mint please',
      nearMintOnly: true,
      priceTerm: '90% TCG',
    });
    const exact = toCreateWishRequest(
      { printingId: PRINTING_A, rarity: 'x', note: '', nearMintOnly: false, priceTerm: '' },
      CARD_ID
    );
    expect(exact).toEqual({ printingId: PRINTING_A, nearMintOnly: false });
    expect(
      toUpdateWishRequest({
        printingId: '',
        rarity: '',
        note: '',
        nearMintOnly: false,
        priceTerm: '',
      })
    ).toEqual({ printingId: null, rarity: null, note: null, nearMintOnly: false, priceTerm: null });
  });

  it('explains refused saves: full wishlist, same selection, field errors', () => {
    const full = wishSaveError(
      new ApiError({
        status: 429,
        errorCode: 'LIMIT_REACHED',
        message: 'limit',
        problem: { limitKey: 'wishlist.items.max', limit: 20 },
      })
    );
    expect(full.message).toBe(
      'Your wishlist is full: your plan allows 20 wishes. Remove one or upgrade to add more.'
    );
    const conflict = wishSaveError(
      new ApiError({ status: 409, errorCode: 'CONFLICT', message: '' })
    );
    expect(conflict.message).toBe(
      'This card is already on your wishlist with the same printing or rarity.'
    );
    const fields = wishSaveError(
      new ApiError({
        status: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'Validation failed',
        fieldErrors: { note: 'contains a term that is not allowed', cardId: 'unknown card' },
      })
    );
    expect(fields.fields).toEqual({ note: 'contains a term that is not allowed' });
    expect(fields.message).toContain('cardId: unknown card');
  });
});

describe('wishlist labels', () => {
  it('shows the price term with its approximate amount for one printing only', () => {
    const term = { label: '85% TCG', percent: 85, orMore: false };
    const price = { amount: 25, currency: 'USD', source: 'YGOPRODECK' as const };
    expect(approximateAmount(term, price)).toBe('≈ 21.25 USD');
    expect(priceTermLabel(term, price)).toBe('85% TCG ≈ 21.25 USD');
    expect(priceTermLabel(term, null)).toBe('85% TCG');
    expect(marketPriceSource({ ...price, updatedAt: '2026-10-01T00:00:00Z' })).toBe(
      'TCG market price: YGOPRODeck set price (TCGplayer-based, USD) · updated 2026-10-01'
    );
    expect(marketPriceSource({ amount: 1, currency: 'CAD', source: 'SAMPLE' })).toContain(
      'Sample market price'
    );
    expect(marketPriceSource(null)).toBeNull();
  });

  it('shows Near Mint only and the price term as chips', () => {
    expect(wishChips(wishFixture()).map((chip) => chip.label)).toEqual([
      'Near Mint only',
      '85% TCG',
    ]);
    expect(
      wishChips(
        wishFixture({
          printing: printingFixture(),
          nearMintOnly: false,
          priceTerm: { label: '100% TCG+', percent: 100, orMore: true },
        })
      ).map((chip) => chip.label)
    ).toEqual(['100% TCG+ ≈ 38.00 CAD']);
    expect(wishChips(wishFixture({ nearMintOnly: false, priceTerm: undefined }))).toEqual([]);
  });

  it('words which copy and links to the card page with the selection', () => {
    expect(whichCopyLabel(undefined)).toBe('Any printing');
    expect(whichCopyLabel(undefined, 'Secret Rare')).toBe('Any printing · Secret Rare');
    expect(
      whichCopyLabel(
        printingFixture({ printingCode: 'AZR-EN001', setName: 'Azure Dawn', rarity: 'Ultra Rare' })
      )
    ).toBe('AZR-EN001 · Ultra Rare · Azure Dawn');
    expect(printingOptionLabel(printingFixture())).toBe(
      'SVX-001 · Ultra Rare · Stellar Vortex · Unlimited · English'
    );
    expect(wishCardParams(wishFixture())).toEqual({ id: CARD_ID });
    expect(wishCardParams(wishFixture({ rarity: 'Secret Rare' }))).toEqual({
      id: CARD_ID,
      rarity: 'Secret Rare',
    });
    expect(wishCardParams(wishFixture({ printing: printingFixture({ id: PRINTING_A }) }))).toEqual({
      id: CARD_ID,
      printing: PRINTING_A,
    });
    expect(addedMessage(wishFixture())).toBe(
      "Azure-Eyes Sky Dragon is on your wishlist. We'll tell you when a collector of your region lists it."
    );
  });

  it('knows when alerts can arrive (a location) and reads the plan usage', () => {
    expect(alertReadiness(undefined)).toBe('unknown');
    expect(alertReadiness(locationFixture({ location: undefined }))).toBe('no-location');
    expect(alertReadiness(locationFixture())).toBe('ready');
    expect(wishUsage(planFixture())).toBeNull();
    expect(
      wishUsage({
        plan: { code: 'FREE', name: 'Free' },
        limits: [
          {
            key: 'wishlist.items.max',
            allowed: true,
            kind: 'CAP',
            window: 'TOTAL',
            limit: 20,
            used: 3,
          },
        ],
      })
    ).toEqual({ used: 3, limit: 20, planName: 'Free' });
  });
});
