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

/**
 * Opt a request out of the session redirects (428 -> consent page, 403 ACCOUNT_SUSPENDED ->
 * suspended page). Used by `SessionService` itself and by flows that handle those errors inline.
 */
export const SKIP_SESSION_REDIRECT = new HttpContextToken<boolean>(() => false);

/** Paths (after the base URL) that never carry the user's ID token. */
const PUBLIC_API_PATH = /^\/api\/v1\/(public\/|meta(?:$|[/?#]))/;

/** True for `/api/v1/public/**` and `/api/v1/meta`, absolute or relative. */
export function isPublicApiUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url, 'http://relative.invalid').pathname;
  } catch {
    // Keep the raw value; the regular expression still works for relative paths.
  }
  return PUBLIC_API_PATH.test(path);
}
