import { expect, test as base, type Page } from '@playwright/test';

import { DEV_API_PORT } from './isolation';
import { API_URL } from './stack';

/**
 * Keys that describe a position, a radius or a distance: none may reach a client since ADR 0017
 * (collectors declare a country, a state or province and an optional city).
 */
const COORDINATE_OR_DISTANCE_KEY =
  /^(lat|lng|lon|latitude|longitude|point|publicPoint|homePoint|home_point|exactLocation|tradingArea|trading_area|center|centre|radius|radiusKm|radius_km|distance|distanceBucket|distance_bucket|distanceMeters|distance_m|gridCell|grid_cell)$/i;

/** Recursively yields the path of every coordinate, radius or distance key in a JSON document. */
export function* coordinateKeys(value: unknown, path = '$'): Generator<string> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* coordinateKeys(value[i], `${path}[${i}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (COORDINATE_OR_DISTANCE_KEY.test(key)) {
        yield childPath;
      }
      yield* coordinateKeys(child, childPath);
    }
  }
}

/** Hosts of map providers and geocoders: the app talks to none of them (ADR 0017). */
const MAP_PROVIDER_HOST =
  /(^|\.)(openstreetmap\.org|maps\.googleapis\.com|maps\.gstatic\.com|mapbox\.com|arcgis\.com|arcgisonline\.com)$/i;

export interface PrivacyFinding {
  url: string;
  path: string;
  detail: string;
}

/**
 * Scans every JSON answer the app receives from the API for coordinate, radius and distance
 * fields, and every request for a map provider or the developer API. Attached to every test: a
 * finding fails the test (privacy overrides everything, CLAUDE.md).
 */
export class PrivacyScanner {
  readonly findings: PrivacyFinding[] = [];
  responses = 0;

  scan(url: string, body: unknown): void {
    this.responses++;
    for (const path of coordinateKeys(body)) {
      this.findings.push({ url, path, detail: 'coordinate, radius or distance field' });
    }
  }

  watch(page: Page): void {
    page.on('request', (request) => {
      const url = new URL(request.url());
      // The app must only ever talk to the isolated API: a request to the developer API (:8080)
      // would write into the developer's database.
      if (
        url.port === String(DEV_API_PORT) &&
        /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)
      ) {
        this.findings.push({
          url: request.url(),
          path: '-',
          detail: 'request to the developer API',
        });
      }
      if (MAP_PROVIDER_HOST.test(url.hostname)) {
        this.findings.push({ url: request.url(), path: '-', detail: 'request to a map provider' });
      }
    });
    page.on('response', (response) => {
      const url = response.url();
      if (
        !url.startsWith(API_URL) ||
        !(response.headers()['content-type'] ?? '').includes('json')
      ) {
        return;
      }
      response
        .json()
        .then((body: unknown) => this.scan(url, body))
        .catch(() => undefined);
    });
  }
}

export const test = base.extend<{ privacy: PrivacyScanner; mapProviders: void }>({
  // Map providers and tile servers are aborted (the app draws no map, ADR 0017; the privacy
  // scanner records any attempt). The route also keeps Playwright's request interception on, which
  // Chromium needs to expose the bodies the specs read with `postDataJSON()`.
  mapProviders: [
    async ({ page }, use) => {
      await page.route(
        (url) => MAP_PROVIDER_HOST.test(url.hostname),
        (route) => route.abort()
      );
      await use();
    },
    { auto: true },
  ],
  privacy: [
    async ({ page }, use) => {
      const scanner = new PrivacyScanner();
      scanner.watch(page);
      await use(scanner);
      expect(scanner.findings, 'coordinates, distances or map providers').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
