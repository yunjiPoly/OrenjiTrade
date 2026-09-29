import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Header carried by every API request for log correlation (see CLAUDE.md). */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Set by the base-URL interceptor on requests that target the OrenjiTrade API. */
export const IS_API_REQUEST = new HttpContextToken<boolean>(() => false);

/** Opt a request out of the global error toast (background probes, optional widgets). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** Convenience: `http.get(url, { context: silentErrors() })`. */
export function silentErrors(context: HttpContext = new HttpContext()): HttpContext {
  return context.set(SKIP_ERROR_TOAST, true);
}

/** Generates a request id (RFC 4122 v4) with a fallback for runtimes without Web Crypto. */
export function newRequestId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
