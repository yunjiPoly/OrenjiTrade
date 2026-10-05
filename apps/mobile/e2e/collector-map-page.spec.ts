import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import {
  collectorMapPageHtml,
  type CollectorMapPageOptions,
  type PageLayer,
} from '../src/components/map/leaflet/collectorMapPage';
import {
  LEAFLET_CSS,
  LEAFLET_JS,
  PAGE_BASE_URL,
} from '../src/components/map/leaflet/leafletShared';

import { expect, test } from './support/fixtures';

/**
 * The collector map page the Android app loads in a WebView where Google Maps cannot draw (Expo
 * Go, no project key), run in Chromium like Android's WebView: Leaflet from the npm bytes (the
 * pinned CDN URL is served locally, so its integrity hash must match), map tiles stubbed by the
 * fixtures, and `window.ReactNativeWebView` recording what the page sends to the app. No API or
 * app is needed. Privacy rules (ADR 0004, owner rule 2026-10-04): collectors are 1500 m circles,
 * never markers, and nothing passes zoom 14.
 */

type PageMessage = { type: string; lat?: number; lng?: number; zoom?: number; id?: string };

const LEAFLET_DIR = path.dirname(require.resolve('leaflet/package.json'));
const MONTREAL = { lat: 45.5, lng: -73.57 };
const LAYER: PageLayer = {
  zones: [
    { id: 'collector5', lat: 45.524, lng: -73.601, radius: 1500, selected: false, self: false },
    { id: 'collector1', lat: 45.522, lng: -73.581, radius: 1500, selected: true, self: true },
  ],
  clusters: [
    {
      id: 'cluster:9:1:2',
      lat: 45.46,
      lng: -73.52,
      count: 12,
      label: '12 collectors here. Zoom in',
    },
  ],
};

async function openPage(page: Page, options: Partial<CollectorMapPageOptions> = {}) {
  for (const [asset, file, type] of [
    [LEAFLET_JS, 'leaflet.js', 'application/javascript'],
    [LEAFLET_CSS, 'leaflet.css', 'text/css'],
  ] as const) {
    await page.route(asset.url, (route) =>
      route.fulfill({
        status: 200,
        contentType: type,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: fs.readFileSync(path.join(LEAFLET_DIR, 'dist', file)),
      })
    );
  }
  const html = collectorMapPageHtml({
    start: { center: MONTREAL, zoom: 12 },
    colors: {
      zone: '#F4761A',
      selected: '#4A1F00',
      self: '#0F766E',
      cluster: '#F4761A',
      clusterText: '#FFFFFF',
      background: '#F5EFE8',
    },
    label: 'Map of collectors near you.',
    ...options,
  });
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    Object.assign(window, {
      __messages: messages,
      ReactNativeWebView: { postMessage: (data: string) => messages.push(JSON.parse(data)) },
    });
  });
  await page.route(PAGE_BASE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html })
  );
  await page.goto(PAGE_BASE_URL);
  await expect.poll(() => messages(page)).toContainEqual({ type: 'ready' });
}

const messages = (page: Page) =>
  page.evaluate(() => (window as unknown as { __messages: PageMessage[] }).__messages);
const lastViewport = async (page: Page) =>
  (await messages(page)).filter((message) => message.type === 'viewport').at(-1);
const call = (page: Page, fn: 'layer' | 'view', arg: unknown) =>
  page.evaluate(
    ([name, value]) =>
      (window as unknown as { __orenji: Record<string, (v: unknown) => void> }).__orenji[
        name as string
      ]?.(value),
    [fn, arg] as const
  );

/** Metres per CSS pixel of Web Mercator at a latitude and zoom. */
const metresPerPixel = (lat: number, zoom: number) =>
  (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

test.describe('collector map WebView page (Android map fallback)', () => {
  test('draws collectors as 1500 m zones (never markers) and count bubbles', async ({ page }) => {
    await openPage(page);
    await call(page, 'layer', LAYER);
    const zones = page.locator('path.orenji-zone');
    await expect(zones).toHaveCount(2);
    await expect(page.locator('path.orenji-zone--selected')).toHaveCount(1);
    // The only marker icons are count bubbles; no collector gets a pin.
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
    await expect(page.locator('.leaflet-marker-icon.orenji-cluster')).toHaveText('12');

    // At zoom 14 a zone measures 2 x 1500 m on screen (about 450 px at 45.5° N).
    await call(page, 'view', { kind: 'center', center: { lat: 45.522, lng: -73.581 }, zoom: 14 });
    await expect.poll(async () => (await lastViewport(page))?.zoom).toBe(14);
    const box = await page.locator('path.orenji-zone--selected').boundingBox();
    const expected = (2 * 1500) / metresPerPixel(45.522, 14);
    expect(box?.width).toBeGreaterThan(expected * 0.95);
    expect(box?.width).toBeLessThan(expected * 1.05);
  });

  test('never passes zoom 14: requests, the + button, the wheel; no tile beyond 14', async ({
    page,
  }) => {
    const tileZooms: number[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname === 'tile.openstreetmap.org') {
        tileZooms.push(Number(url.pathname.split('/')[1]));
      }
    });
    await openPage(page);
    await call(page, 'layer', LAYER);
    await call(page, 'view', { kind: 'center', center: { lat: 45.522, lng: -73.581 }, zoom: 19 });
    await expect.poll(async () => (await lastViewport(page))?.zoom).toBe(14);
    // Bounds of one point fit at 14 at most.
    await call(page, 'view', {
      kind: 'bounds',
      bounds: { north: 45.523, south: 45.522, east: -73.58, west: -73.581 },
    });
    await page.waitForTimeout(400);
    expect((await lastViewport(page))?.zoom).toBeLessThanOrEqual(14);
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    await expect(zoomIn).toHaveClass(/leaflet-disabled/);
    await zoomIn.click({ force: true });
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) {
      throw new Error('The map has no box.');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(80);
    }
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    expect((await lastViewport(page))?.zoom).toBeLessThanOrEqual(14);
    expect(tileZooms.length).toBeGreaterThan(0);
    expect(Math.max(...tileZooms)).toBeLessThanOrEqual(14);
  });

  test('reports taps (the app finds the zone) and cluster presses', async ({ page }) => {
    await openPage(page);
    await call(page, 'layer', LAYER);
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) {
      throw new Error('The map has no box.');
    }
    await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
    await expect
      .poll(async () => (await messages(page)).filter((message) => message.type === 'tap'))
      .toHaveLength(1);
    const [tap] = (await messages(page)).filter((message) => message.type === 'tap');
    expect(tap?.zoom).toBe(12);
    await page.locator('.orenji-cluster').click();
    await expect
      .poll(async () => (await messages(page)).filter((message) => message.type === 'cluster'))
      .toEqual([{ type: 'cluster', id: 'cluster:9:1:2' }]);
  });

  test('a map that only shows (a profile) has no gestures, buttons or taps', async ({ page }) => {
    await openPage(page, { interactive: false, start: { center: MONTREAL, zoom: 13 } });
    await call(page, 'layer', { zones: [LAYER.zones[1]], clusters: [] });
    await expect(page.locator('path.orenji-zone')).toHaveCount(1);
    await expect(page.locator('.leaflet-control-zoom-in')).toHaveCount(0);
    const box = await page.locator('#map').boundingBox();
    if (!box) {
      throw new Error('The map has no box.');
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    expect((await messages(page)).filter((message) => message.type === 'tap')).toEqual([]);
  });

  test('reports an error when Leaflet cannot load', async ({ page }) => {
    await page.route(LEAFLET_JS.url, (route) => route.abort());
    await page.addInitScript(() => {
      const messages: unknown[] = [];
      Object.assign(window, {
        __messages: messages,
        ReactNativeWebView: { postMessage: (data: string) => messages.push(JSON.parse(data)) },
      });
    });
    const html = collectorMapPageHtml({
      start: { center: MONTREAL, zoom: 12 },
      colors: {
        zone: '#F4761A',
        selected: '#4A1F00',
        self: '#0F766E',
        cluster: '#F4761A',
        clusterText: '#FFFFFF',
        background: '#F5EFE8',
      },
      label: 'Map',
    });
    await page.route(PAGE_BASE_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: html })
    );
    await page.goto(PAGE_BASE_URL);
    await expect.poll(() => messages(page)).toContainEqual({ type: 'error', reason: 'leaflet' });
  });
});
