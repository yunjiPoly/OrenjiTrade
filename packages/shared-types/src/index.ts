/**
 * @orenji/shared-types
 *
 * Generated OpenAPI types (`schema.d.ts`) plus a small factory around `openapi-fetch` that
 * every non-Angular client (the Expo mobile app, scripts, tests) uses to talk to the API.
 *
 * Regenerate `schema.d.ts` with `npm run generate` whenever `docs/api/openapi.json` changes.
 */
import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { components, operations, paths } from './schema';

export type { components, operations, paths };

/** Convenience aliases for the most-used DTOs. */
export type Schemas = components['schemas'];
export type MetaResponse = Schemas['MetaResponse'];
export type ProblemDetail = Schemas['ProblemDetail'];

/** Normalised API error shared by web and mobile (mirrors `ApiError` in apps/web-angular). */
export interface ApiError {
  errorCode: string;
  message: string;
  requestId: string | null;
  status: number;
  fieldErrors: Record<string, string>;
}

/** Returns a bearer token (or null when signed out). May be async (Firebase `getIdToken`). */
export type TokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

export interface CreateApiClientOptions {
  /** Returns the Firebase ID token to send as `Authorization: Bearer ...`. */
  getToken?: TokenProvider;
  /** Custom `fetch` (React Native, tests). Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Extra static headers, e.g. `{ 'Accept-Language': 'en-CA' }`. */
  headers?: Record<string, string>;
  /** Generates the `X-Request-Id` header value. Defaults to `crypto.randomUUID()` when available. */
  requestId?: () => string;
}

export type ApiClient = Client<paths>;

/** Header name every request carries so server logs can be correlated (see CLAUDE.md). */
export const REQUEST_ID_HEADER = 'X-Request-Id';

function defaultRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  // Fallback for runtimes without Web Crypto (very old React Native). Not cryptographically strong;
  // it only needs to be unique enough for log correlation.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Creates a typed `openapi-fetch` client for the OrenjiTrade API.
 *
 * ```ts
 * const api = createApiClient('http://localhost:8080', () => auth.currentUser?.getIdToken());
 * const { data, error } = await api.GET('/api/v1/meta');
 * ```
 *
 * @param baseUrl   API origin, e.g. `http://localhost:8080` or `https://api.orenjitrade.com`.
 * @param getToken  Optional token provider; when it returns a token the request is authenticated.
 */
export function createApiClient(
  baseUrl: string,
  getToken?: TokenProvider,
  options: Omit<CreateApiClientOptions, 'getToken'> = {},
): ApiClient {
  const client = createClient<paths>({
    baseUrl: baseUrl.replace(/\/+$/, ''),
    fetch: options.fetch,
    headers: { Accept: 'application/json', ...options.headers },
  });

  const requestId = options.requestId ?? defaultRequestId;

  const middleware: Middleware = {
    async onRequest({ request }) {
      if (!request.headers.has(REQUEST_ID_HEADER)) {
        request.headers.set(REQUEST_ID_HEADER, requestId());
      }
      const token = getToken ? await getToken() : null;
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
  };
  client.use(middleware);
  return client;
}

/**
 * Maps a failed response body (RFC 9457 Problem Details) into the shared `ApiError` shape.
 * Works for `error` objects returned by `openapi-fetch` as well as raw `Response`s.
 */
export function toApiError(
  status: number,
  body: unknown,
  fallbackRequestId: string | null = null,
): ApiError {
  const problem = (body && typeof body === 'object' ? body : {}) as ProblemDetail;
  const fieldErrors: Record<string, string> = {};
  for (const e of problem.errors ?? []) {
    if (e.field) {
      fieldErrors[e.field] = e.message ?? 'Invalid value';
    }
  }
  return {
    errorCode: problem.errorCode ?? (status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR'),
    message:
      problem.message ??
      problem.detail ??
      problem.title ??
      (status === 0 ? 'Network error' : `Request failed (${status})`),
    requestId: problem.requestId ?? fallbackRequestId,
    status: problem.status ?? status,
    fieldErrors,
  };
}
