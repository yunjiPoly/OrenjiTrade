import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { IS_API_REQUEST, SKIP_LIMIT_DIALOG } from '../http/http-context';
import { isLimitReached } from './limit-reached';
import { LimitReachedService } from './limit-reached.service';

/**
 * Global handler for freemium limits: any API answer 429 `LIMIT_REACHED` opens the
 * limit-reached dialog (limit, usage, reset time, premium benefit). The error still reaches the
 * caller so the screen can restore its state. Opt out with `SKIP_LIMIT_DIALOG`.
 *
 * Runs outside `errorInterceptor`, so it sees normalised `ApiError`s.
 */
export const limitReachedInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(IS_API_REQUEST) || req.context.get(SKIP_LIMIT_DIALOG)) {
    return next(req);
  }
  const limits = inject(LimitReachedService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (isLimitReached(error)) {
        limits.show(error);
      }
      return throwError(() => error);
    }),
  );
};
