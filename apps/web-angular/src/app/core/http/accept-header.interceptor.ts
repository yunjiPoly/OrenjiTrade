import { HttpInterceptorFn } from '@angular/common/http';
import { IS_API_REQUEST } from './http-context';

const PROBLEM_ONLY = 'application/problem+json';
const JSON_OR_PROBLEM = 'application/json, application/problem+json';

/**
 * The generated client sends `Accept: application/problem+json` for operations without a
 * success body (204: suspend, unsuspend, roles, cancel deletion, delete location/avatar...).
 * Controllers that declare `produces = application/json` answer those with 406, so API requests
 * that only accept problem details also accept JSON. Must run after `apiBaseUrlInterceptor`.
 */
export const acceptHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(IS_API_REQUEST) || req.headers.get('Accept') !== PROBLEM_ONLY) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Accept: JSON_OR_PROBLEM } }));
};
