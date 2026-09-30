import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { isApiError } from '../http/api-error';
import { ATTACH_ID_TOKEN, IS_API_REQUEST, isPublicApiUrl } from '../http/http-context';
import { AuthService } from './auth.service';

const AUTHORIZATION = 'Authorization';

function withBearer<T>(req: HttpRequest<T>, token: string): HttpRequest<T> {
  return req.clone({ setHeaders: { [AUTHORIZATION]: `Bearer ${token}` } });
}

/** A 401 worth one retry with a fresh token (not a "sign in again" demand from the server). */
function isRetryableUnauthorized(error: unknown): boolean {
  if (isApiError(error)) {
    return error.status === 401 && error.errorCode !== 'REAUTHENTICATION_REQUIRED';
  }
  return error instanceof HttpErrorResponse && error.status === 401;
}

/**
 * Adds `Authorization: Bearer <Firebase ID token>` to OrenjiTrade API requests, except the public
 * routes (`/api/v1/public/**`, `/api/v1/meta`, unless the request sets `ATTACH_ID_TOKEN`) and
 * requests that already carry the header.
 * Waits for Firebase to restore the session first, so the very first request after a reload is
 * authenticated. On a 401 it forces one token refresh and retries the request once.
 *
 * Runs after `apiBaseUrlInterceptor` (which tags API requests) and before `errorInterceptor`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    !req.context.get(IS_API_REQUEST) ||
    (isPublicApiUrl(req.url) && !req.context.get(ATTACH_ID_TOKEN)) ||
    req.headers.has(AUTHORIZATION)
  ) {
    return next(req);
  }
  const auth = inject(AuthService);
  const currentToken = auth
    .ready()
    .then(() => auth.getIdToken(false))
    .catch(() => null);

  return from(currentToken).pipe(
    switchMap((token) => {
      if (!token) {
        return next(req);
      }
      return next(withBearer(req, token)).pipe(
        catchError((error: unknown) => {
          if (!isRetryableUnauthorized(error)) {
            return throwError(() => error);
          }
          return from(auth.getIdToken(true).catch(() => null)).pipe(
            switchMap((fresh) =>
              fresh && fresh !== token ? next(withBearer(req, fresh)) : throwError(() => error),
            ),
          );
        }),
      );
    }),
  );
};
