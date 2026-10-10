import { ApiError } from '@/src/api/ApiError';
import { holdersParamsFor } from '@/src/features/wishlist/WishMatchCard';
import {
  hasWishErrors,
  newWishDefaults,
  parsePrice,
  toCreateWishRequest,
  toUpdateWishRequest,
  validateWish,
  wishFormFromItem,
  wishSaveError,
} from '@/src/features/wishlist/wishForm';
import {
  addedMessage,
  matchCountLabel,
  printingOptionLabel,
  tradePreferenceInfo,
  wishCriteriaChips,
  wishPrintingLabel,
} from '@/src/features/wishlist/wishlistLabels';
import { filterWishes, matchReadiness, wishUsage } from '@/src/features/wishlist/WishlistNotices';

import {
  CARD_ID,
  PRINTING_A,
  locationFixture,
  matchFixture,
  planFixture,
  printingFixture,
  publicItemFixture,
  wishFixture,
} from '../support/fixtures';

describe('wish form', () => {
  it('starts new wishes with any printing and no filter (no radius: the region, ADR 0017)', () => {
    expect(newWishDefaults(null)).toEqual({
      printingId: '',
      conditionMin: '',
      edition: '',
      language: '',
      rarity: '',
      maxPrice: '',
      currency: 'CAD',
      tradePreference: 'ANY',
      notes: '',
      active: true,
    });
    expect(newWishDefaults(PRINTING_A).printingId).toBe(PRINTING_A);
    expect(wishFormFromItem(wishFixture())).toMatchObject({
      conditionMin: 'LIGHTLY_PLAYED',
      maxPrice: '25',
      notes: 'For my deck.',
    });
    expect(wishFormFromItem(wishFixture())).not.toHaveProperty('radiusKm');
  });

  it('validates like the API', () => {
    const value = newWishDefaults(null);
    expect(validateWish(value)).toEqual({});
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('12,50')).toBe(12.5);
    expect(Number.isNaN(parsePrice('abc') as number)).toBe(true);
    const errors = validateWish({
      ...value,
      maxPrice: '1.234',
      currency: 'cad',
      notes: 'x'.repeat(501),
    });
    expect(errors).toEqual({
      maxPrice: 'Use at most two decimals.',
      currency: 'Use a three-letter currency code, like CAD.',
      notes: 'Notes are limited to 500 characters.',
    });
    expect(hasWishErrors(errors)).toBe(true);
    expect(validateWish({ ...value, maxPrice: '-3' }).maxPrice).toBe(
      'The price cannot be negative.'
    );
    expect(validateWish({ ...value, maxPrice: 'abc' }).maxPrice).toBe('Enter a valid price.');
  });

  it('builds the create body (card with any printing, rarity only then) and the full PATCH', () => {
    const any = {
      ...newWishDefaults(null),
      rarity: 'Ultra Rare',
      conditionMin: 'NEAR_MINT',
      maxPrice: '20.5',
      notes: ' note ',
    };
    expect(toCreateWishRequest(any, CARD_ID)).toEqual({
      cardId: CARD_ID,
      rarity: 'Ultra Rare',
      conditionMin: 'NEAR_MINT',
      maxPrice: 20.5,
      notes: 'note',
      currency: 'CAD',
      tradePreference: 'ANY',
      active: true,
    });
    const one = { ...any, printingId: PRINTING_A };
    expect(toCreateWishRequest(one, CARD_ID)).not.toHaveProperty('cardId');
    expect(toCreateWishRequest(one, CARD_ID)).not.toHaveProperty('rarity');
    expect(toCreateWishRequest(one, CARD_ID).printingId).toBe(PRINTING_A);
    expect(toUpdateWishRequest({ ...newWishDefaults(null), maxPrice: '' })).toEqual({
      printingId: null,
      rarity: null,
      conditionMin: null,
      edition: null,
      language: null,
      maxPrice: null,
      currency: 'CAD',
      tradePreference: 'ANY',
      notes: null,
      active: true,
    });
  });

  it('explains a refused save: full wishlist, identical wish, fields', () => {
    const limit = (limitKey: string, limitValue?: number) =>
      new ApiError({
        status: 429,
        errorCode: 'LIMIT_REACHED',
        message: 'x',
        problem: { limitKey, limit: limitValue },
      });
    expect(wishSaveError(limit('wishlist.items.max', 20)).message).toBe(
      'Your wishlist is full: your plan allows 20 wishes. Remove one or upgrade to add more.'
    );
    expect(wishSaveError(limit('wishlist.items.max')).message).toMatch(/current plan/);
    expect(
      wishSaveError(new ApiError({ status: 409, errorCode: 'CONFLICT', message: '' })).message
    ).toBe('This card is already on your wishlist with the same filters.');
    const fields = wishSaveError(
      new ApiError({
        status: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'Invalid',
        fieldErrors: { maxPrice: 'must be positive', cardId: 'unknown card' },
      })
    );
    expect(fields.fields).toEqual({ maxPrice: 'must be positive' });
    expect(fields.message).toBe('Invalid (cardId: unknown card)');
  });
});

describe('wishlist labels and notices', () => {
  it('words the criteria as chips, most selective first', () => {
    expect(wishCriteriaChips(wishFixture()).map((chip) => chip.label)).toEqual([
      'Lightly Played or better',
      'Up to $25.00',
      'Trade or buy',
    ]);
    expect(
      wishCriteriaChips(
        wishFixture({
          conditionMin: null,
          maxPrice: null,
          edition: 'FIRST_EDITION',
          language: 'fr',
          rarity: 'Ultra Rare',
          tradePreference: 'TRADE',
        })
      ).map((chip) => chip.label)
    ).toEqual(['1st Edition', 'French', 'Ultra Rare', 'Trade only']);
    expect(tradePreferenceInfo('SALE').label).toBe('Buy only');
    expect(tradePreferenceInfo('nope').value).toBe('ANY');
  });

  it('names printings, match counts and new wishes', () => {
    expect(wishPrintingLabel(null)).toBe('Any printing');
    expect(
      wishPrintingLabel(printingFixture({ printingCode: 'AZR-EN001', setName: 'Azure Dawn' }))
    ).toBe('AZR-EN001 · Azure Dawn');
    expect(printingOptionLabel(printingFixture())).toBe(
      'SVX-001 · Stellar Vortex · Ultra Rare · Unlimited · English'
    );
    expect(matchCountLabel(0)).toBe('No matches yet');
    expect(matchCountLabel(1)).toBe('1 match');
    expect(matchCountLabel(3)).toBe('3 matches');
    expect(addedMessage(wishFixture())).toBe(
      "Azure-Eyes Sky Dragon is on your wishlist. We'll tell you when a collector of your region lists it."
    );
    expect(addedMessage(wishFixture({ matchCount: 2 }))).toBe(
      'Azure-Eyes Sky Dragon is on your wishlist: 2 matches in your region already.'
    );
    expect(addedMessage(wishFixture({ active: false }))).toMatch(/alerts paused/);
  });

  it('tells whether matches can arrive and filters wishes', () => {
    expect(matchReadiness(undefined)).toBe('unknown');
    expect(matchReadiness(locationFixture({ location: undefined }))).toBe('no-location');
    // The matcher pairs regions: a hidden collector with a location still gets matches.
    expect(matchReadiness(locationFixture({ discoverable: false }))).toBe('ready');
    const items = [
      wishFixture({ id: '1', matchCount: 2 }),
      wishFixture({ id: '2', active: false }),
      wishFixture({ id: '3' }),
    ];
    expect(filterWishes(items, 'matches').map((item) => item.id)).toEqual(['1']);
    expect(filterWishes(items, 'paused').map((item) => item.id)).toEqual(['2']);
    expect(filterWishes(items, 'all')).toHaveLength(3);
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

  it('opens the holders of the matched printing (or card) in the region', () => {
    expect(holdersParamsFor(matchFixture())).toEqual({
      printing: publicItemFixture().printing.id,
    });
    expect(
      holdersParamsFor(
        matchFixture({
          item: { ...publicItemFixture(), printing: { ...printingFixture(), id: undefined } },
        })
      )
    ).toEqual({ card: CARD_ID });
  });
});
