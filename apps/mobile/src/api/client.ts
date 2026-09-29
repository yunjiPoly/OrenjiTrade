import type { paths } from '@orenji/shared-types';
import * as Crypto from 'expo-crypto';
import createClient, { type Middleware } from 'openapi-fetch';

import { getIdToken } from '@/src/auth/tokenProvider';

import { ApiError } from './ApiError';

export const REQUEST_ID_HEADER = 'X-Request-Id';
export const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export function resolveApiBaseUrl(raw: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL): string {
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

/** Adds `Authorization` (when signed in) and `X-Request-Id`, and turns failures into `ApiError`. */
export const apiMiddleware: Middleware = {
  async onRequest({ request }) {
    if (!request.headers.has(REQUEST_ID_HEADER)) {
      request.headers.set(REQUEST_ID_HEADER, newRequestId());
    }
    if (!request.headers.has('Accept')) {
      request.headers.set('Accept', 'application/json, application/problem+json');
    }
    const token = await getIdToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
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

/** Builds a typed client. The default export below is the app-wide singleton. */
export function createApiClient(options: CreateApiClientOptions = {}) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? API_BASE_URL,
    fetch: options.fetch,
  });
  client.use(apiMiddleware);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api: ApiClient = createApiClient();
