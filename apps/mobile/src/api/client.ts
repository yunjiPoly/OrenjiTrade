import {
  REQUEST_ID_HEADER,
  createApiClient as createSharedApiClient,
  type ApiClient as SharedApiClient,
} from '@orenji/shared-types';
import * as Crypto from 'expo-crypto';
import type { Middleware } from 'openapi-fetch';

import { getIdToken } from '@/src/auth/tokenProvider';

import { ApiError } from './ApiError';

export { REQUEST_ID_HEADER };
export const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export function resolveApiBaseUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL
): string {
  const trimmed = raw?.trim();
  return (trimmed ? trimmed : DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl();

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

/**
 * Turns every non-2xx response and every transport failure into an `ApiError`.
 * `Authorization` and `X-Request-Id` are added by the shared client factory
 * (`createApiClient` in `@orenji/shared-types`).
 */
export const apiMiddleware: Middleware = {
  async onResponse({ request, response }) {
    if (response.ok) {
      return response;
    }
    const body = await readBody(response.clone());
    throw ApiError.fromProblem(response.status, body, request.headers.get(REQUEST_ID_HEADER));
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
}

export type ApiClient = SharedApiClient;

/**
 * Builds a typed client on top of the shared factory: bearer token from the session
 * (`tokenProvider`), `X-Request-Id` from `expo-crypto`, RFC 9457 errors mapped to `ApiError`.
 * The default export below is the app-wide singleton.
 */
export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const client = createSharedApiClient(options.baseUrl ?? API_BASE_URL, getIdToken, {
    fetch: options.fetch,
    headers: { Accept: 'application/json, application/problem+json' },
    requestId: newRequestId,
  });
  client.use(apiMiddleware);
  return client;
}

export const api: ApiClient = createApiClient();
