import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocationService, ProfileService, SettingsService } from '@orenji/api-client';
import { Subject, from, of } from 'rxjs';
import { AuthChange, AuthService } from '../../core/auth/auth.service';
import { SessionService, SessionStatus } from '../../core/auth/session.service';
import { RegionContext } from '../../core/region/region-context.service';
import { MyLocationStore } from '../location/my-location.store';
import { MyProfileStore } from '../profile/my-profile.store';
import { ViewerPlaceService } from './viewer-place.service';

interface Answer {
  subdivisionCode: string;
  countryCode: string;
  city: string;
}

function located(place: Answer) {
  return {
    discoverable: true,
    location: { ...place, regionCode: 'americas-north', showCity: true },
  };
}

/**
 * The viewer's place belongs to the signed-in account (WD review P1): after signing out and
 * another collector signing in on the same tab, "your province" is theirs, and the previous
 * collector's location, city and privacy settings are gone from memory.
 */
describe('ViewerPlaceService and the account stores', () => {
  const status = signal<SessionStatus>('anonymous');
  const me = signal<{ id: string } | null>(null);
  const user = signal<{ uid: string } | null>(null);
  let changes: Subject<AuthChange>;
  let answers: Record<string, ReturnType<typeof located>>;
  let pending: ((value: unknown) => void) | null;

  function signIn(id: string) {
    user.set({ uid: `fb-${id}` });
    changes.next({ user: { uid: `fb-${id}` } as never, idToken: 't' });
    me.set({ id });
    status.set('ready');
    TestBed.tick();
  }

  function signOut() {
    user.set(null);
    changes.next({ user: null, idToken: null });
    me.set(null);
    status.set('anonymous');
    TestBed.tick();
  }

  beforeEach(() => {
    status.set('anonymous');
    me.set(null);
    user.set(null);
    changes = new Subject<AuthChange>();
    pending = null;
    answers = {
      viewer: located({ subdivisionCode: 'CA-QC', countryCode: 'CA', city: 'Zqviewcity' }),
      blocker: located({ subdivisionCode: 'CA-ON', countryCode: 'CA', city: '' }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: { status, me, load: vi.fn() } },
        { provide: AuthService, useValue: { user, changes$: changes } },
        { provide: RegionContext, useValue: { applyHome: vi.fn() } },
        {
          provide: LocationService,
          useValue: {
            getMyLocation: () => {
              const id = me()?.id ?? '';
              if (id === 'slow') {
                return from(new Promise((resolve) => (pending = resolve)));
              }
              return of(answers[id]);
            },
          },
        },
        {
          provide: SettingsService,
          useValue: { getPrivacySettings: () => of({ discoverable: true }) },
        },
        { provide: ProfileService, useValue: { getMyProfile: () => of({ games: ['pokemon'] }) } },
      ],
    });
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('gives the second account its own province, and a guest nulls, after an in-tab switch', async () => {
    const viewer = TestBed.inject(ViewerPlaceService);
    const store = TestBed.inject(MyLocationStore);
    signIn('viewer');
    await settle();
    expect(viewer.place()).toEqual({ subdivisionCode: 'CA-QC', countryCode: 'CA' });
    expect(store.location()?.location?.city).toBe('Zqviewcity');

    signOut();
    expect(viewer.place()).toEqual({ subdivisionCode: null, countryCode: null });
    expect(store.location()).toBeNull();
    expect(store.privacy()).toBeNull();

    signIn('blocker');
    await settle();
    expect(viewer.place()).toEqual({ subdivisionCode: 'CA-ON', countryCode: 'CA' });
    expect(JSON.stringify(store.location())).not.toContain('Zqviewcity');
  });

  it('drops an answer for the previous account that arrives after the switch', async () => {
    const store = TestBed.inject(MyLocationStore);
    TestBed.inject(ViewerPlaceService);
    signIn('slow');
    expect(pending).not.toBeNull();
    signOut();
    signIn('blocker');
    await settle();
    expect(store.location()?.location?.subdivisionCode).toBe('CA-ON');
    pending!(answers['viewer']);
    await settle();
    expect(store.location()?.location?.subdivisionCode).toBe('CA-ON');
  });

  it("forgets the previous account's profile (the game pill reads its games)", async () => {
    const profiles = TestBed.inject(MyProfileStore);
    signIn('viewer');
    await profiles.load();
    expect(profiles.profile()?.games).toEqual(['pokemon']);
    signOut();
    expect(profiles.profile()).toBeNull();
  });
});
