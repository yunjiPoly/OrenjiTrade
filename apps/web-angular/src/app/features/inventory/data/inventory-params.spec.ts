import {
  CLEARED_FILTERS,
  DEFAULT_DIRECTION,
  INVENTORY_PAGE_SIZE,
  UNFILED,
  hasActiveFilters,
  listKey,
  parseInventoryParams,
  toListRequest,
} from './inventory-params';

describe('inventory params (web redesign spec 9.3, 4.11)', () => {
  it('defaults to Cards, every card, Recently added newest first, the remembered view', () => {
    const params = parseInventoryParams({});
    expect(params).toEqual({
      tab: 'cards',
      binder: null,
      q: '',
      game: null,
      visibility: null,
      freshness: null,
      sort: 'created',
      dir: 'desc',
      view: null,
      item: null,
    });
    expect(hasActiveFilters(params)).toBe(false);
  });

  it('reads the tab, a binder, unfiled, the card in the drawer and the view', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const params = parseInventoryParams({ tab: 'binders', binder: id.toUpperCase(), item: id, view: 'grid' });
    expect(params.tab).toBe('binders');
    expect(params.binder).toBe(id);
    expect(params.item).toBe(id);
    expect(params.view).toBe('grid');
    expect(parseInventoryParams({ binder: UNFILED }).binder).toBe(UNFILED);
  });

  it('drops junk and keeps old links working (sort=updated, price-asc, TEMPORARILY_PUBLIC)', () => {
    const junk = parseInventoryParams({ binder: 'x', game: 'NOT A SLUG!', item: '1', sort: 'random', dir: 'up', tab: 'x' });
    expect(junk.binder).toBeNull();
    expect(junk.game).toBeNull();
    expect(junk.item).toBeNull();
    expect(junk.sort).toBe('created');
    expect(junk.dir).toBe('desc');
    expect(junk.tab).toBe('cards');
    expect(parseInventoryParams({ sort: 'updated' }).sort).toBe('created');
    const cheapest = parseInventoryParams({ sort: 'price-asc' });
    expect([cheapest.sort, cheapest.dir]).toEqual(['price', 'asc']);
    expect(parseInventoryParams({ visibility: 'TEMPORARILY_PUBLIC' }).visibility).toBe('PUBLIC');
  });

  it('starts each sort in its own direction', () => {
    expect(DEFAULT_DIRECTION).toEqual({ created: 'desc', name: 'asc', price: 'desc' });
    expect(parseInventoryParams({ sort: 'name' }).dir).toBe('asc');
    expect(parseInventoryParams({ sort: 'price', dir: 'asc' }).dir).toBe('asc');
  });

  it('asks the API for 100 rows a load, Public as every card set to public', () => {
    const request = toListRequest(
      parseInventoryParams({ q: ' blue ', game: 'yugioh', visibility: 'PUBLIC', sort: 'name' }),
      2,
    );
    expect(request).toEqual(
      expect.objectContaining({
        query: 'blue',
        game: 'yugioh',
        markedPublic: true,
        sort: 'name',
        direction: 'asc',
        page: 2,
        size: INVENTORY_PAGE_SIZE,
      }),
    );
    expect(request.visibility).toBeUndefined();
    expect(toListRequest(parseInventoryParams({ visibility: 'PRIVATE' })).visibility).toBe('PRIVATE');
    expect(toListRequest(parseInventoryParams({ binder: UNFILED })).unfiled).toBe(true);
  });

  it('knows a new list (filters, binder, sort) from a new view or drawer', () => {
    const base = parseInventoryParams({});
    expect(listKey({ ...base, view: 'grid', item: 'x' })).toBe(listKey(base));
    expect(listKey({ ...base, q: 'a' })).not.toBe(listKey(base));
    expect(listKey({ ...base, binder: UNFILED })).not.toBe(listKey(base));
  });

  it('shows "Clear filters" for a search, a game, a visibility, a freshness or another sort', () => {
    const base = parseInventoryParams({});
    for (const change of [{ q: 'x' }, { game: 'yugioh' }, { visibility: 'PRIVATE' as const }, { sort: 'name' as const, dir: 'asc' as const }]) {
      expect(hasActiveFilters({ ...base, ...change }), JSON.stringify(change)).toBe(true);
    }
    expect(Object.keys(CLEARED_FILTERS)).toEqual(['q', 'game', 'visibility', 'freshness', 'sort', 'dir']);
  });
});
