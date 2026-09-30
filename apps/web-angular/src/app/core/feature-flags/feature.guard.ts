import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanActivateFn, Router } from '@angular/router';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * Route guard for a flag-gated page: waits for the first flags answer, then lets the visitor in
 * when `key` is on, otherwise explains it and goes to `fallback`. Hidden features stay hidden
 * even when typed into the address bar.
 */
export function featureGuard(key: string, label: string, fallback = '/map'): CanActivateFn {
  return async () => {
    const flags = inject(FeatureFlagsService);
    const router = inject(Router);
    const snackBar = inject(MatSnackBar);
    await flags.whenLoaded();
    if (flags.isEnabled(key)) {
      return true;
    }
    snackBar.open(`${label} is not available right now.`, 'OK', { duration: 5000 });
    return router.createUrlTree([fallback]);
  };
}
