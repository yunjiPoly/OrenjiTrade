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
import { provideAppConfig } from './core/config/app-config.service';
import { apiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { requestIdInterceptor } from './core/http/request-id.interceptor';
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
    // Interceptor order matters: base URL tagging -> request id -> error mapping/toast.
    provideHttpClient(
      withInterceptors([apiBaseUrlInterceptor, requestIdInterceptor, errorInterceptor]),
    ),
    provideAppConfig(),
    provideApiClient(),
    // Material Symbols Rounded is the icon family of the design system (see index.html).
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
      // Instantiating the theme service applies the persisted preference before first paint.
      inject(ThemeService);
    }),
  ],
};
