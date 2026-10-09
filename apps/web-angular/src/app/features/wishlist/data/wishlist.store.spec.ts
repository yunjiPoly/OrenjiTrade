import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MyLocationResponse,
  PlansService,
  PrivacySettings,
  WishlistItemResponse,
  WishlistService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { MyLocationStore } from '../../../shared/location/my-location.store';
import { WishlistStore } from './wishlist.store';

function wish(id: string, overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id,
    game: 'pokemon',
    card: { id: `card-${id}`, name: `Card ${id}` },
    note: '',
    nearMintOnly: false,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

const QUEBEC = {
  regionCode: 'americas-north',
  regionName: 'Americas (North)',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-QC',
  subdivisionName: 'Quebec',
  label: 'Quebec, Canada',
  showCity: true,
};

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

describe('WishlistStore', () => {
  let store: WishlistStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let current: WishlistItemResponse[];
  let resync$: Subject<void>;
  let location: ReturnType<typeof signal<MyLocationResponse | null>>;
  let privacy: ReturnType<typeof signal<PrivacySettings | null>>;
  let myLocation: {
    location: typeof location;
    privacy: typeof privacy;
    load: ReturnType<typeof vi.fn>;
    savePrivacy: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    current = [wish('a', { note: 'Mint please' }), wish('b', { nearMintOnly: true })];
    api = {
      listWishlist: vi.fn(() => of(current)),
      deleteWishlistItem: vi.fn(() => of({})),
    };
    resync$ = new Subject();
    location = signal<MyLocationResponse | null>(null);
    privacy = signal<PrivacySettings | null>(null);
    myLocation = {
      location,
      privacy,
      load: vi.fn(async () => {
        location.set({ discoverable: false });
        privacy.set({ wishlistVisible: false } as PrivacySettings);
        return true;
      }),
      savePrivacy: vi.fn(async (settings: PrivacySettings) => {
        privacy.set(settings);
        return settings;
      }),
    };
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
        { provide: MyLocationStore, useValue: myLocation },
        { provide: RealtimeService, useValue: { resync$ } },
      ],
    });
    store = TestBed.inject(WishlistStore);
  });

  it('loads the wishes, the plan usage, the alert readiness and the visibility', async () => {
    expect(store.readiness()).toBe('unknown');
    expect(store.visible()).toBeNull();
    store.init();
    await flush();
    expect(store.status()).toBe('ready');
    expect(store.items().map((item) => item.id)).toEqual(['a', 'b']);
    expect(store.usage()).toEqual({ used: 2, limit: 20, planName: 'Free' });
    expect(store.readiness()).toBe('no-location');
    expect(store.visible()).toBe(false);
    location.set({ discoverable: true, location: QUEBEC });
    expect(store.readiness()).toBe('ready');
    // No matches, filters or paused wishes any more (stage S2).
    expect('counts' in store).toBe(false);
    expect('setActive' in store).toBe(false);
  });

  it('turns "Let others see what you want" on through the privacy settings', async () => {
    store.init();
    await flush();
    await store.setVisible(true);
    expect(myLocation.savePrivacy).toHaveBeenCalledWith({ wishlistVisible: true });
    expect(store.visible()).toBe(true);
  });

  it('shows the error state and retries', async () => {
    api['listWishlist'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 503, error: { errorCode: 'X' } })),
    );
    store.init();
    await flush();
    expect(store.status()).toBe('error');
    expect(store.error()).toBeInstanceOf(ApiError);
    store.load();
    await flush();
    expect(store.status()).toBe('ready');
  });

  it('adds and replaces wishes from the dialog and removes them', async () => {
    store.init();
    await flush();
    store.upsert(wish('c'));
    expect(store.items().map((item) => item.id)).toEqual(['c', 'a', 'b']);
    store.upsert(wish('a', { note: 'Edited' }));
    expect(store.find('a')?.note).toBe('Edited');
    await store.remove(wish('b'));
    expect(api['deleteWishlistItem']).toHaveBeenCalledWith(
      { id: 'b' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((item) => item.id)).toEqual(['c', 'a']);
  });

  it('re-reads the list quietly after a realtime reconnection', async () => {
    store.init();
    await flush();
    current = [wish('z')];
    resync$.next();
    await flush();
    expect(store.items().map((item) => item.id)).toEqual(['z']);
  });
});
