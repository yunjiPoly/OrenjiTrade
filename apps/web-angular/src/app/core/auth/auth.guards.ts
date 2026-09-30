import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './auth.service';
import { SessionService, SessionStatus } from './session.service';

/** Route data key: `'moderation'` marks admin areas moderators may open. */
export const ADMIN_AREA = 'adminArea';
export type AdminArea = 'admin' | 'moderation';

/** Only same-app absolute paths are accepted as return URLs (no open redirects). */
export function safeReturnUrl(value: unknown, fallback = '/map'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  // Auth pages and onboarding are steps, never destinations to come back to.
  if (/^\/(auth|onboarding)(\/|$|\?)/.test(value)) {
    return fallback;
  }
  return value;
}

/** Where an account in `status` must go instead of `url`; `null` when it may continue. */
function accountStateRedirect(router: Router, status: SessionStatus, url: string): UrlTree | null {
  switch (status) {
    case 'consent-required':
      return router.createUrlTree(['/auth/consent'], { queryParams: { returnUrl: url } });
    case 'suspended':
    case 'deletion-pending':
      return router.createUrlTree(['/auth/suspended']);
    default:
      // `error` passes: pages render their own retryable error states.
      return null;
  }
}

function signInTree(router: Router, url: string): UrlTree {
  return router.createUrlTree(['/auth/sign-in'], { queryParams: { returnUrl: url } });
}

/** Signed in with Firebase, otherwise to the sign-in page (keeping the return URL). */
export const authGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  return auth.isAuthenticated() ? true : signInTree(router, state.url);
};

/** Signed in and the account is usable (terms accepted, not suspended, no pending deletion). */
export const accountGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) {
    return signInTree(router, state.url);
  }
  const status = await session.ensureLoaded();
  return accountStateRedirect(router, status, state.url) ?? true;
};

/**
 * Public pages: anonymous visitors pass; signed-in collectors must have a usable account and a
 * finished onboarding (profile saved, at least one game or tag).
 */
export const onboardingGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) {
    return true;
  }
  const status = await session.ensureLoaded();
  const redirect = accountStateRedirect(router, status, state.url);
  if (redirect) {
    return redirect;
  }
  if (status === 'ready' && session.needsOnboarding()) {
    return router.createUrlTree(['/onboarding'], { queryParams: { returnUrl: state.url } });
  }
  return true;
};

/** Public pages that still honour the account state for signed-in visitors (no onboarding). */
export const accountStateGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) {
    return true;
  }
  const status = await session.ensureLoaded();
  return accountStateRedirect(router, status, state.url) ?? true;
};

/**
 * Admin console. ADMIN and SUPER_ADMIN open everything; MODERATOR only routes whose data says
 * `adminArea: 'moderation'` (and the dashboard, which carries no area).
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);
  await auth.ready();
  if (!auth.isAuthenticated()) {
    return signInTree(router, state.url);
  }
  const status = await session.ensureLoaded();
  const redirect = accountStateRedirect(router, status, state.url);
  if (redirect) {
    return redirect;
  }
  if (session.isAdmin()) {
    return true;
  }
  const area = route.data[ADMIN_AREA] as AdminArea | undefined;
  if (session.isModerator() && area !== 'admin') {
    return true;
  }
  snackBar.open(
    session.isModerator()
      ? 'This admin area is limited to administrators.'
      : 'The admin console is limited to staff accounts.',
    'OK',
    { duration: 5000 },
  );
  return router.createUrlTree([session.isModerator() ? '/admin' : '/map']);
};

/** Sign-in / sign-up pages: signed-in collectors go straight to where they were heading. */
export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready();
  if (!auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')));
};
