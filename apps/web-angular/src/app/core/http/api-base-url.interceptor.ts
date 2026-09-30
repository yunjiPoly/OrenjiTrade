import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppConfigService } from '../config/app-config.service';
import { IS_API_REQUEST } from './http-context';

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Rewrites relative `/api/...` URLs to `${apiBaseUrl}/api/...` and tags them as API requests.
 * Absolute URLs that already start with the configured base URL are tagged too.
 * Everything else (e.g. `/config.json`, third-party origins) passes through untouched.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBaseUrl = inject(AppConfigService).apiBaseUrl();

  if (req.url.startsWith('/api/')) {
    return next(
      req.clone({
        url: `${apiBaseUrl}${req.url}`,
        context: req.context.set(IS_API_REQUEST, true),
      }),
    );
  }

  if (ABSOLUTE_URL.test(req.url) && apiBaseUrl && req.url.startsWith(`${apiBaseUrl}/`)) {
    return next(req.clone({ context: req.context.set(IS_API_REQUEST, true) }));
  }

  return next(req);
};
