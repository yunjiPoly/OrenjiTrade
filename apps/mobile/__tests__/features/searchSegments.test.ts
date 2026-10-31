import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import { bulkResultMessage, toBulkRequest } from '@/src/features/inventory/bulkActions';
import {
  itemPhotoErrorMessage,
  itemPhotoProblem,
  photoMimeType,
} from '@/src/features/inventory/itemPhotoRules';
import { moved } from '@/src/features/binders/ReorderBindersSheet';
import {
  isSearchSegment,
  segmentLabel,
  segmentOfLink,
  SEARCH_SEGMENTS,
} from '@/src/features/search/searchSegments';
import { ApiError } from '@/src/api/ApiError';
import { previousOfSameRegion } from '@/src/api/hooks/search';
import { meKeys } from '@/src/api/queryKeys';

import { CARD_ID } from '../support/fixtures';

describe('search segments (stage R5)', () => {
  it('are Cards, Binders and Wishlist, with no Collectors segment', () => {
    expect(SEARCH_SEGMENTS).toEqual(['cards', 'binders', 'wishlist']);
    expect(SEARCH_SEGMENTS.map(segmentLabel)).toEqual(['Cards', 'Binders', 'Wishlist']);
    expect(isSearchSegment('cards')).toBe(true);
    expect(isSearchSegment('collectors')).toBe(false);
    expect(isSearchSegment('tags')).toBe(false);
  });

  it('reads the segment of a link, and the ?tab= of the links before stage R5', () => {
    expect(segmentOfLink({ segment: 'wishlist' })).toBe('wishlist');
    expect(segmentOfLink({ segment: 'binders', tab: 'collectors' })).toBe('binders');
    expect(segmentOfLink({ tab: 'binders' })).toBe('binders');
    expect(segmentOfLink({ tab: 'collectors' })).toBe('cards');
    expect(segmentOfLink({ segment: 'offers' })).toBeNull();
    expect(segmentOfLink({})).toBeNull();
  });

  it('keeps one list of recent searches per account', () => {
    useRecentSearchesStore.setState({ byUser: {}, forgetting: {} });
    const store = useRecentSearchesStore.getState();
    store.remember('u1', 'fox');
    store.remember('u2', 'otter');
    expect(useRecentSearchesStore.getState().byUser).toEqual({ u1: ['fox'], u2: ['otter'] });
    useRecentSearchesStore.getState().clear('u1');
    expect(useRecentSearchesStore.getState().byUser.u1).toBeUndefined();
    expect(useRecentSearchesStore.getState().byUser.u2).toEqual(['otter']);
  });
});

describe('what a list keeps on screen while its next answer loads', () => {
  it('keeps the previous results within one region, and nothing across a change of region', () => {
    const previous = { collectors: ['one'] };
    const key = (region: string, q: string) => ({
      queryKey: meKeys.search('uid-1', { collectors: true, q, region, limit: 3 }),
    });
    // Another text in the same region: the rows stay until the new ones arrive.
    expect(previousOfSameRegion('europe')(previous, key('europe', 'noé'))).toBe(previous);
    // Another region: nothing of the region before may stand under the new region's name.
    expect(previousOfSameRegion('americas-north')(previous, key('europe', 'noé'))).toBeUndefined();
    // The card holders and Search › Binders name their region in the same place.
    const holders = {
      queryKey: meKeys.cardHolders('uid-1', {
        cardId: CARD_ID,
        region: 'europe',
        sort: 'province',
        excludeDeckCoreItems: true,
      }),
    };
    expect(previousOfSameRegion('europe')(previous, holders)).toBe(previous);
    expect(previousOfSameRegion('americas-south')(previous, holders)).toBeUndefined();
    const binders = {
      queryKey: meKeys.regionBinderSearch('uid-1', {
        region: 'europe',
        state: null,
        deckCore: false,
        q: '',
      } as { region: string }),
    };
    expect(previousOfSameRegion('europe')(previous, binders)).toBe(previous);
    expect(previousOfSameRegion('americas-north')(previous, binders)).toBeUndefined();
    // Nothing before, or a key that names no region: nothing is kept.
    expect(previousOfSameRegion('europe')(undefined, undefined)).toBeUndefined();
    expect(
      previousOfSameRegion('europe')(previous, { queryKey: meKeys.cardHolders('uid-1', {}) })
    ).toBeUndefined();
  });
});

describe('inventory bulk actions (Select mode, stage R2)', () => {
  const ids = ['a', 'b'];

  it('builds the bulk request of each action', () => {
    expect(toBulkRequest({ kind: 'visibility', visibility: 'PUBLIC' }, ids)).toEqual({
      itemIds: ids,
      action: 'SET_VISIBILITY',
      visibility: 'PUBLIC',
    });
    expect(toBulkRequest({ kind: 'visibility', visibility: 'PRIVATE' }, ids)).toEqual({
      itemIds: ids,
      action: 'SET_VISIBILITY',
      visibility: 'PRIVATE',
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
    expect(toBulkRequest({ kind: 'confirm' }, ids)).toEqual({ itemIds: ids, action: 'CONFIRM' });
    expect(toBulkRequest({ kind: 'delete' }, ids)).toEqual({ itemIds: ids, action: 'DELETE' });
  });

  it('words the outcome with the reasons of skipped cards', () => {
    expect(
      bulkResultMessage({ kind: 'visibility', visibility: 'PUBLIC' }, { updated: 2, skipped: [] })
    ).toBe('2 cards are now public.');
    expect(
      bulkResultMessage(
        { kind: 'visibility', visibility: 'PRIVATE' },
        { updated: 1, skipped: [{ itemId: 'x', reason: 'UNCHANGED' }] }
      )
    ).toBe('1 card is now private. 1 card skipped: already in that state.');
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
    expect(bulkResultMessage({ kind: 'confirm' }, { updated: 1, skipped: [] })).toBe(
      '1 card confirmed as still available.'
    );
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
