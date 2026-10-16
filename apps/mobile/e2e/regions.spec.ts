import type { Page } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  apiListCopy,
  apiPublicBinder,
  createOnboardedCollector,
  PLACES,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/** A word no seed or other spec uses, for names that must match exactly one collector. */
function word(): string {
  return `Rg${Math.random().toString(36).slice(2, 8)}`;
}

/** The region codes whose binder counts the page asked for. */
function watchCounts(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    const match = /\/api\/v1\/regions\/([^/]+)\/binder-counts/.exec(request.url());
    if (match?.[1]) {
      asked.push(match[1]);
    }
  });
  return asked;
}

/** Opens a link inside the running app (a tapped link, a notification). */
async function followLink(page: Page, link: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, link);
}

/** Where the device keeps the last region picked (`browsingRegion.ts`). */
const REGION_STORAGE_KEY = 'orenjitrade.browsing-region.v1';

/** The chunks of the region drawings the page downloaded, by region. */
function watchDrawings(page: Page): string[] {
  const loaded: string[] = [];
  page.on('request', (request) => {
    const match =
      /\/_expo\/static\/js\/web\/(americas-north|americas-south|europe)-[0-9a-f]+\.js/.exec(
        request.url()
      );
    if (match?.[1]) {
      loaded.push(match[1]);
    }
  });
  return loaded;
}

/**
 * Regions on the phone (stage M9, Search's map since stage R5, ADR 0017): the region pill over the
 * map, the region map drawn from the app's own files, the card of a state and its binders in
 * Search › Binders, against the real isolated stack. Counts depend on what other specs publish in
 * a region, so the specs look for their own collectors and binders. No map provider is ever asked
 * and no API answer carries a coordinate (the privacy fixture fails the test otherwise).
 */
test.describe('mobile regions and the region map', () => {
  requireStack();

  test("a state's card opens from the map; See binders lists them with the owner and never a city; a binder opens", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const token = word();
    // A Wyoming collector who shows their city on their own profile: it must stay there.
    const owner = await createOnboardedCollector(request, 'rgown', `${token} Owner`, {
      location: { ...PLACES.wyoming, city: 'Cheyenne', showCity: true },
      discoverable: true,
    });
    const binderName = `${token} trade binder`;
    const binderId = await apiPublicBinder(request, owner, binderName);
    await apiListCopy(
      request,
      owner,
      binderId,
      await printingIdOf(request, owner.idToken, 'PFT-002'),
      12
    );
    const viewer = await createOnboardedCollector(request, 'rgview', 'Mobile Mapper', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const drawings = watchDrawings(page);
    await signInThroughUi(page, viewer.email, viewer.password);

    // Search opens on the map of the home region, drawn from its own chunk only, on the
    // collector's province with its card.
    const search = screen(page, 'search');
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(search.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });
    await expect(search.getByTestId('search-state-name')).toHaveText('Quebec', {
      timeout: 30_000,
    });
    await expect(search.getByTestId('search-state-sub')).toHaveText('Canada · your province');
    expect(drawings).toEqual(['americas-north']);

    // The card closed and the whole region (zoom out), then Wyoming: the middle of its shape is
    // Wyoming (the card and the legend cover the bottom of the map).
    await search.getByRole('button', { name: 'Close' }).click();
    await expect(search.getByTestId('search-state-card')).toHaveCount(0);
    const frame = () => search.getByTestId('map-drawing').getAttribute('viewBox');
    const focused = await frame();
    await search.getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(frame).not.toBe(focused);
    const out = search.getByRole('button', { name: 'Zoom out' });
    if (await out.isEnabled()) {
      await out.click();
    }
    const wyoming = search.getByTestId('map-shape-US-WY');
    await expect(wyoming).toBeVisible({ timeout: 30_000 });
    const box = await wyoming.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(search.getByTestId('search-state-name')).toHaveText('Wyoming', {
      timeout: 30_000,
    });
    await expect(search.getByTestId('search-state-sub')).toHaveText('United States');
    await expect(search.getByTestId('search-state-stats-US-WY')).toHaveText(/^\d+ binders?$/);
    await expect(search.getByTestId('map-selected-US-WY')).toBeVisible();

    // See binders: Search › Binders on Wyoming, the owner's handle and the cards, never a city.
    await search.getByRole('button', { name: 'See binders' }).click();
    await expect(search.getByTestId('binders-state-chip')).toContainText('Wyoming', {
      timeout: 30_000,
    });
    const row = search.getByTestId(`binder-search-row-${binderId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(binderName);
    await expect(row).toContainText(`${owner.handle} · 1 card`);
    await expect(search).not.toContainText('Cheyenne');
    await expect(search).not.toContainText(/\bkm\b|away/);

    // The binder opens; back to the binders of Wyoming.
    await row.click();
    const binder = screen(page, 'binder');
    await expect(binder.getByText(binderName).first()).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(screen(page, 'search').getByTestId(`binder-search-row-${binderId}`)).toBeVisible({
      timeout: 30_000,
    });

    // The chip's × goes back to the whole region; "Pick on the map" back to the map, and "My
    // province" to the collector's own.
    await screen(page, 'search')
      .getByRole('button', { name: 'Showing Wyoming. Show the whole region' })
      .click();
    await screen(page, 'search').getByRole('link', { name: 'Pick on the map' }).click();
    const map = screen(page, 'search');
    await expect(map.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });
    await map.getByRole('button', { name: 'Show my province' }).click();
    await expect(map.getByTestId('search-state-name')).toHaveText('Quebec', { timeout: 30_000 });
    // Only the region on screen was ever downloaded.
    expect(drawings).toEqual(['americas-north']);
  });

  test("the region switcher re-scopes the map, the collectors while typing and Binders, and says when the region is not the collector's own", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const token = word();
    const abroad = await createOnboardedCollector(request, 'rgabr', `${token} Abroad`, {
      location: PLACES.brittany,
      discoverable: true,
    });
    const binderId = await apiPublicBinder(request, abroad, `${token} Breton binder`);
    await apiListCopy(
      request,
      abroad,
      binderId,
      await printingIdOf(request, abroad.idToken, 'PFT-002'),
      9
    );
    const viewer = await createOnboardedCollector(request, 'rgsw', 'Mobile Traveller', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const drawings = watchDrawings(page);
    await signInThroughUi(page, viewer.email, viewer.password);
    const search = screen(page, 'search');
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });

    // The switcher: a sheet with the three regions, the home one marked.
    await search.getByTestId('search-region').click();
    await expect(page.getByTestId('search-region-option-americas-north')).toContainText(
      'Your region'
    );
    await expect(page.getByRole('radio')).toHaveText([
      /Americas \(North\)/,
      /Americas \(South\)/,
      /Europe/,
    ]);
    await page.getByTestId('search-region-option-europe').click();
    // The map follows: Europe, its own drawing, Brittany shaded; not the collector's region.
    await expect(search.getByRole('button', { name: 'Region: Europe' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(search.getByTestId('map-shape-FR-BRE')).toBeVisible({ timeout: 30_000 });
    await expect(search.getByTestId('map-shape-CA-QC')).toHaveCount(0);
    await expect(search.getByTestId('search-region-away')).toContainText('Not your region');
    expect(drawings).toEqual(['americas-north', 'europe']);
    // Outside the collector's region: no province of theirs to show, no state card.
    await expect(search.getByRole('button', { name: 'Show my province' })).toHaveCount(0);
    await expect(search.getByTestId('search-state-card')).toHaveCount(0);

    // The collectors while typing are those of Europe.
    const asked = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/api/v1/search/collectors?') &&
        candidate.url().includes('region=europe')
    );
    await search.getByRole('search', { name: /Card name or code/ }).click();
    await search.getByLabel('Card name or code').fill(token);
    expect(new URL((await asked).url()).searchParams.get('q')).toBe(token);
    await expect(search.getByTestId(`search-collector-${abroad.handle}`)).toContainText(
      'Brittany',
      { timeout: 30_000 }
    );

    // Binders follows too: the whole of Europe, the Breton binder with its owner's state.
    await search.getByRole('tab', { name: 'Binders', exact: true }).click();
    await search.getByLabel('Deck, binder or collector').fill(token);
    await expect(search.getByTestId(`binder-search-row-${binderId}`)).toContainText(
      `${abroad.handle} · Brittany`,
      { timeout: 30_000 }
    );

    // One press goes home.
    await search.getByRole('tab', { name: 'Cards' }).click();
    await search.getByRole('button', { name: 'Back to Americas (North)' }).click();
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible();
    await expect(search.getByTestId('search-region-away')).toHaveCount(0);
  });

  test('a link opens Search on a region and one of its states; a new visit starts in the home region', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const token = word();
    const abroad = await createOnboardedCollector(request, 'rglnk', `${token} Linked`, {
      location: PLACES.montevideo,
      discoverable: true,
    });
    const binderId = await apiPublicBinder(request, abroad, `${token} Uruguayan binder`);
    await apiListCopy(
      request,
      abroad,
      binderId,
      await printingIdOf(request, abroad.idToken, 'PFT-002'),
      7
    );
    const viewer = await createOnboardedCollector(request, 'rglv', 'Mobile Linker', {
      location: PLACES.quebec,
      discoverable: true,
    });
    await signInThroughUi(page, viewer.email, viewer.password);
    const search = screen(page, 'search');
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });

    // The old Map tab's link inside the running app (a tapped link, a notification).
    await followLink(page, '/?region=americas-south&subdivision=uy-mo');
    await expect(search.getByRole('button', { name: 'Region: Americas (South)' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(search.getByTestId('search-state-name')).toHaveText('Montevideo', {
      timeout: 30_000,
    });
    await expect(search.getByTestId('search-state-sub')).toHaveText('Uruguay');
    // The link is used up: the address no longer carries it.
    await expect(page).not.toHaveURL(/region=/);
    await search.getByRole('button', { name: 'See binders' }).click();
    await expect(search.getByTestId(`binder-search-row-${binderId}`)).toBeVisible({
      timeout: 30_000,
    });

    // As a full page load (a link opened from outside the app): the region alone.
    await page.goto('/?region=europe');
    await expect(
      screen(page, 'search').getByRole('button', { name: 'Region: Europe' })
    ).toBeVisible({ timeout: 30_000 });
    await expect(screen(page, 'search').getByTestId('map-drawing')).toBeVisible({
      timeout: 30_000,
    });

    // A new visit without a link starts in the collector's own region again.
    await page.goto('/');
    await expect(
      screen(page, 'search').getByRole('button', { name: 'Region: Americas (North)' })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('a link works every time it is opened; a region that does not exist is neither browsed nor kept', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    // A collector without a location: no home region, so the device's last pick is where the app
    // starts, and a wrong one kept there would be where it starts every time.
    const viewer = await createOnboardedCollector(request, 'rgnew', 'Mobile Placeless Linker');
    const counts = watchCounts(page);
    await signInThroughUi(page, viewer.email, viewer.password);
    const search = screen(page, 'search');
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });
    // Without a declared province: no "My province" and no state card.
    await expect(search.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });
    await expect(search.getByRole('button', { name: 'Show my province' })).toHaveCount(0);
    await expect(search.getByTestId('search-state-card')).toHaveCount(0);

    // The same link, twice in one visit: it opens its state both times.
    const link = '/?region=americas-south&subdivision=UY-MO';
    await followLink(page, link);
    await expect(search.getByTestId('search-state-name')).toHaveText('Montevideo', {
      timeout: 30_000,
    });
    await search.getByRole('button', { name: 'Close' }).click();
    await expect(search.getByTestId('search-state-card')).toHaveCount(0);
    await search.getByTestId('search-region').click();
    await page.getByTestId('search-region-option-americas-north').click();
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible();
    await followLink(page, link);
    await expect(search.getByTestId('search-state-name')).toHaveText('Montevideo', {
      timeout: 30_000,
    });
    await expect(search.getByRole('button', { name: 'Region: Americas (South)' })).toBeVisible();

    // A link to a region that does not exist changes nothing: the region on screen stays, nothing
    // is asked for "asia" and the device does not keep it.
    await followLink(page, '/?region=asia');
    await expect(page).not.toHaveURL(/region=/);
    await expect(search.getByRole('button', { name: 'Region: Americas (South)' })).toBeVisible();
    await expect(search.getByTestId('search-map-counts-error')).toHaveCount(0);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), REGION_STORAGE_KEY)).toBe(
      'americas-south'
    );

    // A code an older install left on the device: the server's list is the judge. The app starts
    // in Americas (North) and the code is removed from the device.
    await page.evaluate((key) => window.localStorage.setItem(key, 'oceania'), REGION_STORAGE_KEY);
    await page.goto('/');
    await expect(
      screen(page, 'search').getByRole('button', { name: 'Region: Americas (North)' })
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), REGION_STORAGE_KEY))
      .toBeNull();
    expect(counts.filter((code) => code === 'asia' || code === 'oceania')).toEqual([]);
  });
});
