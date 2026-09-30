import {
  DEFAULT_HOLDER_FILTERS,
  activeHolderFilterCount,
  cardHoldersRequest,
  holderFiltersToQuery,
  parsePrice,
  parseSearchParams,
  priceRangeError,
  sameHolderFilters,
} from './search-params';

const CARD = '69c8ee73-9bf6-42e2-9178-a00582a544e5';
const PRINTING = 'caeba705-6348-48c4-90e1-81d87e0a3656';

describe('search params', () => {
  it('defaults to the cards tab and no filters', () => {
    expect(parseSearchParams({})).toEqual({
      q: '',
      tab: 'cards',
      card: null,
      printing: null,
      filters: DEFAULT_HOLDER_FILTERS,
    });
  });

  it('parses every holder filter and bounds it', () => {
    const params = parseSearchParams({
      q: '  azure ',
      tab: 'BINDERS',
      card: CARD,
      availability: 'sale',
      condition: 'near_mint',
      minPrice: '60',
      maxPrice: '10.5',
      freshness: 'aging',
      edition: 'first_edition',
      language: 'FR',
      offers: 'true',
      sort: 'price',
      page: '3',
    });
    expect(params.q).toBe('azure');
    expect(params.tab).toBe('binders');
    expect(params.card).toBe(CARD);
    expect(params.filters).toEqual({
      availability: 'SALE',
      condition: 'NEAR_MINT',
      // Swapped when reversed.
      minPrice: 10.5,
      maxPrice: 60,
      freshness: 'AGING',
      edition: 'FIRST_EDITION',
      language: 'fr',
      acceptsOffers: true,
      sort: 'price',
      page: 3,
    });
  });

  it('ignores invalid values', () => {
    const params = parseSearchParams({
      tab: 'stores',
      printing: 'nope',
      minPrice: '-4',
      maxPrice: '9999999',
      sort: 'rating',
      page: '-2',
      language: 'french',
    });
    expect(params.tab).toBe('cards');
    expect(params.printing).toBeNull();
    expect(params.filters).toEqual(DEFAULT_HOLDER_FILTERS);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(12.3456)).toBe(12.35);
  });

  it('writes only the filters that are set to the URL', () => {
    expect(
      Object.values(holderFiltersToQuery(DEFAULT_HOLDER_FILTERS)).every((v) => v === null),
    ).toBe(true);
    const filters = {
      ...DEFAULT_HOLDER_FILTERS,
      maxPrice: 50,
      acceptsOffers: true,
      sort: 'freshness' as const,
    };
    expect(holderFiltersToQuery(filters)).toMatchObject({
      maxPrice: '50',
      offers: 'true',
      sort: 'freshness',
    });
    expect(activeHolderFilterCount(filters)).toBe(2);
    expect(sameHolderFilters(filters, { ...filters })).toBe(true);
    expect(sameHolderFilters(filters, DEFAULT_HOLDER_FILTERS)).toBe(false);
  });

  it('validates the price range', () => {
    expect(priceRangeError(10, 5)).toContain('minimum');
    expect(priceRangeError(5, 10)).toBeNull();
    expect(priceRangeError(null, 10)).toBeNull();
  });

  it('builds the card-holders request (own area or a public centre)', () => {
    const filters = {
      ...DEFAULT_HOLDER_FILTERS,
      availability: 'TRADE' as const,
      minPrice: 5,
      language: 'en',
      page: 1,
    };
    expect(cardHoldersRequest({ kind: 'printing', id: PRINTING }, filters, null)).toEqual({
      printingId: PRINTING,
      availability: 'TRADE',
      minPrice: 5,
      language: 'en',
      sort: 'distance',
      page: 1,
      size: 20,
    });
    expect(
      cardHoldersRequest({ kind: 'card', id: CARD }, DEFAULT_HOLDER_FILTERS, {
        lat: 45.50219,
        lng: -73.56711,
      }),
    ).toEqual({ cardId: CARD, lat: 45.502, lng: -73.567, sort: 'distance', page: 0, size: 20 });
  });
});
