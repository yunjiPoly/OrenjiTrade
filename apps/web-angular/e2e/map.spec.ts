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

/**
 * The region map and region-scoped search (ADR 0017) against the real local stack: a collector
 * publishes a binder in a state; another collector of the same region finds it on /map (the state
 * is shaded, the list and the map open the same panel, the URL keeps region and state), opens the
 * binder; card search lists the holders of the browsed region only. Every JSON document the page
 * receives is checked: no `lat`/`lng` at all, no distance, no map provider or tile server called.
 *
 * Sellers sit in sparsely used states (Yukon, Nunavut) and the assertions are about their own
 * binder, so what other specs or earlier runs left in the database does not matter.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    await page.goto('/map');
    // Signed in: the home region (from GET /me) is browsed and written to the URL.
    await expect(page).toHaveURL(/\/map\?region=americas-north$/);
    await expect(page.getByTestId('region-switcher')).toContainText('Americas (North)');
    await expect(page.getByTestId('map-status')).toContainText(
      /public binders? in Americas \(North\)/,
    );
    // The state is drawn and shaded (it holds at least the seller's binder).
    const shape = page.locator('.leaflet-overlay-pane path[data-code="CA-YT"]');
    await expect(shape).toBeAttached();
    await expect.poll(async () => Number(await shape.getAttribute('fill-opacity'))).toBeLessThan(1);

    // The accessible list: filter, keyboard, the same panel as the map.
    await page.getByTestId('subdivision-filter').fill('yukon');
    const entry = page.locator('[data-code="CA-YT"]').filter({ hasText: 'Yukon' });
    await expect(entry).toContainText(String(yukon));
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/map\?region=americas-north&subdivision=CA-YT$/);
    const panel = page.getByTestId('subdivision-panel');
    await expect(panel.getByRole('heading', { name: 'Yukon, Canada' })).toBeFocused();
    const card = panel.getByRole('listitem').filter({ hasText: seller.binder.name });
    await expect(card).toContainText(`@${a.handle}`);
    // The city is never shown outside the owner's profile.
    await expect(panel).not.toContainText('Zqcity');
    await panel.getByRole('button', { name: 'Back to the list' }).click();
    await expect(page).toHaveURL(/\/map\?region=americas-north$/);

    // A click on the state on the map opens it too.
    await shape.dispatchEvent('click');
    await expect(page).toHaveURL(/subdivision=CA-YT/);
    await expect(panel.getByRole('heading', { name: 'Yukon, Canada' })).toBeVisible();
    await expectNoGeography(page, watcher, providers);

    // The binder, then its owner's profile (state and city on their own profile only).
    await panel.getByRole('link', { name: seller.binder.name }).click();
    await expect(page).toHaveURL(new RegExp(`/binders/${seller.binder.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: seller.binder.name })).toBeVisible();
    await expect(page.getByTestId('owner-public-label')).toContainText('Yukon, Canada');
    await expect(page.getByRole('main')).not.toContainText('Zqcity');
    await page.goto(`/collectors/${a.handle}`);
    await expect(page.getByTestId('collector-city')).toHaveText(/^Zqcity/);

    // A shared link opens another region with its state; the switcher follows.
    await page.goto('/map?region=europe&subdivision=FR-IDF');
    await expect(page.getByTestId('region-switcher')).toContainText('Europe');
    await expect(
      page.getByTestId('subdivision-panel').getByRole('heading', { name: 'Île-de-France, France' }),
    ).toBeVisible();
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

    // The map's unified search: choosing a card opens its holders.
    await page.goto('/map');
    const search = page.getByRole('combobox', { name: 'Search cards, collectors and binders' });
    await search.fill('lantern');
    const option = page.getByRole('option', { name: /Lantern Fox Spirit/ }).first();
    await expect(option).toBeVisible();
    await expect(option).toContainText('Card');
    await option.click();
    await expect(page).toHaveURL(/\/search\?card=[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Who has Lantern Fox Spirit' }),
    ).toBeVisible();
    await expect(
      page.getByText('Collectors in Americas (North), freshest listings first.'),
    ).toBeVisible();
    const results = page.getByRole('list', { name: 'Card holders in your region' });
    const sellerRow = results.getByRole('article', {
      name: new RegExp(`^${escape(a.displayName)}`),
    });
    await expect(sellerRow).toContainText('$12.00');
    await expect(sellerRow).toContainText('Nunavut, Canada');
    await expect(sellerRow).not.toContainText(/\bkm\b/);
    await expect(sellerRow.getByRole('link', { name: 'View binder' })).toHaveAttribute(
      'href',
      `/binders/${seller.binder.id}`,
    );

    // An inverted price range is explained inline; a max price below the listing hides it.
    await page.getByLabel('Min price').fill('20');
    await page.getByLabel('Max price').fill('5');
    await page.getByLabel('Max price').blur();
    await expect(page.getByText('The minimum price must not be above the maximum.')).toBeVisible();
    await page.getByLabel('Min price').fill('');
    await expect(page).toHaveURL(/maxPrice=5/);
    await expect(sellerRow).toBeHidden();
    await page.getByLabel('Max price').fill('15');
    await expect(page).toHaveURL(/maxPrice=15/);
    await expect(sellerRow).toBeVisible();
    // Keyboard: the filters are native-feeling selects; no "closest first" sort exists.
    await page.getByRole('combobox', { name: 'Availability' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'For trade' }).click();
    await expect(page).toHaveURL(/availability=TRADE/);
    await expect(sellerRow).toBeHidden();
    await page
      .getByRole('button', { name: /Clear filters/ })
      .first()
      .click();
    await expect(sellerRow).toBeVisible();

    // Another region: the holders of Americas (North) are gone.
    await page.getByTestId('region-switcher').click();
    await page.getByRole('menuitemradio', { name: 'Europe' }).click();
    await expect(page.getByText('Collectors in Europe, freshest listings first.')).toBeVisible();
    await expect(sellerRow).toBeHidden();
    await page.getByTestId('region-switcher').click();
    await page.getByRole('menuitemradio', { name: /Americas \(North\)/ }).click();
    await expect(sellerRow).toBeVisible();

    // Unified search by printing code: the resolved card lists the holders of the region.
    await page.goto('/search?q=AZR-EN011');
    await expect(page.getByRole('heading', { name: /Who has Lantern Fox Spirit/ })).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Holders in your region' })
        .getByRole('link', { name: a.displayName }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cards for “AZR-EN011”' })).toBeVisible();
    await page.getByRole('tab', { name: /Collectors/ }).click();
    await expect(page).toHaveURL(/tab=collectors/);
    await expect(
      page
        .getByRole('list', { name: 'Matching collectors' })
        .getByRole('link', { name: a.displayName }),
    ).toBeVisible();

    await expectNoGeography(page, watcher, providers);
  });
});
