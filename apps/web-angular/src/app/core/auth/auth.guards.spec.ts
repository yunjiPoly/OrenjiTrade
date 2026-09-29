import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import {
  ADMIN_AREA,
  accountGuard,
  adminGuard,
  authGuard,
  guestGuard,
  onboardingGuard,
  safeReturnUrl,
} from './auth.guards';
import { AuthService } from './auth.service';
import { SessionService, SessionStatus } from './session.service';

interface Fixture {
  authenticated: boolean;
  status: SessionStatus;
  needsOnboarding?: boolean;
  admin?: boolean;
  moderator?: boolean;
}

function setup(fixture: Fixture): { snackBar: { open: ReturnType<typeof vi.fn> } } {
  const snackBar = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          ready: () => Promise.resolve(),
          isAuthenticated: signal(fixture.authenticated),
        },
      },
      {
        provide: SessionService,
        useValue: {
          ensureLoaded: () => Promise.resolve(fixture.status),
          needsOnboarding: signal(!!fixture.needsOnboarding),
          isAdmin: signal(!!fixture.admin),
          isModerator: signal(!!fixture.moderator),
        },
      },
      { provide: MatSnackBar, useValue: snackBar },
    ],
  });
  return { snackBar };
}

async function run(
  guard: CanActivateFn,
  url: string,
  data: Record<string, unknown> = {},
  queryParams: Record<string, string> = {},
): Promise<string | true> {
  const route = {
    data,
    queryParamMap: convertToParamMap(queryParams),
  } as unknown as ActivatedRouteSnapshot;
  const result = await TestBed.runInInjectionContext(() =>
    guard(route, { url } as RouterStateSnapshot),
  );
  if (result === true) {
    return true;
  }
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('auth guards', () => {
  it('authGuard sends visitors to sign-in with a return URL', async () => {
    setup({ authenticated: false, status: 'anonymous' });
    await expect(run(authGuard, '/settings/privacy')).resolves.toBe(
      '/auth/sign-in?returnUrl=%2Fsettings%2Fprivacy',
    );
  });

  it('accountGuard routes pending consents and suspensions to their pages', async () => {
    setup({ authenticated: true, status: 'consent-required' });
    await expect(run(accountGuard, '/settings')).resolves.toBe(
      '/auth/consent?returnUrl=%2Fsettings',
    );
    TestBed.resetTestingModule();
    setup({ authenticated: true, status: 'deletion-pending' });
    await expect(run(accountGuard, '/settings')).resolves.toBe('/auth/suspended');
  });

  it('accountGuard lets the page handle API errors itself', async () => {
    setup({ authenticated: true, status: 'error' });
    await expect(run(accountGuard, '/settings')).resolves.toBe(true);
  });

  it('onboardingGuard lets visitors pass and sends unfinished collectors to onboarding', async () => {
    setup({ authenticated: false, status: 'anonymous' });
    await expect(run(onboardingGuard, '/map')).resolves.toBe(true);
    TestBed.resetTestingModule();
    setup({ authenticated: true, status: 'ready', needsOnboarding: true });
    await expect(run(onboardingGuard, '/map')).resolves.toBe('/onboarding?returnUrl=%2Fmap');
    TestBed.resetTestingModule();
    setup({ authenticated: true, status: 'ready' });
    await expect(run(onboardingGuard, '/map')).resolves.toBe(true);
  });

  it('adminGuard opens everything to admins', async () => {
    setup({ authenticated: true, status: 'ready', admin: true });
    await expect(run(adminGuard, '/admin/users', { [ADMIN_AREA]: 'admin' })).resolves.toBe(true);
  });

  it('adminGuard limits moderators to moderation areas', async () => {
    const { snackBar } = setup({ authenticated: true, status: 'ready', moderator: true });
    await expect(run(adminGuard, '/admin')).resolves.toBe(true);
    await expect(run(adminGuard, '/admin/reports', { [ADMIN_AREA]: 'moderation' })).resolves.toBe(
      true,
    );
    await expect(run(adminGuard, '/admin/users', { [ADMIN_AREA]: 'admin' })).resolves.toBe(
      '/admin',
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'This admin area is limited to administrators.',
      'OK',
      expect.anything(),
    );
  });

  it('adminGuard turns collectors away', async () => {
    setup({ authenticated: true, status: 'ready' });
    await expect(run(adminGuard, '/admin')).resolves.toBe('/map');
  });

  it('guestGuard sends signed-in collectors to their (safe) return URL', async () => {
    setup({ authenticated: true, status: 'ready' });
    await expect(run(guestGuard, '/auth/sign-in', {}, { returnUrl: '/settings' })).resolves.toBe(
      '/settings',
    );
    await expect(
      run(guestGuard, '/auth/sign-in', {}, { returnUrl: 'https://evil.example' }),
    ).resolves.toBe('/map');
  });
});

describe('safeReturnUrl', () => {
  it('accepts in-app paths only', () => {
    expect(safeReturnUrl('/collectors/maika')).toBe('/collectors/maika');
    expect(safeReturnUrl('//evil.example')).toBe('/map');
    expect(safeReturnUrl('https://evil.example')).toBe('/map');
    expect(safeReturnUrl(undefined)).toBe('/map');
    expect(safeReturnUrl('/auth/sign-in')).toBe('/map');
    expect(safeReturnUrl('/onboarding?returnUrl=%2Fmap')).toBe('/map');
    expect(safeReturnUrl(null, '/settings')).toBe('/settings');
  });
});
