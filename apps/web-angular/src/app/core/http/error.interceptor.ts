import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { ApiError, toApiError } from './api-error';
import { IS_API_REQUEST, REQUEST_ID_HEADER, SKIP_ERROR_TOAST } from './http-context';

/** How long the error toast stays on screen. */
export const ERROR_TOAST_DURATION_MS = 6000;

/** Builds the user-facing toast text for server/network failures. */
export function errorToastMessage(error: ApiError): string {
  if (error.isNetworkError) {
    return 'Cannot reach the OrenjiTrade API. Check your connection and retry.';
  }
  const ref = error.requestId ? ` (request ${error.requestId.slice(0, 8)})` : '';
  return `Something went wrong on our side${ref}. Please retry in a moment.`;
}

/**
 * Maps failed responses to {@link ApiError} and shows a snack bar for 5xx / network failures.
 * 4xx errors are surfaced to the caller only: pages render them inline (validation, not found, ...).
 * Requests can opt out of the toast with the {@link SKIP_ERROR_TOAST} context token.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: unknown) => {
      const apiError = toApiError(error, req.headers.get(REQUEST_ID_HEADER));

      const shouldToast =
        req.context.get(IS_API_REQUEST) &&
        !req.context.get(SKIP_ERROR_TOAST) &&
        (apiError.isServerError || apiError.isNetworkError);

      if (shouldToast) {
        snackBar.open(errorToastMessage(apiError), 'Retry later', {
          duration: ERROR_TOAST_DURATION_MS,
          politeness: 'assertive',
          panelClass: 'app-toast--error',
        });
      }

      return throwError(() => apiError);
    }),
  );
};
