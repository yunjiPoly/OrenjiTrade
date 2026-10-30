import { TestBed } from '@angular/core/testing';
import { FeedService } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { FEED_PAGE_SIZE, FEED_PREVIEWS, HomeFeedStore } from './home-feed.store';

function page(ids: string[], nextCursor: string | null, at = '2026-10-29T12:00:00Z') {
  return {
    region: 'americas-north',
    game: 'yugioh',
    kind: 'ALL',
    windowDays: 30,
    items: ids.map((id) => ({ id, at, kind: 'WANTED', collector: {}, place: {} })),
    nextCursor,
    hasMore: !!nextCursor,
    gameHasPosts: ids.length > 0,
    regionHasPosts: ids.length > 0,
  };
}

describe("HomeFeedStore (spec 5.4: GET /feed with the web's 6 pictures)", () => {
  let getFeed: ReturnType<typeof vi.fn>;
  let store: HomeFeedStore;
  const query = { region: 'americas-north', game: 'yugioh', kind: 'WANTED' as const };

  beforeEach(() => {
    getFeed = vi.fn();
    TestBed.configureTestingModule({
      providers: [HomeFeedStore, { provide: FeedService, useValue: { getFeed } }],
    });
    store = TestBed.inject(HomeFeedStore);
  });

  it('reads the first page with the chip and 6 pictures, then the next one by its cursor', async () => {
    getFeed.mockReturnValueOnce(of(page(['a', 'b'], 'next')));
    await store.load(query);
    expect(getFeed).toHaveBeenLastCalledWith(
      { ...query, limit: FEED_PAGE_SIZE, previews: FEED_PREVIEWS },
      'body',
      false,
      expect.anything(),
    );
    expect(store.status()).toBe('ready');
    expect(store.hasMore()).toBe(true);
    expect(store.loadedAt()).not.toBeNull();
    getFeed.mockReturnValueOnce(of(page(['b', 'c'], null)));
    await store.loadMore();
    expect(getFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'next' }),
      'body',
      false,
      expect.anything(),
    );
    expect(store.posts().map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(store.atEnd()).toBe(true);
  });

  it('says "Couldn\'t load more" without losing the list, and the error of a first page', async () => {
    getFeed.mockReturnValueOnce(of(page(['a'], 'next')));
    await store.load(query);
    getFeed.mockReturnValueOnce(throwError(() => new Error('offline')));
    await store.loadMore();
    expect(store.more()).toBe('error');
    expect(store.posts()).toHaveLength(1);
    getFeed.mockReturnValueOnce(throwError(() => new Error('offline')));
    await store.load(query);
    expect(store.status()).toBe('error');
  });

  it('tells of newer posts without a number and never slides them in', async () => {
    getFeed.mockReturnValueOnce(of(page(['a'], null, '2026-10-29T12:00:00Z')));
    await store.load(query);
    getFeed.mockReturnValueOnce(of(page(['a'], null, '2026-10-29T12:00:00Z')));
    await store.checkNewer();
    expect(store.newer()).toBe(false);
    getFeed.mockReturnValueOnce(of(page(['z'], null, '2026-10-29T12:05:00Z')));
    await store.checkNewer();
    expect(getFeed).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1 }),
      'body',
      false,
      expect.anything(),
    );
    expect(store.newer()).toBe(true);
    expect(store.posts().map((p) => p.id)).toEqual(['a']);
  });

  it('drops the answer of an older query (another region, game or chip)', async () => {
    const slow = new Subject<ReturnType<typeof page>>();
    getFeed.mockReturnValueOnce(slow);
    const first = store.load(query);
    getFeed.mockReturnValueOnce(of(page(['new'], null)));
    await store.load({ ...query, kind: 'ALL' });
    slow.next(page(['old'], null));
    slow.complete();
    await first;
    expect(store.posts().map((p) => p.id)).toEqual(['new']);
  });

  it('knows the empty states from the first page', async () => {
    getFeed.mockReturnValueOnce(of({ ...page([], null), regionHasPosts: false }));
    await store.load(query);
    expect(store.empty()).toBe('region');
  });
});
