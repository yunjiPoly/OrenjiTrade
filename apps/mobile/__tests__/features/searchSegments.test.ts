import { recentScopeKey, useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import {
  activeHolderFilterCount,
  cardHoldersQuery,
  DEFAULT_HOLDER_FILTERS,
  holdersCountLabel,
  parsePrice,
  priceFieldError,
  priceRangeError,
} from '@/src/features/holders/holderFilters';
import { isSearchSegment, searchTypesFor } from '@/src/features/search/searchSegments';
import {
  BULK_DELETE_MESSAGE,
  bulkDeleteTitle,
  bulkResultMessage,
  toBulkRequest,
} from '@/src/features/inventory/bulkActions';
import {
  itemPhotoErrorMessage,
  itemPhotoProblem,
  photoMimeType,
} from '@/src/features/inventory/itemPhotoRules';
import { moved } from '@/src/features/binders/ReorderBindersSheet';
import { ApiError } from '@/src/api/ApiError';

import { CARD_ID, PRINTING_A } from '../support/fixtures';

describe('search segments', () => {
  it('names the sections of GET /search per segment', () => {
    expect(isSearchSegment('cards')).toBe(true);
    expect(isSearchSegment('collectors')).toBe(true);
    expect(isSearchSegment('tags')).toBe(false);
    expect(searchTypesFor('collectors')).toEqual(['collectors']);
    expect(searchTypesFor('binders')).toEqual(['binders']);
  });

  it('keeps recent searches per segment and per account', () => {
    useRecentSearchesStore.setState({ byUser: {} });
    const store = useRecentSearchesStore.getState();
    store.remember('u1', 'fox');
    store.remember('u1', 'noé', 'collectors');
    store.remember('u1', 'trades', 'binders');
    store.remember('u2', 'otter', 'collectors');
    const byUser = useRecentSearchesStore.getState().byUser;
    expect(byUser[recentScopeKey('u1')]).toEqual(['fox']);
    expect(byUser[recentScopeKey('u1', 'collectors')]).toEqual(['noé']);
    expect(byUser[recentScopeKey('u1', 'binders')]).toEqual(['trades']);
    expect(byUser[recentScopeKey('u2', 'collectors')]).toEqual(['otter']);
    useRecentSearchesStore.getState().clear('u1', 'collectors');
    expect(
      useRecentSearchesStore.getState().byUser[recentScopeKey('u1', 'collectors')]
    ).toBeUndefined();
    expect(useRecentSearchesStore.getState().byUser.u1).toEqual(['fox']);
  });
});

describe('card holder filters (the web search-params rules)', () => {
  it('builds the request with the platform region and only the set filters (ADR 0017)', () => {
    expect(
      cardHoldersQuery({ kind: 'card', id: CARD_ID }, DEFAULT_HOLDER_FILTERS, 'americas-north')
    ).toEqual({
      region: 'americas-north',
      sort: 'freshness',
      cardId: CARD_ID,
    });
    expect(
      cardHoldersQuery(
        { kind: 'printing', id: PRINTING_A },
        {
          availability: 'ACCEPTS_OFFERS',
          condition: 'NEAR_MINT',
          minPrice: 10,
          maxPrice: 99.5,
          freshness: 'ACTIVE',
          edition: 'FIRST_EDITION',
          language: 'fr',
          acceptsOffers: true,
          sort: 'price',
        },
        'europe'
      )
    ).toEqual({
      region: 'europe',
      sort: 'price',
      printingId: PRINTING_A,
      availability: 'ACCEPTS_OFFERS',
      condition: 'NEAR_MINT',
      minPrice: 10,
      maxPrice: 99.5,
      freshness: 'ACTIVE',
      edition: 'FIRST_EDITION',
      language: 'fr',
      acceptsOffers: true,
    });
  });

  it('parses and validates prices and the range', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(' 12.345 ')).toBe(12.35);
    expect(parsePrice('-1')).toBeNull();
    expect(parsePrice('100001')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(priceFieldError('')).toBeNull();
    expect(priceFieldError('12')).toBeNull();
    expect(priceFieldError('x')).toBe('Enter 0 to 100000.');
    expect(priceRangeError(10, 5)).toBe('The minimum price must not be above the maximum.');
    expect(priceRangeError(5, 10)).toBeNull();
    expect(priceRangeError(null, 10)).toBeNull();
  });

  it('counts the narrowing filters (never the sort) and words the count', () => {
    expect(activeHolderFilterCount(DEFAULT_HOLDER_FILTERS)).toBe(0);
    expect(activeHolderFilterCount({ ...DEFAULT_HOLDER_FILTERS, sort: 'price' })).toBe(0);
    expect(
      activeHolderFilterCount({
        ...DEFAULT_HOLDER_FILTERS,
        minPrice: 0,
        acceptsOffers: true,
        language: 'en',
      })
    ).toBe(3);
    expect(holdersCountLabel(null)).toBe('Looking for holders…');
    expect(holdersCountLabel(1)).toBe('1 listing in your region');
    expect(holdersCountLabel(3)).toBe('3 listings in your region');
  });
});

describe('inventory bulk actions (the web bulk-actions rules)', () => {
  const ids = ['a', 'b'];

  it('builds the bulk request of each action', () => {
    expect(toBulkRequest({ kind: 'visibility', visibility: 'PUBLIC' }, ids)).toEqual({
      itemIds: ids,
      action: 'SET_VISIBILITY',
      visibility: 'PUBLIC',
    });
    const now = Date.parse('2026-10-06T12:00:00Z');
    expect(
      toBulkRequest(
        { kind: 'visibility', visibility: 'TEMPORARILY_PUBLIC', duration: '1h' },
        ids,
        now
      )
    ).toEqual({
      itemIds: ids,
      action: 'SET_VISIBILITY',
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2026-10-06T13:00:00.000Z',
    });
    expect(toBulkRequest({ kind: 'move', binderId: 'b-1', binderName: 'Trades' }, ids)).toEqual({
      itemIds: ids,
      action: 'MOVE_TO_BINDER',
      binderId: 'b-1',
    });
    expect(toBulkRequest({ kind: 'move', binderId: null, binderName: null }, ids)).toEqual({
      itemIds: ids,
      action: 'MOVE_TO_BINDER',
    });
    expect(toBulkRequest({ kind: 'availability', availability: 'SALE' }, ids)).toEqual({
      itemIds: ids,
      action: 'SET_AVAILABILITY',
      availability: 'SALE',
    });
    expect(toBulkRequest({ kind: 'confirm' }, ids)).toEqual({ itemIds: ids, action: 'CONFIRM' });
    expect(toBulkRequest({ kind: 'delete' }, ids)).toEqual({ itemIds: ids, action: 'DELETE' });
  });

  it('words the outcome with the reasons of skipped cards', () => {
    expect(
      bulkResultMessage({ kind: 'visibility', visibility: 'PUBLIC' }, { updated: 2, skipped: [] })
    ).toBe('2 cards are now public.');
    expect(
      bulkResultMessage(
        { kind: 'visibility', visibility: 'TEMPORARILY_PUBLIC', duration: '24h' },
        { updated: 1, skipped: [{ itemId: 'x', reason: 'UNCHANGED' }] }
      )
    ).toBe('1 card is now public for 24 hours. 1 card skipped: already in that state.');
    expect(
      bulkResultMessage(
        { kind: 'delete' },
        {
          updated: 0,
          skipped: [
            { itemId: 'x', reason: 'NOT_FOUND' },
            { itemId: 'y', reason: 'NOT_FOUND' },
          ],
        }
      )
    ).toBe('Nothing changed. 2 cards skipped: no longer in your inventory.');
    expect(
      bulkResultMessage(
        { kind: 'move', binderId: 'b', binderName: 'Trades' },
        { updated: 3, skipped: [] }
      )
    ).toBe('3 cards moved to “Trades”.');
    expect(
      bulkResultMessage({ kind: 'availability', availability: 'SALE' }, { updated: 1, skipped: [] })
    ).toBe('1 card set to sale.');
    expect(bulkDeleteTitle(1)).toBe('Delete 1 card?');
    expect(bulkDeleteTitle(4)).toBe('Delete 4 cards?');
    expect(BULK_DELETE_MESSAGE).toMatch(/every listing/);
  });
});

describe('item photos (the web item-photos rules)', () => {
  it('checks the type and size before uploading', () => {
    expect(itemPhotoProblem({ mimeType: 'image/jpeg', size: 1000 })).toBeNull();
    expect(itemPhotoProblem({ mimeType: 'image/gif', size: 1000 })).toBe(
      'Use a JPEG, PNG or WebP photo.'
    );
    expect(itemPhotoProblem({ mimeType: 'image/png', size: 0 })).toBe('That file is empty.');
    expect(itemPhotoProblem({ mimeType: 'image/webp', size: 9 * 1024 * 1024 })).toBe(
      'Choose a photo smaller than 8 MB.'
    );
    expect(photoMimeType(null, 'IMG.PNG')).toBe('image/png');
    expect(photoMimeType('image/WEBP', null)).toBe('image/webp');
    expect(photoMimeType(null, 'photo')).toBe('image/jpeg');
  });

  it('words the API refusals', () => {
    const error = (status: number) => new ApiError({ status, errorCode: 'X', message: 'raw' });
    expect(itemPhotoErrorMessage(error(409))).toBe('A card can have at most 4 photos.');
    expect(itemPhotoErrorMessage(error(413))).toBe('Choose a photo smaller than 8 MB.');
    expect(itemPhotoErrorMessage(error(415))).toBe('Use a JPEG, PNG or WebP photo.');
    expect(itemPhotoErrorMessage(error(400))).toBe(
      'That photo could not be read. Try another one.'
    );
  });
});

describe('binder reordering', () => {
  it('moves one binder within the list', () => {
    expect(moved(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });
});
