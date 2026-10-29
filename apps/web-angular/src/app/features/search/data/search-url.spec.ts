import { parseSearchUrl, searchTabOf, showsStateList } from './search-url';

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
});
