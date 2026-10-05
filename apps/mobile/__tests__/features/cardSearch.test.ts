import { EMPTY_CARD_SEARCH } from '@/src/api/hooks/catalog';
import {
  activeFilterCount,
  extraFilterCount,
  filterOptions,
  hasCriteria,
  withFilter,
  withoutFilters,
} from '@/src/features/catalog/cardSearch';
import {
  rememberSearch,
  RECENT_SEARCHES_MAX,
  useRecentSearchesStore,
} from '@/src/features/catalog/recentSearchesStore';

import { GAMES } from '../support/fixtures';

describe('card search filters', () => {
  it('offers the selected game schema values, or every game’s', () => {
    expect(filterOptions(GAMES, 'pokemon', 'languages')).toEqual(['en', 'fr']);
    expect(filterOptions(GAMES, null, 'languages')).toEqual(['en', 'fr', 'ja']);
    expect(filterOptions(GAMES, null, 'rarities')).toEqual(['Common', 'Ultra Rare', 'Secret Rare']);
    expect(filterOptions([{ slug: 'x' }], null, 'editions')).toEqual([]);
  });

  it('clears the set and values the new game does not know', () => {
    const query = {
      ...EMPTY_CARD_SEARCH,
      q: 'fox',
      game: 'pokemon',
      set: 'SVX',
      rarity: 'Ultra Rare',
      language: 'fr',
      edition: 'UNLIMITED',
    };
    expect(withFilter(query, 'game', 'yugioh', GAMES)).toEqual({
      q: 'fox',
      game: 'yugioh',
      set: null,
      rarity: null,
      language: 'fr',
      edition: 'UNLIMITED',
    });
    expect(withFilter(query, 'rarity', null, GAMES).rarity).toBeNull();
    expect(withFilter(query, 'game', null, GAMES)).toMatchObject({
      game: null,
      set: null,
      rarity: 'Ultra Rare',
    });
  });

  it('counts criteria', () => {
    expect(hasCriteria(EMPTY_CARD_SEARCH)).toBe(false);
    expect(hasCriteria({ ...EMPTY_CARD_SEARCH, q: 'x' })).toBe(true);
    const filtered = { ...EMPTY_CARD_SEARCH, game: 'pokemon', set: 'SVX', edition: 'UNLIMITED' };
    expect(activeFilterCount(filtered)).toBe(3);
    expect(extraFilterCount(filtered)).toBe(2);
    expect(withoutFilters({ ...filtered, q: 'fox' })).toEqual({ ...EMPTY_CARD_SEARCH, q: 'fox' });
  });
});

describe('recent searches', () => {
  beforeEach(() => useRecentSearchesStore.setState({ byUser: {} }));

  it('keeps the newest first, without duplicates or one-letter searches', () => {
    let list = rememberSearch([], 'fox');
    list = rememberSearch(list, 'dragon');
    list = rememberSearch(list, 'FOX');
    list = rememberSearch(list, 'x');
    expect(list).toEqual(['FOX', 'dragon']);
    let many: string[] = [];
    for (let i = 0; i < 12; i++) {
      many = rememberSearch(many, `card ${i}`);
    }
    expect(many).toHaveLength(RECENT_SEARCHES_MAX);
    expect(many[0]).toBe('card 11');
  });

  it('stores them per account', () => {
    const store = useRecentSearchesStore.getState();
    store.remember('uid-a', 'fox');
    store.remember('uid-b', 'dragon');
    store.remember('uid-a', 'otter');
    expect(useRecentSearchesStore.getState().byUser).toEqual({
      'uid-a': ['otter', 'fox'],
      'uid-b': ['dragon'],
    });
    useRecentSearchesStore.getState().forget('uid-a', 'fox');
    useRecentSearchesStore.getState().clear('uid-b');
    expect(useRecentSearchesStore.getState().byUser).toEqual({ 'uid-a': ['otter'] });
  });
});
