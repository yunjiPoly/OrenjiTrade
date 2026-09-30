import {
  DEFAULT_INVENTORY_PAGE_SIZE,
  UNFILED,
  activeFilterCount,
  parseInventoryParams,
  toListRequest,
} from './inventory-params';

const BINDER = '00000000-0000-4000-8b00-000000000101';

describe('inventory params', () => {
  it('defaults to every card, recently updated, as a grid', () => {
    expect(parseInventoryParams({})).toEqual({
      binder: null,
      q: '',
      game: null,
      visibility: null,
      availability: null,
      condition: null,
      freshness: null,
      sort: 'updated',
      view: 'grid',
      page: 0,
      size: DEFAULT_INVENTORY_PAGE_SIZE,
    });
  });

  it('keeps valid values and drops unknown ones', () => {
    const params = parseInventoryParams({
      binder: BINDER.toUpperCase(),
      q: '  azure  ',
      game: 'YuGiOh',
      visibility: 'TEMPORARILY_PUBLIC',
      availability: 'TRADE',
      condition: 'near_mint',
      freshness: 'stale',
      sort: 'price-asc',
      view: 'table',
      page: '2',
      size: '48',
    });
    expect(params).toEqual({
      binder: BINDER,
      q: 'azure',
      game: 'yugioh',
      visibility: 'TEMPORARILY_PUBLIC',
      availability: 'TRADE',
      condition: 'NEAR_MINT',
      freshness: 'STALE',
      sort: 'price-asc',
      view: 'table',
      page: 2,
      size: 48,
    });

    const junk = parseInventoryParams({
      binder: '../admin',
      visibility: 'SECRET',
      availability: 'GIFT',
      condition: 'mint<script>',
      freshness: 'ROTTEN',
      sort: 'random',
      view: 'cards',
      page: '-1',
      size: '1000',
    });
    expect(junk.binder).toBeNull();
    expect(junk.visibility).toBeNull();
    expect(junk.availability).toBeNull();
    expect(junk.condition).toBeNull();
    expect(junk.freshness).toBeNull();
    expect(junk.sort).toBe('updated');
    expect(junk.view).toBe('grid');
    expect(junk.page).toBe(0);
    expect(junk.size).toBe(DEFAULT_INVENTORY_PAGE_SIZE);
  });

  it('builds the list request for a binder, unfiled cards and price sorting', () => {
    const inBinder = toListRequest(parseInventoryParams({ binder: BINDER, q: 'fox' }));
    expect(inBinder).toMatchObject({ binderId: BINDER, query: 'fox', sort: 'updated', page: 0 });
    expect(inBinder.unfiled).toBeUndefined();
    expect(inBinder.direction).toBeUndefined();

    const unfiled = toListRequest(parseInventoryParams({ binder: UNFILED, sort: 'price-asc' }));
    expect(unfiled).toMatchObject({ unfiled: true, sort: 'price', direction: 'asc' });
    expect(unfiled.binderId).toBeUndefined();
    expect(unfiled.query).toBeUndefined();
  });

  it('counts the active filters', () => {
    expect(activeFilterCount(parseInventoryParams({ q: 'x', binder: UNFILED }))).toBe(0);
    expect(
      activeFilterCount(
        parseInventoryParams({ game: 'mtg', visibility: 'PUBLIC', freshness: 'STALE' }),
      ),
    ).toBe(3);
  });
});
