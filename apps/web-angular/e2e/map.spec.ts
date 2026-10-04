import { APIRequestContext, Page, expect, test } from '@playwright/test';
import {
  CoordinateSample,
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  tooPrecise,
  watchCoordinates,
} from './support/inventory';
import {
  OnboardedCollector,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
  stubMapTiles,
} from './support/stack';

/**
 * Map discovery and search (Phase 4) against the real local stack: a collector publishes a card,
 * another collector finds them on the /map page at an approximate position, opens the preview,
 * the full profile and the public binder; card search leads to the nearby holders on the map and
 * in the card-holders view. Every JSON response the page sees is checked for ADR 0004: lat/lng
 * have at most 3 decimals and never equal a stored trading-area centre.
 *
 * Each test places its two fictional collectors around a random rural point of Québec (far from
 * the seeded Montréal collectors and from earlier runs), so the map never clusters them and the
 * assertions do not depend on what earlier runs left in the database.
 */

interface Point {
  lat: number;
  lng: number;
}

/**
 * A random centre with 3 decimals: the latitude sits on a line of the API's ~1 km public grid (a
 * multiple of 0.009°, never on a 0.01° line) and the longitude never ends in 0. Public points are
 * derived at least 0.001° inside a grid cell and search centres are snapped to 2 decimals, so
 * neither can equal a stored centre by chance: the "never equals a stored centre" check below only
 * fails on a genuine leak (it used to fail when the jitter happened to land on the centre).
 */
function randomArea(): Point {
  let row = 5130 + Math.floor(Math.random() * 78); // 46.17°–46.87°
  if (row % 10 === 0 || (row + 2) % 10 === 0) {
    row += 1; // neither this row nor the viewer's (two rows north) on a 0.01° line
  }
  let lng = Math.round((-75.2 + Math.random() * 2.2) * 1000);
  if (lng % 10 === 0 || (lng - 17) % 10 === 0) {
    lng += 1;
  }
  return { lat: (row * 9) / 1000, lng: lng / 1000 };
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

interface NearbyAnswer {
  center: Point;
  collectors: { handle: string; publicPoint: Point }[];
}

interface Seller {
  collector: OnboardedCollector;
  area: Point;
  binder: { id: string; name: string };
}

/** Collector A: discoverable, with one public binder holding one card for sale. */
async function createSeller(
  api: APIRequestContext,
  area: Point,
  card: { code: string; price: number },
): Promise<Seller> {
  const collector = await createOnboardedCollector(api, 'mapseller', {
    area: { ...area, radiusKm: 5 },
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
  return { collector, area, binder };
}

/** The viewer's stored trading-area centre: about 2 km from the seller's, on the same grid. */
function viewerCentre(near: Point): Point {
  return {
    lat: ((Math.round((near.lat * 1000) / 9) + 2) * 9) / 1000,
    lng: (Math.round(near.lng * 1000) - 17) / 1000,
  };
}

/** Collector B, near A (not discoverable themselves). */
function createViewer(api: APIRequestContext, near: Point): Promise<OnboardedCollector> {
  return createOnboardedCollector(api, 'mapviewer', {
    area: { ...viewerCentre(near), radiusKm: 10 },
    displayName: `Map Viewer ${suffix()}`,
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A collector's marker on the Leaflet map (a keyboard-focusable button). */
function marker(page: Page, name: string) {
  return page
    .getByTestId('discovery-map')
    .getByRole('button', { name: new RegExp(`^${escape(name)}`) });
}

/** Pairs the recorded `lat`/`lng` samples of one object (same response, same parent path). */
function points(samples: readonly CoordinateSample[]): (Point & { where: string })[] {
  const byParent = new Map<string, Partial<Point>>();
  for (const sample of samples) {
    const parent = `${sample.url} ${sample.path.replace(/\.(lat|lng|latitude|longitude)$/i, '')}`;
    const entry = byParent.get(parent) ?? {};
    if (/\.(lat|latitude)$/i.test(sample.path)) {
      entry.lat = sample.value;
    } else {
      entry.lng = sample.value;
    }
    byParent.set(parent, entry);
  }
  return [...byParent.entries()]
    .filter(([, point]) => point.lat !== undefined && point.lng !== undefined)
    .map(([where, point]) => ({ where, lat: point.lat!, lng: point.lng! }));
}

async function expectPrivacy(
  watcher: ReturnType<typeof watchCoordinates>,
  storedCentres: readonly Point[],
): Promise<void> {
  await watcher.settle();
  expect(watcher.samples.length, 'the page received coordinates to check').toBeGreaterThan(0);
  expect(tooPrecise(watcher.samples), 'lat/lng with more than 3 decimals').toEqual([]);
  const leaked = points(watcher.samples).filter((point) =>
    storedCentres.some((centre) => centre.lat === point.lat && centre.lng === point.lng),
  );
  expect(leaked, 'a stored trading-area centre reached the browser').toEqual([]);
}

test.describe('map discovery and search', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
    await stubMapTiles(page);
  });

  test('a collector finds a nearby seller on the map, previews them and opens their binder', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const seller = await createSeller(request, randomArea(), { code: 'AZR-EN001', price: 38.5 });
    const viewer = await createViewer(request, seller.area);
    const a = seller.collector;
    const watcher = watchCoordinates(page);

    // Every nearby answer, read as soon as it arrives (the viewer's own area is the centre).
    const answers: NearbyAnswer[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/collectors/nearby') && response.ok()) {
        response
          .json()
          .then((body: NearbyAnswer) => answers.push(body))
          .catch(() => undefined);
      }
    });
    await signInThroughUi(page, viewer.email, viewer.password);
    await expect(page).toHaveURL(/\/map$/);
    await expect
      .poll(() => answers.find((answer) => answer.collectors.some((c) => c.handle === a.handle)))
      .toBeTruthy();
    const answer = answers.find((candidate) =>
      candidate.collectors.some((c) => c.handle === a.handle),
    )!;
    expect(answer.center).not.toEqual(seller.area);
    expect(answer.center).not.toEqual(viewerCentre(seller.area));
    const found = answer.collectors.find((collector) => collector.handle === a.handle)!;
    // Approximate position: the derived public point, never the stored centre.
    expect(found.publicPoint).not.toEqual(seller.area);

    // The map page: status, legend, filters, and the seller's avatar marker.
    await expect(page.getByTestId('map-status')).toContainText(/collectors? within/);
    await expect(
      page.getByText('Locations are approximate (about 2 km) to protect privacy'),
    ).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Map filters' })).toBeVisible();
    const sellerMarker = marker(page, a.displayName);
    await expect(sellerMarker).toBeVisible();
    await expect(sellerMarker).toHaveAttribute(
      'aria-label',
      new RegExp(`^${escape(a.displayName)}, `),
    );

    // Marker click -> preview card with the approximate details.
    await sellerMarker.click();
    const preview = page.getByRole('dialog', { name: a.displayName });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(`@${a.handle}`);
    await expect(preview.getByTestId('preview-distance')).toContainText(/km away/);
    await expect(preview).toContainText('No ratings yet');
    await expect(preview).toContainText('Active today');
    await expect(preview.getByTestId('preview-freshness')).toContainText(
      '1 public binder · 1 card',
    );
    // Phase 5: the seller accepts messages from members with a profile.
    await expect(preview.getByRole('button', { name: `Message ${a.displayName}` })).toBeEnabled();
    await expect(preview.getByRole('link', { name: 'View public binder' })).toHaveAttribute(
      'href',
      `/binders/${seller.binder.id}`,
    );
    await expect(sellerMarker).toHaveAttribute('aria-current', 'true');
    // ADR 0004 client rendering: the preview says how approximate the place is, and the map draws
    // approximate-area discs (with the search radius) instead of exact pins only.
    await expect(preview.getByTestId('preview-approximate')).toHaveText(
      /Locations are approximate \(about 2 km\)/,
    );
    await expect
      .poll(() => page.getByTestId('discovery-map').locator('.leaflet-overlay-pane path').count())
      .toBeGreaterThanOrEqual(2);

    // Escape closes the preview.
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();

    // The map never zooms closer than the privacy cap (zoom 14): the zoom-in button switches off.
    const zoomIn = page.getByTestId('discovery-map').getByRole('button', { name: 'Zoom in' });
    await expect(async () => {
      if ((await zoomIn.getAttribute('aria-disabled')) !== 'true') {
        await zoomIn.click();
      }
      await expect(zoomIn).toHaveAttribute('aria-disabled', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    // The list toggle is the keyboard alternative to the markers.
    const listToggle = page.getByRole('button', { name: 'List', exact: true });
    await listToggle.focus();
    await page.keyboard.press('Enter');
    await expect(listToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/view=list/);
    const list = page.getByRole('list', { name: 'Collectors on the map' });
    const row = list.getByRole('button', { name: a.displayName, exact: true });
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: a.displayName })).toBeVisible();

    // View profile -> the full profile, then its public binder.
    await page
      .getByRole('dialog', { name: a.displayName })
      .getByRole('link', { name: 'View profile' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/collectors/${a.handle}$`));
    await expect(page.getByRole('heading', { level: 1, name: a.displayName })).toBeVisible();
    await page.getByRole('link', { name: 'View public binder' }).click();
    await expect(page).toHaveURL(new RegExp(`/binders/${seller.binder.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: seller.binder.name })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Azure-Eyes Sky Dragon');

    await expectPrivacy(watcher, [seller.area, viewerCentre(seller.area)]);
  });

  test('card search shows the nearby holders on the map and in the holders view', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const seller = await createSeller(request, randomArea(), { code: 'AZR-EN011', price: 12 });
    const viewer = await createViewer(request, seller.area);
    const a = seller.collector;
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, viewer.email, viewer.password);
    await expect(page).toHaveURL(/\/map$/);
    await expect(marker(page, a.displayName)).toBeVisible();

    // The map's unified search: choosing a card switches to "holders of" mode.
    const search = page.getByRole('combobox', { name: 'Search the map' });
    await search.fill('lantern');
    const option = page.getByRole('option', { name: /Lantern Fox Spirit/ }).first();
    await expect(option).toBeVisible();
    await expect(option).toContainText('Card');
    await option.click();
    await expect(page).toHaveURL(/\/map\?card=[0-9a-f-]{36}&view=list$/);
    await expect(
      page.getByRole('heading', { name: 'Holders of Lantern Fox Spirit' }),
    ).toBeVisible();
    const holders = page.getByRole('list', { name: 'Holders of Lantern Fox Spirit' });
    await expect(holders.getByRole('button', { name: a.displayName, exact: true })).toBeVisible();
    const listing = holders.getByRole('list', { name: `Listings of ${a.displayName}` });
    await expect(listing).toContainText('AZR-EN011');
    await expect(listing).toContainText('$12.00');
    await expect(listing.getByLabel('Condition: Near Mint')).toBeVisible();
    await expect(marker(page, a.displayName)).toBeVisible();
    await expect(page.getByTestId('map-status')).toContainText('with this card');

    // All filters: the card-holders view with every filter, kept in the URL.
    await page.getByRole('link', { name: 'All filters' }).click();
    await expect(page).toHaveURL(/\/search\?card=[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Who has Lantern Fox Spirit near you' }),
    ).toBeVisible();
    const results = page.getByRole('list', { name: 'Card holders near you' });
    const sellerRow = results.getByRole('article', {
      name: new RegExp(`^${escape(a.displayName)}`),
    });
    await expect(sellerRow).toContainText('$12.00');
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
    // Keyboard: the filters are native-feeling selects.
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

    // Unified search by printing code: the resolved card lists its nearby holders.
    await page.goto('/search?q=AZR-EN011');
    await expect(page.getByRole('heading', { name: /Who has Lantern Fox Spirit/ })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Nearby holders' }).getByRole('link', { name: a.displayName }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cards for “AZR-EN011”' })).toBeVisible();
    await page.getByRole('tab', { name: /Collectors/ }).click();
    await expect(page).toHaveURL(/tab=collectors/);
    await expect(
      page
        .getByRole('list', { name: 'Matching collectors' })
        .getByRole('link', { name: a.displayName }),
    ).toBeVisible();

    await expectPrivacy(watcher, [seller.area, viewerCentre(seller.area)]);
  });
});
