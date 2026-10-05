import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import {
  LEAFLET_CSS,
  LEAFLET_JS,
  PAGE_BASE_URL,
} from '../src/components/map/leaflet/leafletShared';
import { tradingAreaPageHtml } from '../src/components/map/leaflet/tradingAreaPage';

import { expect, test } from './support/fixtures';

/**
 * The page the Android app loads in a WebView when Google Maps cannot draw (Expo Go, no project
 * key; ADR 0010 amendment 2026-10-05), run in Chromium like Android's WebView: Leaflet comes from
 * the npm package bytes (the pinned CDN URL is served locally, so its integrity hash must match),
 * map tiles are stubbed, and `window.ReactNativeWebView` records what the page sends to the app.
 * No API or app is needed.
 */

type PageMessage = { type: string; lat?: number; lng?: number; reason?: string };

const LEAFLET_DIR = path.dirname(require.resolve('leaflet/package.json'));
const QUEBEC = { lat: 46.813, lng: -71.208, radiusKm: 15 };

/**
 * Loads the page like the WebView does (`source={{ html, baseUrl }}`): a navigation to the base URL
 * answered locally, with the app bridge defined before the page's scripts run.
 */
async function load(page: Page, html: string) {
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
}

async function openPage(page: Page, options: { zeroSizeFirst?: boolean } = {}) {
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
  let html = tradingAreaPageHtml({
    focus: QUEBEC,
    color: '#E8590C',
    background: '#F4EFEA',
    label: 'Trading area map',
    pinTitle: 'Centre of your trading area (drag to move)',
  });
  if (options.zeroSizeFirst) {
    // Like a WebView measured while its screen is still being pushed.
    html = html.replace('</head>', '<style id="zero">#map{height:0 !important}</style></head>');
  }
  await load(page, html);
  await expect.poll(() => messages(page)).toContainEqual({ type: 'ready' });
}

const messages = (page: Page) =>
  page.evaluate(() => (window as unknown as { __messages: PageMessage[] }).__messages);
const tileZoom = (page: Page) =>
  page.evaluate(() => {
    const tile = document.querySelector<HTMLImageElement>('.leaflet-tile');
    return tile ? Number(new URL(tile.src).pathname.split('/')[1]) : -1;
  });

test.describe('Leaflet WebView page (Android map fallback)', () => {
  test('starts on the area, reports taps and drags, draws what the app applies', async ({
    page,
  }) => {
    await openPage(page);
    expect(await tileZoom(page)).toBeGreaterThanOrEqual(9);

    // A tap reports the raw point (the app rounds it).
    const map = page.locator('#map');
    const box = await map.boundingBox();
    if (!box) {
      throw new Error('The map has no box.');
    }
    await page.mouse.click(box.x + box.width / 4, box.y + box.height / 4);
    await expect
      .poll(async () => (await messages(page)).filter((m) => m.type === 'pick'))
      .toHaveLength(1);
    const [tap] = (await messages(page)).filter((m) => m.type === 'pick');
    expect(tap?.lat).toBeGreaterThan(QUEBEC.lat);
    expect(tap?.lng).toBeLessThan(QUEBEC.lng);

    // The app draws the chosen centre: a pin and a circle.
    await page.evaluate(() =>
      (window as unknown as { __orenji: { apply: (next: unknown) => void } }).__orenji.apply({
        area: { lat: 46.813, lng: -71.208, radiusKm: 15 },
        disabled: false,
      })
    );
    const pin = page.locator('.leaflet-marker-icon');
    await expect(pin).toHaveCount(1);
    await expect(page.locator('path.leaflet-interactive, svg path')).not.toHaveCount(0);

    // Dragging the pin reports its new position.
    const pinBox = await pin.boundingBox();
    if (!pinBox) {
      throw new Error('The pin has no box.');
    }
    await page.mouse.move(pinBox.x + 16, pinBox.y + 12);
    await page.mouse.down();
    await page.mouse.move(pinBox.x + 40, pinBox.y + 30, { steps: 4 });
    await page.mouse.move(pinBox.x + 96, pinBox.y + 64, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await messages(page)).filter((m) => m.type === 'pick'))
      .toHaveLength(2);

    // While disabled, taps are not reported.
    await page.evaluate(() =>
      (window as unknown as { __orenji: { apply: (next: unknown) => void } }).__orenji.apply({
        area: null,
        disabled: true,
      })
    );
    await expect(pin).toHaveCount(0);
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.75);
    await page.waitForTimeout(300);
    expect((await messages(page)).filter((m) => m.type === 'pick')).toHaveLength(2);

    // A focus moves the camera and reports the settled viewport.
    await page.evaluate(() =>
      (window as unknown as { __orenji: { focus: (f: unknown) => void } }).__orenji.focus({
        lat: 45.502,
        lng: -73.567,
        radiusKm: 5,
      })
    );
    await expect
      .poll(async () => (await messages(page)).filter((m) => m.type === 'viewport').at(-1))
      .toMatchObject({ lat: expect.closeTo(45.502, 1), lng: expect.closeTo(-73.567, 1) });
  });

  test('a map laid out at 0 x 0 fits the area once it gets its size (never the whole world)', async ({
    page,
  }) => {
    await openPage(page, { zeroSizeFirst: true });
    await page.evaluate(() => document.getElementById('zero')?.remove());
    await expect.poll(() => tileZoom(page)).toBeGreaterThanOrEqual(9);
  });

  test('reports an error when Leaflet cannot load', async ({ page }) => {
    await page.route(LEAFLET_JS.url, (route) => route.abort());
    await load(
      page,
      tradingAreaPageHtml({
        focus: QUEBEC,
        color: '#E8590C',
        background: '#F4EFEA',
        label: 'Trading area map',
        pinTitle: 'Centre',
      })
    );
    await expect.poll(() => messages(page)).toContainEqual({ type: 'error', reason: 'leaflet' });
  });
});
