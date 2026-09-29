import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { provideApiClient } from './core/api/provide-api-client';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideAuth } from './core/auth/provide-auth';
import { sessionInterceptor } from './core/auth/session.interceptor';
import { provideAppConfig } from './core/config/app-config.service';
import { provideFeatureFlags } from './core/feature-flags/feature-flags.service';
import { acceptHeaderInterceptor } from './core/http/accept-header.interceptor';
import { apiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { requestIdInterceptor } from './core/http/request-id.interceptor';
import { limitReachedInterceptor } from './core/limits/limit-reached.interceptor';
import { OrenjiTitleStrategy } from './core/routing/orenji-title.strategy';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      withViewTransitions(),
    ),
    { provide: TitleStrategy, useClass: OrenjiTitleStrategy },
    // Interceptor order matters: base URL tagging -> Accept fix for bodiless operations ->
    // request id -> account-state redirects -> limit-reached dialog (429 LIMIT_REACHED) ->
    // bearer token (+ one retry on 401) -> error mapping/toast (innermost, so the outer
    // interceptors see normalised ApiError instances).
    provideHttpClient(
      withInterceptors([
        apiBaseUrlInterceptor,
        acceptHeaderInterceptor,
        requestIdInterceptor,
        sessionInterceptor,
        limitReachedInterceptor,
        authInterceptor,
        errorInterceptor,
      ]),
    ),
    provideAppConfig(),
    provideApiClient(),
    provideAuth(),
    provideFeatureFlags(),
    // Material Symbols Rounded is the icon family of the design system (see index.html).
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
      // Instantiating the theme service applies the persisted preference before first paint.
      inject(ThemeService);
    }),
  ],
};
