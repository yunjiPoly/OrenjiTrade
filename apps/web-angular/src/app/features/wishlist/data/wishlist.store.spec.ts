import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  LocationService,
  NotificationResponse,
  NotificationResponseTypeEnum as Type,
  PlansService,
  WishlistItemResponse,
  WishlistItemResponseTradePreferenceEnum as Trade,
  WishlistService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { WishlistStore, filterWishes, matchReadiness } from './wishlist.store';

function wish(id: string, overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id,
    game: 'pokemon',
    card: { id: `card-${id}`, name: `Card ${id}` },
    currency: 'CAD',
    tradePreference: Trade.Any,
    notes: '',
    active: true,
    matchCount: 0,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

describe('wishlist helpers', () => {
  it('filters wishes with matches or paused', () => {
    const items = [
      wish('a', { matchCount: 2 }),
      wish('b', { active: false }),
      wish('c', { matchCount: 1, active: false }),
    ];
    expect(filterWishes(items, 'all').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(filterWishes(items, 'matches').map((item) => item.id)).toEqual(['a', 'c']);
    expect(filterWishes(items, 'paused').map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('knows when matches can arrive: a location is enough (same region, ADR 0017)', () => {
    expect(matchReadiness(null)).toBe('unknown');
    expect(matchReadiness({ discoverable: true })).toBe('no-location');
    const location = {
      regionCode: 'americas-north',
      regionName: 'Americas (North)',
      countryCode: 'CA',
      countryName: 'Canada',
      subdivisionCode: 'CA-QC',
      subdivisionName: 'Quebec',
      label: 'Quebec, Canada',
      showCity: true,
    };
    expect(matchReadiness({ discoverable: false, location })).toBe('ready');
    expect(matchReadiness({ discoverable: true, location })).toBe('ready');
  });
});

describe('WishlistStore', () => {
  let store: WishlistStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let current: WishlistItemResponse[];
  let pushed$: Subject<NotificationResponse>;
  let resync$: Subject<void>;

  beforeEach(() => {
    current = [wish('a', { matchCount: 1 }), wish('b', { active: false })];
    api = {
      listWishlist: vi.fn(() => of(current)),
      updateWishlistItem: vi.fn(({ id, updateWishlistItemRequest }) =>
        of(wish(id, { ...updateWishlistItemRequest, updatedAt: '2026-09-30T11:00:00Z' })),
      ),
      deleteWishlistItem: vi.fn(() => of({})),
    };
    pushed$ = new Subject();
    resync$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        WishlistStore,
        { provide: WishlistService, useValue: api },
        {
          provide: PlansService,
          useValue: {
            getMyPlan: vi.fn(() =>
              of({
                plan: { code: 'FREE', name: 'Free' },
                limits: [{ key: 'wishlist.items.max', used: 2, limit: 20 }],
              }),
            ),
          },
        },
        {
          provide: LocationService,
          useValue: { getMyLocation: vi.fn(() => of({ discoverable: false })) },
        },
        { provide: NotificationCenter, useValue: { pushed$ } },
        { provide: RealtimeService, useValue: { resync$ } },
      ],
    });
    store = TestBed.inject(WishlistStore);
  });

  it('loads the wishes, the plan usage and whether matching can work', async () => {
    store.init();
    await flush();
    expect(store.status()).toBe('ready');
    expect(store.items().map((item) => item.id)).toEqual(['a', 'b']);
    expect(store.counts()).toEqual({ all: 2, matches: 1, paused: 1 });
    expect(store.totalMatches()).toBe(1);
    expect(store.usage()).toEqual({ used: 2, limit: 20, planName: 'Free' });
    expect(store.readiness()).toBe('no-location');
  });

  it('shows an error state when the list cannot load', () => {
    api['listWishlist'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    store.init();
    expect(store.status()).toBe('error');
    expect(store.error()).toBeInstanceOf(ApiError);
  });

  it('re-reads the list quietly when a wishlist match is pushed or the socket reconnects', async () => {
    store.init();
    current = [wish('a', { matchCount: 2 }), wish('b', { active: false })];
    pushed$.next({
      id: 'n1',
      type: Type.Message,
      title: 'New message',
      body: 'Hi',
      data: {},
      createdAt: 'now',
    });
    expect(api['listWishlist']).toHaveBeenCalledTimes(1);
    pushed$.next({
      id: 'n2',
      type: Type.WishlistMatch,
      title: 'Wishlist match',
      body: 'Listed',
      data: { wishlistItemId: 'a' },
      createdAt: 'now',
    });
    await flush();
    expect(store.status()).toBe('ready');
    expect(store.find('a')?.matchCount).toBe(2);
    resync$.next();
    await flush();
    expect(api['listWishlist']).toHaveBeenCalledTimes(3);
  });

  it('adds new wishes on top and replaces edited ones', () => {
    store.init();
    store.upsert(wish('c'));
    expect(store.items().map((item) => item.id)).toEqual(['c', 'a', 'b']);
    store.upsert(wish('a', { notes: 'Edited' }));
    expect(store.find('a')?.notes).toBe('Edited');
    expect(store.items()).toHaveLength(3);
  });

  it('switches alerts optimistically and restores the wish on failure', async () => {
    store.init();
    const a = store.find('a')!;
    const saved = store.setActive(a, false);
    expect(store.find('a')?.active).toBe(false);
    expect(store.busy().has('a')).toBe(true);
    await saved;
    expect(api['updateWishlistItem']).toHaveBeenCalledWith(
      { id: 'a', updateWishlistItemRequest: { active: false } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.busy().has('a')).toBe(false);

    api['updateWishlistItem'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    const current = store.find('a')!;
    await expect(store.setActive(current, true)).rejects.toBeInstanceOf(ApiError);
    expect(store.find('a')?.active).toBe(false);
  });

  it('removes a wish', async () => {
    store.init();
    await store.remove(store.find('b')!);
    expect(store.items().map((item) => item.id)).toEqual(['a']);
    api['deleteWishlistItem'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    await expect(store.remove(store.find('a')!)).rejects.toBeInstanceOf(ApiError);
    expect(store.items()).toHaveLength(1);
  });

  it('filters the visible wishes', () => {
    store.init();
    store.setFilter('paused');
    expect(store.visible().map((item) => item.id)).toEqual(['b']);
  });
});
