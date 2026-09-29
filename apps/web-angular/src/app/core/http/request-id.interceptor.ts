import { HttpInterceptorFn } from '@angular/common/http';
import { IS_API_REQUEST, REQUEST_ID_HEADER, newRequestId } from './http-context';

/**
 * Adds a unique `X-Request-Id` to every API request so client and server logs can be correlated.
 * Must run after {@link apiBaseUrlInterceptor}, which tags API requests.
 */
export const requestIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(IS_API_REQUEST) || req.headers.has(REQUEST_ID_HEADER)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { [REQUEST_ID_HEADER]: newRequestId() } }));
};
