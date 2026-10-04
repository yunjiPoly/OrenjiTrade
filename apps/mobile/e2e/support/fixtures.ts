import { expect, test as base, type Page } from '@playwright/test';

import { DEV_API_PORT } from './isolation';
import { API_URL } from './stack';

/** Recursively yields every numeric `lat`/`lng` value in a JSON document. */
export function* coordinates(
  value: unknown,
  path = '$'
): Generator<{ path: string; value: number }> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* coordinates(value[i], `${path}[${i}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (/^(lat|lng|latitude|longitude)$/i.test(key) && typeof child === 'number') {
        yield { path: childPath, value: child };
      } else {
        yield* coordinates(child, childPath);
      }
    }
  }
}

/** Number of decimals of a JSON number as serialised. */
export function decimalsOf(value: number): number {
  const text = String(value);
  if (text.includes('e')) {
    return Number.POSITIVE_INFINITY;
  }
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;
}

/** Keys that must never reach a client (ADR 0004). */
const FORBIDDEN_KEYS = /^(homePoint|home_point|exactLocation|distanceMeters|distance_m)$/i;

function* forbiddenKeys(value: unknown, path = '$'): Generator<string> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* forbiddenKeys(value[i], `${path}[${i}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(key)) {
        yield `${path}.${key}`;
      }
      yield* forbiddenKeys(child, `${path}.${key}`);
    }
  }
}

export interface PrivacyFinding {
  url: string;
  path: string;
  detail: string;
}

/**
 * Scans every JSON answer the app receives from the API for precise coordinates (more than 3
 * decimals) and for fields that must never leave the server. Attached to every test: a finding
 * fails the test (privacy overrides everything, CLAUDE.md).
 */
export class PrivacyScanner {
  readonly findings: PrivacyFinding[] = [];
  responses = 0;

  scan(url: string, body: unknown): void {
    this.responses++;
    for (const { path, value } of coordinates(body)) {
      if (decimalsOf(value) > 3) {
        this.findings.push({ url, path, detail: `${value} has more than 3 decimals` });
      }
    }
    for (const path of forbiddenKeys(body)) {
      this.findings.push({ url, path, detail: 'forbidden field' });
    }
  }

  watch(page: Page): void {
    // The app must only ever talk to the isolated API: a request to the developer API (:8080)
    // would write into the developer's database.
    page.on('request', (request) => {
      const url = new URL(request.url());
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

export const test = base.extend<{ privacy: PrivacyScanner }>({
  privacy: [
    async ({ page }, use) => {
      const scanner = new PrivacyScanner();
      scanner.watch(page);
      await use(scanner);
      expect(scanner.findings, 'precise coordinates or private fields in API answers').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
