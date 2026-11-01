import { TestBed } from '@angular/core/testing';
import { LocationService, SettingsService } from '@orenji/api-client';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { RegionContext } from '../../core/region/region-context.service';
import { MyLocationStore } from './my-location.store';

describe('MyLocationStore (WE review F8: one read at a time)', () => {
  let location: Subject<unknown>;
  let privacy: Subject<unknown>;
  let api: { getMyLocation: ReturnType<typeof vi.fn> };
  let settings: { getPrivacySettings: ReturnType<typeof vi.fn> };
  let store: MyLocationStore;

  beforeEach(() => {
    location = new Subject();
    privacy = new Subject();
    api = { getMyLocation: vi.fn(() => location) };
    settings = { getPrivacySettings: vi.fn(() => privacy) };
    TestBed.configureTestingModule({
      providers: [
        { provide: LocationService, useValue: api },
        { provide: SettingsService, useValue: settings },
        { provide: AuthService, useValue: { user: () => ({ uid: 'fb-1' }), changes$: of() } },
        { provide: SessionService, useValue: { load: vi.fn() } },
        { provide: RegionContext, useValue: { applyHome: vi.fn() } },
      ],
    });
    store = TestBed.inject(MyLocationStore);
  });

  function answer(): void {
    location.next({ discoverable: true });
    location.complete();
    privacy.next({ discoverable: true });
    privacy.complete();
  }

  it('shares a load in flight, and ensureLoaded reads nothing once both are known', async () => {
    const first = store.load();
    const second = store.load();
    expect(second).toBe(first);
    expect(api.getMyLocation).toHaveBeenCalledTimes(1);
    expect(settings.getPrivacySettings).toHaveBeenCalledTimes(1);
    answer();
    expect(await first).toBe(true);
    expect(await store.ensureLoaded()).toBe(true);
    expect(api.getMyLocation).toHaveBeenCalledTimes(1);
  });

  it('reads again after a reset (another account), and a later load asks anew', async () => {
    const first = store.load();
    answer();
    await first;
    store.reset();
    location = new Subject();
    privacy = new Subject();
    const again = store.ensureLoaded();
    expect(api.getMyLocation).toHaveBeenCalledTimes(2);
    answer();
    expect(await again).toBe(true);
  });
});
