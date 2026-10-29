import { parseSearchUrl, searchTabOf, showsStateList, switchPatch } from './search-url';

describe('Search URL (spec 4.11, web stage WD)', () => {
  it('reads the tab, defaulting to Cards', () => {
    expect(searchTabOf(undefined)).toBe('cards');
    expect(searchTabOf('Binders')).toBe('binders');
    expect(searchTabOf('wishlist')).toBe('wishlist');
    expect(searchTabOf('offers')).toBe('cards');
  });

  it('keeps a state code, the whole region, binders or deck cores, and ids that are ids', () => {
    const url = parseSearchUrl({
      tab: 'binders',
      q: '  yubel ',
      state: 'ca-qc',
      kind: 'deckcores',
      open: '00000000-0000-4000-8B00-000000000101',
      wish: 'not-an-id',
    });
    expect(url).toEqual({
      tab: 'binders',
      q: 'yubel',
      state: 'CA-QC',
      kind: 'deckcores',
      open: '00000000-0000-4000-8b00-000000000101',
      wish: null,
    });
    expect(parseSearchUrl({ state: 'ALL' }).state).toBe('all');
    expect(parseSearchUrl({ state: 'Quebec' }).state).toBeNull();
    expect(parseSearchUrl({ kind: 'x' }).kind).toBe('binders');
    expect(parseSearchUrl({ q: 'a'.repeat(140) }).q).toHaveLength(100);
  });

  it('shows the state list only without a state and a text', () => {
    expect(showsStateList({ state: null, q: '' })).toBe(true);
    expect(showsStateList({ state: 'all', q: '' })).toBe(false);
    expect(showsStateList({ state: null, q: 'yubel' })).toBe(false);
  });

  describe('switchPatch (the pills mirrored into the URL)', () => {
    const americas = new Set(['CA-ON', 'CA-QC', 'US-SD']);
    const europe = new Set(['FR-IDF', 'DE-BY']);

    it('only adds the region and game on a first visit, keeping a state and an open binder', () => {
      expect(
        switchPatch({
          requestedRegion: undefined,
          requestedGame: undefined,
          region: 'americas-north',
          game: 'yugioh',
          state: 'CA-ON',
          regionHas: (code) => americas.has(code),
        }),
      ).toEqual({ region: 'americas-north', game: 'yugioh' });
    });

    it("drops the old region's state and open binder when the region pill picks Europe", () => {
      expect(
        switchPatch({
          requestedRegion: 'americas-north',
          requestedGame: 'yugioh',
          region: 'europe',
          game: 'yugioh',
          state: 'CA-ON',
          regionHas: (code) => europe.has(code),
        }),
      ).toEqual({ region: 'europe', state: null, open: null });
    });

    it('keeps the whole region, and a state the new region has, but never the open binder', () => {
      for (const state of ['all', 'FR-IDF']) {
        expect(
          switchPatch({
            requestedRegion: 'americas-north',
            requestedGame: 'yugioh',
            region: 'europe',
            game: 'yugioh',
            state,
            regionHas: (code) => europe.has(code),
          }),
        ).toEqual({ region: 'europe', open: null });
      }
    });

    it('"Back to Americas (North)" drops the European state the same way', () => {
      expect(
        switchPatch({
          requestedRegion: 'europe',
          requestedGame: 'yugioh',
          region: 'americas-north',
          game: 'yugioh',
          state: 'FR-IDF',
          regionHas: (code) => americas.has(code),
        }),
      ).toEqual({ region: 'americas-north', state: null, open: null });
    });

    it('drops the open binder and the chosen wish of the old game when the game pill switches', () => {
      expect(
        switchPatch({
          requestedRegion: 'americas-north',
          requestedGame: 'yugioh',
          region: 'americas-north',
          game: 'pokemon',
          state: 'CA-ON',
          regionHas: (code) => americas.has(code),
        }),
      ).toEqual({ game: 'pokemon', open: null, wish: null });
    });

    it('changes nothing when the URL already says the browsed region and game', () => {
      expect(
        switchPatch({
          requestedRegion: 'europe',
          requestedGame: 'mtg',
          region: 'europe',
          game: 'mtg',
          state: 'FR-IDF',
          regionHas: (code) => europe.has(code),
        }),
      ).toEqual({});
    });
  });
});
