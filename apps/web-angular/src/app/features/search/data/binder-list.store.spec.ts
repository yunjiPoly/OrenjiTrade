import { TestBed } from '@angular/core/testing';
import { MapService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { BinderListStore, sameBinderQuery } from './binder-list.store';

const query = { region: 'americas-north', game: 'yugioh', state: 'CA-QC', deckCores: false, q: '' };

describe('BinderListStore (Search › Binders, spec 6.3)', () => {
  let subdivision: ReturnType<typeof vi.fn>;
  let region: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subdivision = vi.fn(() => of({ items: [{ id: 'b1' }], hasMore: true, nextCursor: 'c1' }));
    region = vi.fn(() => of({ items: [{ id: 'b2' }], hasMore: false, nextCursor: null }));
    TestBed.configureTestingModule({
      providers: [
        BinderListStore,
        {
          provide: MapService,
          useValue: { listSubdivisionBinders: subdivision, listRegionBinders: region },
        },
      ],
    });
  });

  it('lists a state with the region, the game, binders or deck cores and the text', () => {
    const store = TestBed.inject(BinderListStore);
    store.load({ ...query, q: 'yubel', deckCores: true });
    expect(subdivision).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'americas-north',
        code: 'CA-QC',
        game: 'yugioh',
        deckCore: true,
        q: 'yubel',
        limit: 20,
      }),
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((b) => b.id)).toEqual(['b1']);
    expect(store.hasMore()).toBe(true);
  });

  it('lists the whole region without a state, and pages with the cursor', () => {
    const store = TestBed.inject(BinderListStore);
    store.load({ ...query, state: null });
    expect(region).toHaveBeenCalledTimes(1);
    store.load({ ...query, state: null });
    expect(region).toHaveBeenCalledTimes(1);
    store.load(query);
    store.loadMore();
    expect(subdivision).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'c1' }),
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((b) => b.id)).toEqual(['b1', 'b1']);
  });

  it('asks the browsed region and game, not the default, for a state and for the whole region', () => {
    const store = TestBed.inject(BinderListStore);
    store.load({ ...query, region: 'europe', game: 'pokemon', state: 'FR-IDF' });
    expect(subdivision).toHaveBeenLastCalledWith(
      expect.objectContaining({ region: 'europe', code: 'FR-IDF', game: 'pokemon' }),
      'body',
      false,
      expect.anything(),
    );
    store.load({ ...query, region: 'europe', game: 'pokemon', state: null });
    expect(region).toHaveBeenLastCalledWith(
      expect.objectContaining({ region: 'europe', game: 'pokemon' }),
      'body',
      false,
      expect.anything(),
    );
  });

  it('keeps an error to retry', () => {
    subdivision.mockReturnValueOnce(throwError(() => new Error('offline')));
    const store = TestBed.inject(BinderListStore);
    store.load(query);
    expect(store.status()).toBe('error');
    store.retry();
    expect(store.status()).toBe('ready');
  });

  it('compares queries field by field', () => {
    expect(sameBinderQuery(query, { ...query })).toBe(true);
    expect(sameBinderQuery(query, { ...query, game: 'mtg' })).toBe(false);
    expect(sameBinderQuery(null, query)).toBe(false);
  });
});
