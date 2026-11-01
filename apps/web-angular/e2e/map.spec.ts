import { APIRequestContext, Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  LocationInput,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  domCoordinateFindings,
  forbidMapProviders,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';
import { clickState } from './support/map';

/**
 * The region map and region-scoped search (ADR 0017) against the real local stack: a collector
 * publishes a binder in a state; another collector of the same region finds it on Home (the state
 * is shaded, the list and the map open the same panel, the URL keeps region and state), opens the
 * binder; Search › Cards leads to Who has this card, which lists the holders of the browsed region
 * only (web stage WD). Every JSON document the page
 * receives is checked: no `lat`/`lng` at all, no distance, no map provider or tile server called.
 *
 * Sellers sit in sparsely used states (Yukon, Nunavut) and the assertions are about their own
 * binder, so what other specs or earlier runs left in the database does not matter.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

interface Seller {
  collector: OnboardedCollector;
  binder: { id: string; name: string };
}

/** A discoverable collector of `location` with one public binder holding one card for sale. */
async function createSeller(
  api: APIRequestContext,
  location: LocationInput,
  card: { code: string; price: number },
): Promise<Seller> {
  const collector = await createOnboardedCollector(api, 'mapseller', {
    location,
    displayName: `Map Seller ${suffix()}`,
  });
  await apiUpdatePrivacy(api, collector.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, collector.idToken, {
    name: `E2E map binder ${suffix()}`,
    kind: 'SALE',
    description: 'Fictional binder for the map E2E suite.',
  });
  await apiCreateItem(api, collector.idToken, {
    printingId: await printingIdOf(api, collector.idToken, card.code),
    binderId: binder.id,
    condition: 'NEAR_MINT',
    availability: 'SALE',
    askingPrice: card.price,
    acceptsOffers: true,
  });
  await apiPublishBinder(api, collector.idToken, binder.id, 'UNTIL_DISABLED');
  return { collector, binder };
}

/** Collector B of Americas (North) (Quebec), not discoverable themselves. */
function createViewer(api: APIRequestContext): Promise<OnboardedCollector> {
  return createOnboardedCollector(api, 'mapviewer', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-QC' },
    displayName: `Map Viewer ${suffix()}`,
  });
}

async function binderCount(
  api: APIRequestContext,
  token: string,
  region: string,
  code: string,
): Promise<number> {
  const response = await api.get(`${API_URL}/api/v1/regions/${region}/binder-counts`, {
    headers: authHeader(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    subdivisions: { code: string; binderCount: number }[];
  };
  return body.subdivisions.find((entry) => entry.code === code)?.binderCount ?? 0;
}

/** No coordinate key in any JSON answer, no DOM attribute with a coordinate, no map provider. */
async function expectNoGeography(
  page: Page,
  watcher: ReturnType<typeof watchCoordinates>,
  providers: { calls: string[] },
): Promise<void> {
  await watcher.settle();
  expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  const dom = await domCoordinateFindings(page);
  expect(dom.scanned).toBeGreaterThan(100);
  expect(dom.findings, 'DOM attributes holding coordinates').toEqual([]);
  expect(providers.calls, 'map provider or tile server calls').toEqual([]);
  await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
}

test.describe('region map and search', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('a collector of the region finds a binder by state on the map and in the list', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const seller = await createSeller(
      request,
      { countryCode: 'CA', subdivisionCode: 'CA-YT', city: `Zqcity${suffix()}`, showCity: true },
      { code: 'AZR-EN001', price: 38.5 },
    );
    const viewer = await createViewer(request);
    const a = seller.collector;
    expect(a.placeLabel).toBe('Yukon, Canada');
    const watcher = watchCoordinates(page);
    const providers = await forbidMapProviders(page);
    const yukon = await binderCount(request, viewer.idToken, 'americas-north', 'CA-YT');
    expect(yukon).toBeGreaterThanOrEqual(1);

    await signInThroughUi(page, viewer.email, viewer.password);
    // Web stage WE: Home is the feed (its map card is a static picture); the map and the states'
    // list are Search › Binders (spec 6.3 and 6.4).
    await page.goto('/search?tab=binders');
    await expect(page).toHaveURL(/region=americas-north/);
    await expect(page.getByTestId('region-pill')).toContainText('Americas (North)');
    // The state is drawn and shaded with a map step (it holds at least the seller's binder).
    const shape = page.locator('.leaflet-overlay-pane path[data-code="CA-YT"]');
    await expect(shape).toBeAttached();
    const empty = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-map-step0').trim(),
    );
    await expect
      .poll(async () => (await shape.getAttribute('fill'))?.toLowerCase())
      .not.toBe(empty.toLowerCase());

    // The accessible list: the state's row, then its binders.
    const entry = page.locator('.sl__row[data-code="CA-YT"]');
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/state=CA-YT/);
    const chip = page.getByTestId('state-chip');
    await expect(chip).toBeFocused();
    const row = page.getByTestId('binder-row').filter({ hasText: seller.binder.name });
    await expect(row).toContainText(`${a.handle} · Yukon`);
    // The city is never shown outside the owner's profile.
    await expect(page.locator('.bp')).not.toContainText('Zqcity');
    await chip.click();
    await expect(page).not.toHaveURL(/state=/);

    // A real mouse click on the state on the map opens it too (never a synthetic event).
    await clickState(page, 'CA-YT');
    await expect(page).toHaveURL(/state=CA-YT/);
    await expect(row).toBeVisible();
    await expectNoGeography(page, watcher, providers);

    // The binder, then its owner's profile (state and city on their own profile only).
    await page.goto(`/binders/${seller.binder.id}`);
    await expect(page.getByRole('heading', { level: 1, name: seller.binder.name })).toBeVisible();
    // The owner row: the province (spec 8.2), never the city.
    await expect(page.getByTestId('owner-public-label')).toContainText('Yukon');
    await expect(page.getByRole('main')).not.toContainText('Zqcity');
    await page.goto(`/collectors/${a.handle}`);
    await expect(page.getByTestId('collector-city')).toHaveText(/^Zqcity/);

    // An old shared map link opens Search › Binders in another region with its state; the region
    // pill follows (spec 4.11).
    await page.goto('/map?region=europe&subdivision=FR-IDF');
    await expect(page).toHaveURL(/\/search\?tab=binders&region=europe&state=FR-IDF/);
    await expect(page.getByTestId('region-pill')).toContainText('Europe');
    await expect(page.getByTestId('state-chip')).toHaveAttribute(
      'aria-label',
      'Showing Île-de-France. Back to the list of states',
    );
  });

  test('card search lists the holders of the browsed region only', async ({ page, request }) => {
    test.setTimeout(150_000);
    const seller = await createSeller(
      request,
      { countryCode: 'CA', subdivisionCode: 'CA-NU' },
      { code: 'AZR-EN011', price: 12 },
    );
    const viewer = await createViewer(request);
    const a = seller.collector;
    const watcher = watchCoordinates(page);
    const providers = await forbidMapProviders(page);
    await signInThroughUi(page, viewer.email, viewer.password);

    // Search › Cards (spec 6.2): the field is focused on arrival; choosing a card opens Who has
    // this card (spec 7).
    await page.goto('/search');
    const search = page.getByRole('combobox', { name: 'Search Yu-Gi-Oh! cards by name or code' });
    await expect(search).toBeFocused();
    await search.fill('lantern');
    const option = page.getByRole('option', { name: /Lantern Fox Spirit/ }).first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1, name: 'Lantern Fox Spirit' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: /Who has this card in Americas \(North\)/ }),
    ).toBeVisible();
    // Grouped by province (Nunavut), the price as typed, a Message pill; no count, no distance.
    const group = page.getByRole('region', { name: /^Nunavut/ });
    const sellerRow = group.getByTestId('holder-row').filter({ hasText: a.handle });
    await expect(sellerRow).toContainText('$12.00');
    await expect(sellerRow).toContainText('AZR-EN011');
    await expect(sellerRow).not.toContainText(/\bkm\b/);
    await expect(sellerRow.getByTestId('holder-message')).toHaveAttribute(
      'aria-label',
      `Message ${a.handle} about Lantern Fox Spirit`,
    );
    await expect(page.getByRole('main')).not.toContainText(/\d+ (listings|holders|results)/);

    // Another region: the holders of Americas (North) are gone.
    await page.getByTestId('region-pill').click();
    await page.getByRole('radio', { name: /^Europe/ }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: /Who has this card in Europe/ }),
    ).toBeVisible();
    await expect(sellerRow).toBeHidden();
    await page.getByTestId('region-pill').click();
    await page.getByRole('radio', { name: /^Americas \(North\)/ }).click();
    await expect(sellerRow).toBeVisible();

    // A typed printing code (top bar's search from another page) opens that printing.
    await page.goto('/cards');
    const top = page.getByRole('banner').getByRole('combobox', { name: /^Search Yu-Gi-Oh! cards/ });
    await top.fill('AZR-EN011');
    await expect(
      page.getByRole('option', { name: /Lantern Fox Spirit, AZR-EN011/ }).first(),
    ).toBeVisible();
    await top.press('Enter');
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}\?printing=/);
    await expect(page.getByTestId('holder-row').filter({ hasText: a.handle })).toBeVisible();

    await expectNoGeography(page, watcher, providers);
  });
});
