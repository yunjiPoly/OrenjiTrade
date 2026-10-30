import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Route,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { accountGuard } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { SETTINGS_ROUTES, settingsHomeGuard } from './settings.routes';

describe('the Settings routes (spec 13 and 14)', () => {
  const sections = (SETTINGS_ROUTES[0].children ?? []).filter(
    (route): route is Route & { path: string } => !!route.path && !!route.loadComponent,
  );

  it("keeps every section the account's, except Appearance and Legal a guest may open", () => {
    const open = sections
      .filter((route) => !(route.canActivate ?? []).includes(accountGuard))
      .map((route) => route.path);
    expect(open).toEqual(['appearance', 'legal']);
    expect(sections.length).toBeGreaterThan(8);
  });

  it('opens on Profile for a collector and on Appearance for a guest, once the session is known', async () => {
    const authenticated = signal(false);
    let restore!: () => void;
    const restored = new Promise<void>((resolve) => (restore = resolve));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'settings', children: SETTINGS_ROUTES }]),
        {
          provide: AuthService,
          useValue: { isAuthenticated: authenticated, ready: () => restored },
        },
      ],
    });
    const router = TestBed.inject(Router);
    const run = (url: string) =>
      TestBed.runInInjectionContext(() =>
        settingsHomeGuard(
          router.parseUrl(url).root as unknown as ActivatedRouteSnapshot,
          { url } as RouterStateSnapshot,
        ),
      ) as Promise<UrlTree>;
    // A fresh load: Firebase has not restored the collector yet when the route resolves.
    const fresh = run('/settings');
    authenticated.set(true);
    restore();
    expect(router.serializeUrl(await fresh)).toBe('/settings/profile');
    expect(router.serializeUrl(await run('/settings/nope'))).toBe('/settings/profile');
    authenticated.set(false);
    expect(router.serializeUrl(await run('/settings'))).toBe('/settings/appearance');
  });

  it('sends /settings, /settings/ and an unknown section through that guard', () => {
    const children = SETTINGS_ROUTES[0].children ?? [];
    const home = children.find((route) => route.path === '' && route.pathMatch === 'full');
    const unknown = children.find((route) => route.path === '**');
    expect(home?.canActivate).toEqual([settingsHomeGuard]);
    expect(unknown?.canActivate).toEqual([settingsHomeGuard]);
    expect(home?.redirectTo).toBeUndefined();
    expect(unknown?.redirectTo).toBeUndefined();
  });
});
