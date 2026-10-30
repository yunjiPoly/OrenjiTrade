import { Router } from '@angular/router';
import { safeReturnUrl } from '../../core/auth/auth.guards';
import { SessionService } from '../../core/auth/session.service';

/**
 * Sends a freshly signed-in collector to the right place: accept updated terms (or confirm the
 * age), the suspended page, "We could not load your account", the welcome, or the page they were
 * heading to.
 */
export async function routeAfterSignIn(
  session: SessionService,
  router: Router,
  returnUrl: unknown,
): Promise<void> {
  const target = safeReturnUrl(returnUrl);
  const status = await session.ensureLoaded();
  switch (status) {
    case 'consent-required':
      await router.navigate(['/auth/consent'], { queryParams: { returnUrl: target } });
      return;
    case 'suspended':
    case 'deletion-pending':
      await router.navigate(['/auth/suspended']);
      return;
    case 'error':
      // "We could not load your account" with Try again, which goes on to `target` (spec 14).
      await router.navigate(['/auth/unavailable'], { queryParams: { returnUrl: target } });
      return;
    default:
      if (status === 'ready' && session.needsOnboarding()) {
        await router.navigate(['/onboarding'], { queryParams: { returnUrl: target } });
        return;
      }
      await router.navigateByUrl(target);
  }
}
