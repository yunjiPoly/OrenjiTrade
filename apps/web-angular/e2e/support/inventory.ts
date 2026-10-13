import { APIRequestContext, Page, Response, expect } from '@playwright/test';
import { API_URL, authHeader, coordinates } from './stack';

/**
 * Inventory helpers for specs that prepare state through the real API (Phase 3 contract):
 * printings from the fictional seed catalog, items, binders and privacy settings.
 */

/** Printing id of a seed catalog printing code (`AZR-EN001`), via `GET /cards/suggest`. */
export async function printingIdOf(
  api: APIRequestContext,
  token: string,
  code: string,
): Promise<string> {
  const response = await api.get(`${API_URL}/api/v1/cards/suggest`, {
    headers: authHeader(token),
    params: { q: code, limit: 10 },
  });
  expect(response.ok(), `suggest ${code}`).toBeTruthy();
  const suggestions = (await response.json()) as {
    kind: string;
    printingId?: string;
    printingCode?: string;
  }[];
  const match = suggestions.find(
    (suggestion) => suggestion.kind === 'PRINTING' && suggestion.printingCode === code,
  );
  expect(match?.printingId, `printing ${code} in the seed catalog`).toBeTruthy();
  return match!.printingId!;
}

export interface CreatedItem {
  id: string;
  card: { name: string };
}

export async function apiCreateItem(
  api: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<CreatedItem> {
  const response = await api.post(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(token),
    data: body,
  });
  expect(response.status(), 'POST /inventory/items').toBe(201);
  return response.json();
}

export async function apiCreateBinder(
  api: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  const response = await api.post(`${API_URL}/api/v1/binders`, {
    headers: authHeader(token),
    data: body,
  });
  expect(response.ok(), `POST /binders ${String(body['name'])}`).toBeTruthy();
  return response.json();
}

export async function apiPublishBinder(
  api: APIRequestContext,
  token: string,
  binderId: string,
  mode: 'PUBLIC' | 'ONE_HOUR' | 'ONE_DAY' | 'UNTIL_DISABLED',
): Promise<void> {
  const response = await api.post(`${API_URL}/api/v1/binders/${binderId}/publish`, {
    headers: authHeader(token),
    data: { mode },
  });
  expect(response.ok(), `publish binder ${binderId}`).toBeTruthy();
}

/** Merges `changes` into the collector's privacy settings. */
export async function apiUpdatePrivacy(
  api: APIRequestContext,
  token: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const current = await api.get(`${API_URL}/api/v1/me/settings/privacy`, {
    headers: authHeader(token),
  });
  expect(current.ok(), 'GET privacy settings').toBeTruthy();
  const response = await api.put(`${API_URL}/api/v1/me/settings/privacy`, {
    headers: authHeader(token),
    data: { ...((await current.json()) as Record<string, unknown>), ...changes },
  });
  expect(response.ok(), 'PUT privacy settings').toBeTruthy();
}

export interface CoordinateSample {
  url: string;
  path: string;
  value: number;
}

/**
 * Records every `lat`/`lng` of every JSON response the page receives (ADR 0017: the API never
 * returns a coordinate, so a spec expects none). Call `settle()` before asserting.
 */
export function watchCoordinates(page: Page): {
  samples: CoordinateSample[];
  settle: () => Promise<void>;
} {
  const samples: CoordinateSample[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (response: Response) => {
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('json')) {
      return;
    }
    pending.push(
      response
        .json()
        .then((body: unknown) => {
          for (const sample of coordinates(body)) {
            samples.push({ url: response.url(), ...sample });
          }
        })
        .catch(() => undefined),
    );
  });
  // A response whose body never arrives (request aborted by a navigation) must not hang the spec.
  const bounded = (promise: Promise<void>) =>
    Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
  return { samples, settle: async () => void (await Promise.all(pending.map(bounded))) };
}

/** Every recorded coordinate: since ADR 0017 any `lat`/`lng` in an answer is a leak. */
export function coordinateLeaks(samples: readonly CoordinateSample[]): CoordinateSample[] {
  return [...samples];
}
