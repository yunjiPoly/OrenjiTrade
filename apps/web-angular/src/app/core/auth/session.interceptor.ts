import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { isApiError } from '../http/api-error';
import { IS_API_REQUEST, SKIP_SESSION_REDIRECT } from '../http/http-context';
import { SessionService } from './session.service';

const SESSION_ERROR_CODES = new Set(['TERMS_ACCEPTANCE_REQUIRED', 'ACCOUNT_SUSPENDED']);

/**
 * Reports account-state answers (428 `TERMS_ACCEPTANCE_REQUIRED`, 403 `ACCOUNT_SUSPENDED`) from
 * any API call to {@link SessionService}, which routes to the consent or suspended page. The
 * error still reaches the caller. Opt out with the `SKIP_SESSION_REDIRECT` context token.
 */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(IS_API_REQUEST) || req.context.get(SKIP_SESSION_REDIRECT)) {
    return next(req);
  }
  const session = inject(SessionService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (isApiError(error) && SESSION_ERROR_CODES.has(error.errorCode)) {
        session.handleApiError(error);
      }
      return throwError(() => error);
    }),
  );
};
