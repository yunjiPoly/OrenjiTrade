import { GameResponse } from '@orenji/api-client';
import {
  activeFilterCount,
  filterOptions,
  parseCardSearchParams,
  toSearchRequest,
  withFilter,
} from './card-search-params';

const GAMES = [
  {
    slug: 'yugioh',
    schema: {
      rarities: ['Common', 'Secret Rare'],
      languages: ['en', 'fr', 'ja'],
      editions: ['FIRST_EDITION', 'UNLIMITED'],
      finishes: ['NORMAL'],
      conditions: [],
      metadataFields: [],
      summaryFields: [],
    },
  },
  {
    slug: 'mtg',
    schema: {
      rarities: ['Common', 'Mythic Rare'],
      languages: ['en', 'de'],
      editions: ['UNLIMITED'],
      finishes: ['NORMAL', 'FOIL'],
      conditions: [],
      metadataFields: [],
      summaryFields: [],
    },
  },
] as GameResponse[];

describe('card search params', () => {
  it('parses and bounds the URL state', () => {
    expect(
      parseCardSearchParams({
        q: '  dragon ',
        game: 'yugioh',
        language: 'FR',
        page: '2',
        size: '48',
      }),
    ).toEqual({
      q: 'dragon',
      game: 'yugioh',
      set: null,
      rarity: null,
      language: 'fr',
      edition: null,
      page: 2,
      size: 48,
    });
    const odd = parseCardSearchParams({
      q: 'x'.repeat(150),
      size: '7',
      page: '-3',
      language: 'eng',
    });
    expect(odd.q.length).toBe(100);
    expect(odd.size).toBe(24);
    expect(odd.page).toBe(0);
    expect(odd.language).toBeNull();
  });

  it('maps to the generated client request', () => {
    const params = parseCardSearchParams({ q: 'AZR-EN001', set: 'AZR', rarity: 'Secret Rare' });
    expect(toSearchRequest(params)).toEqual({
      query: 'AZR-EN001',
      game: undefined,
      set: 'AZR',
      rarity: 'Secret Rare',
      language: undefined,
      edition: undefined,
      page: 0,
      size: 24,
    });
    expect(activeFilterCount(params)).toBe(2);
  });

  it('offers the chosen game values, or the union of every game', () => {
    expect(filterOptions(GAMES, 'mtg', 'rarities')).toEqual(['Common', 'Mythic Rare']);
    expect(filterOptions(GAMES, null, 'languages')).toEqual(['en', 'fr', 'ja', 'de']);
  });

  it('clears the set and values the new game does not know when the game changes', () => {
    const params = parseCardSearchParams({
      game: 'yugioh',
      set: 'AZR',
      rarity: 'Secret Rare',
      language: 'en',
      edition: 'FIRST_EDITION',
      page: '3',
    });
    expect(withFilter(params, 'game', 'mtg', GAMES)).toEqual({
      game: 'mtg',
      page: null,
      set: null,
      rarity: null,
      edition: null,
    });
    expect(withFilter(params, 'rarity', 'Common', GAMES)).toEqual({ rarity: 'Common', page: null });
  });
});
