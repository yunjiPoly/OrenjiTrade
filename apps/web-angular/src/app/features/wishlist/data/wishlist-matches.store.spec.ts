import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  CursorPageWishlistMatchResponse,
  NotificationResponse,
  NotificationResponseTypeEnum as Type,
  WishlistMatchResponse,
  WishlistService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { MATCHES_PAGE, WishlistMatchesStore } from './wishlist-matches.store';

function match(id: string): WishlistMatchResponse {
  return {
    id,
    wishlistItemId: 'w1',
    item: { id: `item-${id}` } as WishlistMatchResponse['item'],
    collector: {
      id: `user-${id}`,
      displayName: `Collector ${id}`,
    } as WishlistMatchResponse['collector'],
    distanceBucket: 'KM_1_5' as WishlistMatchResponse['distanceBucket'],
    matchedAt: '2026-09-30T10:00:00Z',
    dismissed: false,
  };
}

function push(wishlistItemId: string): NotificationResponse {
  return {
    id: `n-${wishlistItemId}-${Math.random()}`,
    type: Type.WishlistMatch,
    title: 'Wishlist match',
    body: 'Listed nearby',
    data: { wishlistItemId },
    createdAt: '2026-09-30T10:00:00Z',
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

describe('WishlistMatchesStore', () => {
  let store: WishlistMatchesStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let pages: CursorPageWishlistMatchResponse[];
  let pushed$: Subject<NotificationResponse>;

  beforeEach(() => {
    pages = [{ items: [match('a'), match('b')], nextCursor: 'cursor-2', hasMore: true }];
    api = {
      listWishlistMatches: vi.fn(() => of(pages.shift() ?? { items: [], hasMore: false })),
      dismissWishlistMatch: vi.fn(() => of({})),
    };
    pushed$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        WishlistMatchesStore,
        { provide: WishlistService, useValue: api },
        { provide: NotificationCenter, useValue: { pushed$ } },
      ],
    });
    store = TestBed.inject(WishlistMatchesStore);
  });

  it('loads the first page of a wish and pages with the cursor', () => {
    store.init('w1');
    expect(api['listWishlistMatches']).toHaveBeenCalledWith(
      { id: 'w1', limit: MATCHES_PAGE },
      'body',
      false,
      expect.anything(),
    );
    expect(store.status()).toBe('ready');
    expect(store.hasMore()).toBe(true);

    pages.push({ items: [match('b'), match('c')], hasMore: false });
    store.loadMore();
    expect(api['listWishlistMatches']).toHaveBeenLastCalledWith(
      { id: 'w1', limit: MATCHES_PAGE, cursor: 'cursor-2' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.matches().map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(store.hasMore()).toBe(false);
  });

  it('shows errors and failed pages', () => {
    api['listWishlistMatches'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );
    store.init('w1');
    expect(store.status()).toBe('error');
    expect(store.error()).toBeInstanceOf(ApiError);
  });

  it('brings in new matches pushed for this wish only', async () => {
    store.init('w1');
    pages.push({ items: [match('new'), match('a')], hasMore: true, nextCursor: 'x' });
    pushed$.next(push('other-wish'));
    await flush();
    expect(api['listWishlistMatches']).toHaveBeenCalledTimes(1);
    pushed$.next(push('w1'));
    await flush();
    expect(store.matches().map((item) => item.id)).toEqual(['new', 'a', 'b']);
    expect(store.changed()).toBe(true);
  });

  it('dismisses optimistically and restores the match on failure', async () => {
    store.init('w1');
    await store.dismiss(store.matches()[0]);
    expect(api['dismissWishlistMatch']).toHaveBeenCalledWith(
      { id: 'a' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.matches().map((item) => item.id)).toEqual(['b']);
    expect(store.changed()).toBe(true);

    api['dismissWishlistMatch'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    await expect(store.dismiss(store.matches()[0])).rejects.toBeInstanceOf(ApiError);
    expect(store.matches().map((item) => item.id)).toEqual(['b']);
    expect(store.dismissing().size).toBe(0);
  });
});
