import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/**
 * Starts Firebase Authentication once `/config.json` is known (the SDK is loaded lazily) and
 * creates the session service so it follows identity changes from the very first one.
 * Bootstrapping does not wait for either; guards and the auth interceptor await
 * `AuthService.ready()`.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      inject(SessionService);
      // Not awaited: the Firebase SDK is a lazy chunk and must not delay the first paint.
      void inject(AuthService).init();
    }),
  ]);
}
