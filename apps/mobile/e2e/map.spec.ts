import type { Locator, Page } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  SEED_PASSWORD,
  openInApp,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/**
 * Mobile Phase 4 (map discovery) against the real, isolated stack and its seed collectors
 * (fictional, at public neighbourhood centroids; collector1 in the Plateau, collector2 in Verdun,
 * collector5 in Mile End, ...): the Map tab draws discoverable neighbours as zones about 3 km wide
 * around their public points, never pins, and never passes zoom 14; the preview bottom sheet; the
 * collector profile with its approximate area; "Message"; and "Who has this near me" from a card.
 * The privacy fixture fails any test whose API answers carry a coordinate with more than 3
 * decimals or a private location field.
 */

/** Metres per CSS pixel of Web Mercator at a latitude and zoom. */
const metresPerPixel = (lat: number, zoom: number) =>
  (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** The Leaflet zoom of the map in `container`, read from its tiles. */
async function tileZoom(container: Locator): Promise<number> {
  return container.evaluate((element) => {
    const tile = element.querySelector<HTMLImageElement>('.leaflet-tile-loaded, .leaflet-tile');
    return tile ? Number(new URL(tile.src).pathname.split('/')[1]) : -1;
  });
}

async function clickCentre(page: Page, container: Locator) {
  const box = await container.boundingBox();
  if (!box) {
    throw new Error('The map has no box.');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('mobile map discovery', () => {
  requireStack();

  test('a seed collector sees neighbours as 3 km zones, opens a preview, then a profile', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const tileZooms: number[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname === 'tile.openstreetmap.org') {
        tileZooms.push(Number(url.pathname.split('/')[1]));
      }
    });
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-status')).toHaveText(/^\d+ collectors within 10 km$/, {
      timeout: 30_000,
    });
    const count = Number((await map.getByTestId('map-status').textContent())?.split(' ')[0]);
    expect(count).toBeGreaterThanOrEqual(3);
    await expect(map.getByTestId('map-approximate-note')).toContainText(
      'Locations are approximate (about 3 km) to protect privacy'
    );

    // Every collector is a zone; no marker or pin sits on anyone's point.
    const canvas = map.getByTestId('collector-map');
    await expect(canvas.locator('path.orenji-zone')).toHaveCount(count, { timeout: 30_000 });
    await expect(canvas.locator('.leaflet-marker-icon')).toHaveCount(0);

    // The zoom stops at 14 whatever the "+" button and the wheel ask for.
    const zoomIn = canvas.locator('.leaflet-control-zoom-in');
    for (let i = 0; i < 8 && !(await zoomIn.getAttribute('class'))?.includes('disabled'); i++) {
      await zoomIn.click();
      await page.waitForTimeout(300);
    }
    // Disabled at the cap; a forced press changes nothing.
    await expect(zoomIn).toHaveClass(/leaflet-disabled/);
    await expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
    await zoomIn.click({ force: true });
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, -500);
        await page.waitForTimeout(100);
      }
    }
    await expect.poll(() => tileZoom(canvas)).toBe(14);
    expect(Math.max(...tileZooms)).toBeLessThanOrEqual(14);
    // At 14 a zone measures 2 x 1500 m on screen (about 450 px at 45.5° N).
    const zoneBox = await canvas.locator('path.orenji-zone').first().boundingBox();
    const expected = (2 * 1500) / metresPerPixel(45.52, 14);
    expect(zoneBox?.height).toBeGreaterThan(expected * 0.9);
    expect(zoneBox?.height).toBeLessThan(expected * 1.1);

    // The list: Sofia (Mile End) with a distance bucket, then her preview.
    await map.getByRole('button', { name: 'List' }).click();
    const row = map.getByTestId('collector-row-collector5');
    await expect(row).toContainText('Sofia Nguyen');
    await expect(row).toContainText(/km away/);
    await row.click();
    const sheet = page.getByTestId('collector-preview');
    await expect(sheet.getByTestId('preview-name')).toHaveText('Sofia Nguyen', { timeout: 30_000 });
    await expect(sheet.getByTestId('preview-approximate')).toContainText(
      'Locations are approximate (about 3 km)'
    );
    await expect(sheet.getByTestId('preview-distance')).toHaveText(/km away$/);

    // "Show on map" brings her zone into view (at most at 14); a tap in it opens her preview.
    await sheet.getByTestId('preview-show-on-map').click();
    await expect(sheet).toBeHidden();
    await expect(map.getByTestId('collector-map')).toBeVisible();
    await expect.poll(() => tileZoom(map.getByTestId('collector-map'))).toBeLessThanOrEqual(14);
    await page.waitForTimeout(800);
    await clickCentre(page, map.getByTestId('collector-map'));
    await expect(page.getByTestId('collector-preview').getByTestId('preview-name')).toHaveText(
      'Sofia Nguyen',
      { timeout: 30_000 }
    );

    // Her profile: the same approximate area, ratings and binders.
    await page.getByTestId('collector-preview').getByTestId('preview-view-profile').click();
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText('Sofia Nguyen', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-location')).toHaveText(/^Near /);
    await expect(profile.getByTestId('collector-area-note')).toContainText(
      'Approximate area (about 3 km)'
    );
    const area = profile.getByTestId('collector-area');
    await expect(area.locator('path.orenji-zone')).toHaveCount(1, { timeout: 30_000 });
    await expect(area.locator('.leaflet-marker-icon')).toHaveCount(0);
    expect(await tileZoom(area)).toBeLessThanOrEqual(14);
    await expect(profile.getByTestId('collector-ratings')).toBeVisible();
    await expect(profile.getByTestId('collector-binders')).toBeVisible();
  });

  test('"Message" in a preview opens the conversation and sends a message', async ({ page }) => {
    test.setTimeout(150_000);
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-status')).toHaveText(/collectors within/, {
      timeout: 30_000,
    });
    await map.getByRole('button', { name: 'List' }).click();
    await map.getByTestId('collector-row-collector2').click();
    const sheet = page.getByTestId('collector-preview');
    await expect(sheet.getByTestId('preview-name')).toHaveText('Devon Okafor', { timeout: 30_000 });
    await sheet.getByRole('button', { name: 'Message' }).click();

    const thread = screen(page, 'conversation');
    await expect(thread.getByTestId('conversation-profile')).toContainText('Devon Okafor', {
      timeout: 30_000,
    });
    await expect(thread.getByTestId('conversation-messages')).toBeVisible();
    const text = `Hello from the mobile map E2E ${Date.now().toString(36)}`;
    await thread.getByLabel('Message').fill(text);
    await thread.getByRole('button', { name: 'Send' }).click();
    await expect(thread.getByText(text)).toBeVisible({ timeout: 30_000 });
  });

  test('"Who has this near me" from a card filters the map by that card', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    // A card collector1 lists publicly (seed inventory).
    const listed = await request.get(`${API_URL}/api/v1/collectors/collector1/inventory?size=1`);
    expect(listed.ok(), 'collector1 public inventory').toBeTruthy();
    const item = ((await listed.json()) as { items: { card: { id: string; name: string } }[] })
      .items[0];
    expect(item, 'a public card of collector1').toBeTruthy();

    await signInThroughUi(page, 'collector2@orenjitrade.test', SEED_PASSWORD);
    await expect(screen(page, 'map').getByTestId('map-status')).toHaveText(/collectors within/, {
      timeout: 30_000,
    });
    await openInApp(page, `/cards/${item!.card.id}`);
    const card = screen(page, 'card');
    await expect(card.getByTestId('card-name')).toHaveText(item!.card.name, { timeout: 30_000 });
    await card.getByRole('button', { name: 'Who has this near me' }).click();

    const map = screen(page, 'map');
    await expect(map.getByTestId('map-holders')).toContainText(
      `Who has ${item!.card.name} near you`,
      { timeout: 30_000 }
    );
    await expect(map.getByTestId('map-status')).toHaveText(
      /^\d+ collectors? with this card within 10 km$/,
      { timeout: 30_000 }
    );
    await map.getByRole('button', { name: 'List' }).click();
    await expect(map.getByTestId('collector-row-collector1-listings')).toContainText(
      /listings? of this card/
    );
    await map.getByTestId('collector-row-collector1').click();
    const sheet = page.getByTestId('collector-preview');
    await expect(sheet.getByTestId('preview-matching-items')).toBeVisible({ timeout: 30_000 });
    for (const src of await sheet
      .locator('img')
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src))) {
      expect(src.startsWith(`${API_URL}/api/v1/public/`), src).toBe(true);
    }
    // The backdrop above the sheet closes it.
    await sheet.getByTestId('collector-preview-backdrop').click({ position: { x: 20, y: 20 } });
    await expect(sheet).toBeHidden();

    // Every collector again.
    await map.getByTestId('map-holders-clear').click();
    await expect(map.getByTestId('map-holders')).toBeHidden();
    await expect(map.getByTestId('map-status')).toHaveText(/^\d+ collectors within 10 km$/, {
      timeout: 30_000,
    });
  });
});
