import {
  REQUEST_ID_HEADER,
  createApiClient as createSharedApiClient,
  type ApiClient as SharedApiClient,
} from '@orenji/shared-types';
import * as Crypto from 'expo-crypto';
import type { Middleware } from 'openapi-fetch';

import { getIdToken } from '@/src/auth/tokenProvider';
import { appConfig } from '@/src/config/env';

import { ApiError, REAUTHENTICATION_REQUIRED_CODE } from './ApiError';
import { reportAccountSignal } from './accountSignal';

export { REQUEST_ID_HEADER };

const AUTHORIZATION = 'Authorization';

export const API_BASE_URL = appConfig.apiBaseUrl;

function newRequestId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // Web / test environments without the native module.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('json')) {
      return await response.json();
    }
    const text = await response.text();
    return text.length > 0 ? { detail: text } : null;
  } catch {
    return null;
  }
}

/** Public routes never need the ID token (mirror of the web's `isPublicApiUrl`). */
export function isPublicApiUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Already a path.
  }
  return path.startsWith('/api/v1/public/') || path === '/api/v1/meta';
}

/**
 * Adds `Authorization: Bearer <Firebase ID token>` to every non-public request. The SDK refreshes
 * an expiring token itself; when the API still answers 401 (token revoked, clock skew, emulator
 * restarted) the request is retried once with a force-refreshed token, except for
 * `401 REAUTHENTICATION_REQUIRED`, which asks the user to sign in again.
 */
export function createAuthMiddleware(
  tokenSource: (forceRefresh: boolean) => Promise<string | null> = getIdToken
): Middleware {
  const pending = new Map<string, { retry: Request; token: string }>();
  return {
    async onRequest({ request, id }) {
      if (isPublicApiUrl(request.url) || request.headers.has(AUTHORIZATION)) {
        return undefined;
      }
      const token = await tokenSource(false);
      if (!token) {
        return undefined;
      }
      request.headers.set(AUTHORIZATION, `Bearer ${token}`);
      pending.set(id, { retry: request.clone(), token });
      return request;
    },
    async onResponse({ response, id, options }) {
      const entry = pending.get(id);
      pending.delete(id);
      if (!entry || response.status !== 401) {
        return undefined;
      }
      const body = (await readBody(response.clone())) as { errorCode?: string } | null;
      if (body?.errorCode === REAUTHENTICATION_REQUIRED_CODE) {
        return undefined;
      }
      const fresh = await tokenSource(true);
      if (!fresh || fresh === entry.token) {
        return undefined;
      }
      entry.retry.headers.set(AUTHORIZATION, `Bearer ${fresh}`);
      return options.fetch(entry.retry);
    },
    onError({ id }) {
      pending.delete(id);
      return undefined;
    },
  };
}

/**
 * Turns every non-2xx response and every transport failure into an `ApiError`, and records the
 * account-state answers (428 consent required, 403 suspended / deletion pending) in the account
 * signal store.
 */
export const errorMiddleware: Middleware = {
  async onResponse({ request, response }) {
    if (response.ok) {
      return response;
    }
    const body = await readBody(response.clone());
    const error = ApiError.fromProblem(
      response.status,
      body,
      request.headers.get(REQUEST_ID_HEADER)
    );
    reportAccountSignal(error, request.url);
    throw error;
  },
  async onError({ request, error }) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.network(error, request.headers.get(REQUEST_ID_HEADER));
  },
};

export interface CreateApiClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  tokenSource?: (forceRefresh: boolean) => Promise<string | null>;
}

export type ApiClient = SharedApiClient;

/** Resolved per call so test doubles installed on `globalThis.fetch` later still apply. */
const lazyGlobalFetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init);

/**
 * Builds a typed client (`packages/shared-types` + openapi-fetch): `X-Request-Id` from
 * `expo-crypto`, the session's ID token, RFC 9457 errors mapped to `ApiError`. Middleware order
 * matters: responses run through them in reverse, so the auth retry sees a 401 before the error
 * mapping throws it.
 */
export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const client = createSharedApiClient(options.baseUrl ?? API_BASE_URL, undefined, {
    fetch: options.fetch ?? lazyGlobalFetch,
    headers: { Accept: 'application/json, application/problem+json' },
    requestId: newRequestId,
  });
  client.use(errorMiddleware);
  client.use(createAuthMiddleware(options.tokenSource));
  return client;
}

/** The app-wide client. */
export const api: ApiClient = createApiClient();

/** Resolves an API-relative path (e.g. `/api/v1/public/media/...`) against the API origin. */
export function absoluteApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${API_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/** The data of a successful call; `openapi-fetch` leaves it undefined only for empty bodies. */
export function required<T>(data: T | undefined): T {
  if (data === undefined) {
    throw ApiError.emptyResponse();
  }
  return data;
}
