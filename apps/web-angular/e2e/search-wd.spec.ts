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
  forbidMapProviders,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';
import { clickState, statePoint } from './support/map';

/**
 * Web stage WD (spec 6 to 8, boards W4 to W9) against the real local stack: Search › Binders with
 * the map beside the list (a click on a state lands in its binders, decision 15), a binder and a
 * deck core opened beside the list, which spends one public binder view on the explicit open only
 * and never on hover, focus or listing (decision 14), the middle pane at xl, the limit message;
 * Who has this card with "Jump to", "Also in a deck core" and "I have this card" (owner check:
 * Inventory's Add drawer over the page); a set page with "Add from this set" (owner check); a
 * public binder's sort pill. No JSON answer carries a coordinate.
 *
 * Sellers sit in sparsely used states (South Dakota, Prince Edward Island) and the assertions are
 * about their own binders, so what other specs left in the database does not matter.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

interface Seller {
  collector: OnboardedCollector;
  binder: { id: string; name: string };
  core: { id: string; name: string };
}

/** A discoverable collector with a public binder (two priced cards) and a public deck core. */
async function createSeller(api: APIRequestContext, location: LocationInput): Promise<Seller> {
  const collector = await createOnboardedCollector(api, 'wdseller', {
    location,
    displayName: `WD Seller ${suffix()}`,
  });
  await apiUpdatePrivacy(api, collector.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, collector.idToken, {
    name: `WD binder ${suffix()}`,
    kind: 'TRADE',
    description: 'Fictional binder for the WD E2E suite.',
  });
  const fox = await printingIdOf(api, collector.idToken, 'AZR-EN011');
  const dragon = await printingIdOf(api, collector.idToken, 'AZR-EN001');
  await apiCreateItem(api, collector.idToken, {
    printingId: fox,
    binderId: binder.id,
    availability: 'TRADE_OR_SALE',
    askingPrice: 20,
    publicNotes: 'NM, ships tracked in a top loader.',
  });
  await apiCreateItem(api, collector.idToken, {
    printingId: dragon,
    binderId: binder.id,
    availability: 'TRADE_OR_SALE',
    askingPrice: 5,
  });
  await apiPublishBinder(api, collector.idToken, binder.id, 'UNTIL_DISABLED');
  const core = await apiCreateBinder(api, collector.idToken, {
    name: `WD core ${suffix()}`,
    kind: 'DECK',
    description: 'Fictional deck core for the WD E2E suite.',
    sellsAsCore: true,
    askingPriceText: '$95',
  });
  await apiCreateItem(api, collector.idToken, {
    printingId: fox,
    binderId: core.id,
    quantity: 3,
    availability: 'TRADE_OR_SALE',
  });
  await apiPublishBinder(api, collector.idToken, core.id, 'UNTIL_DISABLED');
  return { collector, binder, core };
}

function createViewer(api: APIRequestContext): Promise<OnboardedCollector> {
  return createOnboardedCollector(api, 'wdviewer', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-QC' },
    displayName: `WD Viewer ${suffix()}`,
  });
}

/** The viewer's binder views spent today (`GET /me/limits`). */
async function viewsUsed(api: APIRequestContext, token: string): Promise<number> {
  const response = await api.get(`${API_URL}/api/v1/me/limits`, { headers: authHeader(token) });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { limits: { key: string; used?: number }[] };
  return body.limits.find((entry) => entry.key === 'binder.views.per_day')?.used ?? 0;
}

/** Every read of a binder itself (`GET /public/binders/{id}`, the one that spends a view). */
function binderReads(page: Page): string[] {
  const reads: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/v1\/public\/binders\/[0-9a-f-]{36}$/.test(request.url().split('?')[0])) {
      reads.push(request.url());
    }
  });
  return reads;
}

test.describe('web stage WD: Search, Who has this card, sets, binders and deck cores', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
    await forbidMapProviders(page);
  });

  test('a state on the map lands in its binders; a binder opens beside the list and spends one view only when opened', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const seller = await createSeller(request, { countryCode: 'US', subdivisionCode: 'US-SD' });
    const viewer = await createViewer(request);
    const watcher = watchCoordinates(page);
    const reads = binderReads(page);
    await signInThroughUi(page, viewer.email, viewer.password);

    await page.goto('/search?tab=binders');
    await expect(page).toHaveURL(/tab=binders.*region=americas-north.*game=yugioh/);
    await expect(page.getByRole('heading', { name: 'Browse by state or province' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Whole region/ })).toBeVisible();
    await expect(page.getByTestId('boundary-map')).toHaveAttribute(
      'aria-label',
      'Map of public Yu-Gi-Oh! binders by state or province in Americas (North)',
    );
    // "Skip the map" jumps to the list, the map's keyboard twin (spec 6.4).
    await page.getByTestId('skip-map').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#search-list')).toBeFocused();

    // The state list by keyboard: one tab stop, the arrows move.
    const whole = page.getByRole('button', { name: /^Whole region/ });
    await whole.focus();
    await page.keyboard.press('ArrowDown');
    await expect(whole).not.toBeFocused();

    // The map's shapes are no Tab stops: one Tab from the map reaches "Show my province" (A2).
    await page.locator('.leaflet-container').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Show my province' })).toBeFocused();

    // A real mouse click on Ontario, coming from the viewer's own (outlined) Quebec, lands in its
    // binders (decision 15) and the map stays (WD review U1, A1: a synthetic click hid that).
    await expect(page.locator('.leaflet-overlay-pane path[data-code="CA-ON"]')).toBeAttached();
    await clickState(page, 'CA-ON', 'CA-QC');
    await expect(page).toHaveURL(/state=CA-ON/);
    const chip = page.getByTestId('state-chip');
    await expect(chip).toHaveAttribute('aria-label', 'Showing Ontario. Show the whole region');
    await expect(page.getByTestId('boundary-map')).toBeVisible();
    // Moving across states leaves at most one tooltip.
    await page.mouse.move(5, 5);
    await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);

    // The keyboard twin (spec 6.4): the chip's × goes back to the list, on Ontario's row; a state
    // picked in the list moves the focus to its chip.
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/state=/);
    await expect(page.locator('.sl__row[data-code="CA-ON"]')).toBeFocused();
    await page.locator('.sl__row[data-code="US-SD"]').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/state=US-SD/);
    await expect(chip).toBeFocused();
    await expect(chip).toHaveAttribute('aria-label', 'Showing South Dakota. Show the whole region');
    const row = page.getByTestId('binder-row').filter({ hasText: seller.binder.name });
    await expect(row).toContainText(`${seller.collector.handle} · South Dakota · 2 cards`);
    // No counts in the results (owner 2026-10-14).
    await expect(page.getByRole('main')).not.toContainText(/\d+ (results|binders found)/);

    // Hovering and focusing rows reads nothing; the explicit open spends exactly one view.
    const before = await viewsUsed(request, viewer.idToken);
    await row.hover();
    await row.focus();
    await page.getByTestId('binder-row').first().hover();
    await page.waitForTimeout(800);
    expect(reads, 'hover and focus never read a binder').toEqual([]);
    expect(await viewsUsed(request, viewer.idToken)).toBe(before);
    await row.click();
    const drill = page.getByTestId('binder-drill-in');
    await expect(drill.getByRole('heading', { name: seller.binder.name })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`open=${seller.binder.id}`));
    await expect(drill.getByTestId('binder-card')).toHaveCount(2);
    expect(reads).toHaveLength(1);
    expect(await viewsUsed(request, viewer.idToken)).toBe(before + 1);
    // Searching the binder spends none.
    await drill.getByRole('searchbox', { name: 'Search this binder' }).fill('lantern');
    await expect(drill.getByTestId('binder-card')).toHaveCount(1);
    expect(reads).toHaveLength(1);
    await expect(drill.getByRole('link', { name: /Open full page/ })).toHaveAttribute(
      'href',
      `/binders/${seller.binder.id}`,
    );
    // Back restores the list and the focus on the row.
    await drill.getByTestId('drill-in-back').click();
    await expect(page).not.toHaveURL(/open=/);
    await expect(row).toBeFocused();

    // Deck cores: the segmented control; a deck core opens with its price and Message.
    await page.getByRole('radio', { name: 'Deck cores' }).click();
    await expect(page).toHaveURL(/kind=deckcores/);
    const coreRow = page.getByTestId('binder-row').filter({ hasText: seller.core.name });
    await expect(coreRow).toContainText('$95');
    await coreRow.click();
    await expect(drill.getByRole('heading', { name: seller.core.name })).toBeVisible();
    await expect(drill.getByTestId('drill-in-message')).toHaveText(
      `Message ${seller.collector.handle}`,
    );
    await expect(drill).toContainText('Lantern Fox Spirit ×3');

    // At xl (1920) the binder opens in a middle pane; the list keeps its rows (spec 6.5).
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByRole('region', { name: 'Opened binder' })).toBeVisible();
    await expect(coreRow).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    // At lg the head (H1, tabs) stays above the open binder (board W5).
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();

    // The region pill drops the old region's state and open binder (no endless 404, F1).
    await page.goto(`/search?tab=binders&state=US-SD&open=${seller.binder.id}`);
    await expect(page).toHaveURL(/open=/);
    await page.getByTestId('region-pill').click();
    await page.getByRole('radio', { name: /^Europe/ }).click();
    await expect(page).toHaveURL(/region=europe/);
    await expect(page).not.toHaveURL(/state=US-SD|open=/);
    await expect(page.getByText('Binders could not load.')).toHaveCount(0);
    await page.getByTestId('search-away').getByRole('button').click();
    await expect(page).toHaveURL(/region=americas-north/);

    // md (960 to 1279): a row opens the binder's full page (spec 6.5); Back focuses the row.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/search?tab=binders&state=US-SD');
    const mdRow = page.getByTestId('binder-row').filter({ hasText: seller.binder.name });
    await mdRow.click();
    await expect(page).toHaveURL(new RegExp(`/binders/${seller.binder.id}$`));
    await page.goBack();
    await expect(mdRow).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 720 });

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });

  test('the binder view limit says so plainly, beside the list and on the page', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request, { countryCode: 'US', subdivisionCode: 'US-SD' });
    const viewer = await createViewer(request);
    await signInThroughUi(page, viewer.email, viewer.password);
    // The 429 of a collector who opened 30 binders today (a route: the shared limit stays).
    await page.route(`${API_URL}/api/v1/public/binders/${seller.binder.id}`, (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 429,
          errorCode: 'LIMIT_REACHED',
          message: 'Limit reached',
          limitKey: 'binder.views.per_day',
          limit: 30,
          used: 30,
          resetsAt: '2030-01-01T05:00:00Z',
          requestId: 'e2e-limit',
          timestamp: '2026-10-29T12:00:00Z',
        }),
      }),
    );
    await page.goto('/search?tab=binders&state=US-SD');
    await page.getByTestId('binder-row').filter({ hasText: seller.binder.name }).click();
    const limit = page.getByTestId('binder-drill-in').getByTestId('binder-limit');
    await expect(limit).toContainText(
      /You've opened 30 public binders today\. Every collector has the same limits\. More (today|tomorrow|on .+?) at /,
    );
    await expect(limit).not.toContainText('..');
    await expect(page.getByRole('main')).not.toContainText(/premium|upgrade|plan/i);
    await page.goto(`/binders/${seller.binder.id}`);
    await expect(page.getByTestId('binder-limit')).toContainText(
      "You've opened 30 public binders today.",
    );
  });

  test('Who has this card: jump chips, the deck core banner, Message, and "I have this card"', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const south = await createSeller(request, { countryCode: 'US', subdivisionCode: 'US-SD' });
    const island = await createSeller(request, { countryCode: 'CA', subdivisionCode: 'CA-PE' });
    const viewer = await createViewer(request);
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, viewer.email, viewer.password);
    // An old link of the card holders opens the card page (before WD it was Search's).
    const fox = await printingIdOf(request, viewer.idToken, 'AZR-EN011');
    const printing = await request.get(`${API_URL}/api/v1/printings/${fox}`, {
      headers: authHeader(viewer.idToken),
    });
    const cardId = ((await printing.json()) as { card: { id: string } }).card.id;
    await page.goto(`/search?card=${cardId}`);
    await expect(page).toHaveURL(new RegExp(`/cards/${cardId}`));
    await expect(page.getByRole('heading', { level: 1, name: 'Lantern Fox Spirit' })).toBeVisible();

    // The provinces in the list as "Jump to" chips (no numbers); a chip moves to its group.
    const jump = page.getByRole('navigation', { name: 'Jump to a state or province' });
    await expect(jump.getByRole('button', { name: 'Prince Edward Island' })).toBeVisible();
    await expect(jump.getByRole('button', { name: 'South Dakota' })).toBeVisible();
    await expect(jump).not.toContainText(/\d/);
    await jump.getByRole('button', { name: 'South Dakota' }).click();
    await expect(page.getByRole('heading', { name: /^South Dakota/ })).toBeFocused();
    // The rest of Canada before the rest of the region (sort=province), another country named.
    const titles = await page.locator('.wh__group-title').allTextContents();
    const pe = titles.findIndex((title) => title.includes('Prince Edward Island'));
    const sd = titles.findIndex((title) => title.includes('South Dakota'));
    expect(pe).toBeGreaterThanOrEqual(0);
    expect(sd).toBeGreaterThan(pe);
    expect(titles[sd]).toContain('United States');

    // "Also in a deck core" (up to 3): it opens the deck core.
    const cores = page.getByRole('region', { name: /Also in a deck core/ });
    await expect(cores.getByRole('link').first()).toBeVisible();
    await expect(cores).not.toContainText(/\d+ (holders|copies)/);

    // A holder's row: the note in its description, the price as typed, Message to the drawer.
    const southRow = page.getByTestId('holder-row').filter({ hasText: south.collector.handle });
    await expect(southRow.first()).toContainText('$20.00');
    await expect(southRow.first()).toContainText('NM, ships tracked in a top loader.');
    await southRow.first().getByTestId('holder-message').click();
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('pinned-bar')).toContainText('Lantern Fox Spirit');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    void island;

    // "I have this card": Inventory's Add drawer over the page, on the chosen printing.
    await page.goto(`/cards/${cardId}?printing=${fox}`);
    await page.getByTestId('card-i-have').click();
    const add = page.getByRole('dialog', { name: 'Add cards' });
    await expect(add).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/cards/${cardId}`));
    await add.getByTestId('add-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Saved' })).toBeVisible();
    await add.getByTestId('add-done').click();
    await expect(add).toBeHidden();
    await expect(page.getByTestId('card-i-have')).toBeFocused();
    const items = await request.get(`${API_URL}/api/v1/inventory/items`, {
      headers: authHeader(viewer.idToken),
    });
    const body = (await items.json()) as { items: { printing: { id: string } }[] };
    expect(body.items.map((item) => item.printing.id)).toContain(fox);

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });

  test('a set page adds several cards at once; a binder sorts by price', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const seller = await createSeller(request, { countryCode: 'US', subdivisionCode: 'US-SD' });
    const viewer = await createViewer(request);
    await signInThroughUi(page, viewer.email, viewer.password);

    // "Add from this set" (spec 7.5, owner check): steppers, Private or Public, then one toast.
    const fox = await printingIdOf(request, viewer.idToken, 'AZR-EN011');
    const detail = await request.get(`${API_URL}/api/v1/printings/${fox}`, {
      headers: authHeader(viewer.idToken),
    });
    const setId = ((await detail.json()) as { set: { id: string } }).set.id;
    await page.goto(`/sets/${setId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Azure Dawn' })).toBeVisible();
    await page.getByTestId('add-from-set').click();
    await page.getByRole('button', { name: 'One more AZR-EN001' }).first().click();
    await page.getByRole('button', { name: 'One more AZR-EN001' }).first().click();
    await page.getByRole('button', { name: 'One more AZR-EN011' }).first().click();
    const footer = page.getByTestId('set-add-footer');
    await expect(footer).toContainText('3 cards');
    await footer.getByRole('radio', { name: 'Public' }).click();
    await footer.getByTestId('set-add-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: '3 cards added' })).toBeVisible();
    await expect(footer).toHaveCount(0);
    // The footer is gone: the focus is back on "Add from this set" (A15).
    await expect(page.getByTestId('add-from-set')).toBeFocused();
    // "Who has cards of this set" lists that set's cards on Search › Cards (spec 7.5, U4).
    await page.getByRole('link', { name: 'Who has cards of this set' }).click();
    await expect(page).toHaveURL(new RegExp(`/search\\?.*set=${setId}`));
    await expect(page.getByTestId('set-chip')).toContainText('Azure Dawn · AZR');
    await expect(
      page.getByTestId('set-card-row').filter({ hasText: 'Azure-Eyes Sky Dragon' }),
    ).toBeVisible();
    await page.getByTestId('set-chip').click();
    await expect(page).not.toHaveURL(/set=/);
    const items = await request.get(`${API_URL}/api/v1/inventory/items`, {
      headers: authHeader(viewer.idToken),
    });
    const body = (await items.json()) as {
      items: { quantity: number; visibility: string; printing: { printingCode: string } }[];
    };
    const copies = body.items.reduce((sum, item) => sum + item.quantity, 0);
    expect(copies).toBe(3);
    expect(body.items.every((item) => item.visibility === 'PUBLIC')).toBe(true);

    // A public binder (spec 8.2): the sort pill reorders the cards (Price: the lowest first).
    await page.goto(`/binders/${seller.binder.id}`);
    await expect(page.getByRole('heading', { level: 1, name: seller.binder.name })).toBeVisible();
    const tiles = page.getByTestId('binder-card');
    await expect(tiles).toHaveCount(2);
    await page.getByRole('button', { name: 'Sort: Recently added' }).click();
    await page.getByRole('menuitemradio', { name: 'Price' }).click();
    await expect(page).toHaveURL(/sort=price/);
    await expect(tiles.first()).toContainText('$5.00');
    await expect(page.getByTestId('binder-message')).toHaveText(
      `Message ${seller.collector.handle}`,
    );
    // The deck core page: the seller card, Message, and nothing about payments.
    await page.goto(`/binders/${seller.core.id}`);
    await expect(page.getByRole('heading', { level: 1, name: seller.core.name })).toBeVisible();
    await expect(page.getByText('$95').first()).toBeVisible();
    await expect(page.getByTestId('binder-message')).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(/checkout|buyer protection|escrow/i);
  });

  test('below 960 Search opens on the map card; a tap on a state shows its card, then its binders', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const viewer = await createViewer(request);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const phone = await context.newPage();
    try {
      await stubCardImages(phone);
      await forbidMapProviders(phone);
      await signInThroughUi(phone, viewer.email, viewer.password);
      await phone.goto('/search');
      // Search's first view (board W29): the Cards field, then the map card (spec 16).
      await expect(
        phone.getByRole('combobox', { name: /Search .* cards by name or code/ }),
      ).toBeVisible();
      await expect(phone.getByTestId('boundary-map')).toBeVisible();
      await expect(phone.getByText('Pick a state on the map to see its binders.')).toBeVisible();
      await expect(phone.locator('.leaflet-overlay-pane path[data-code="CA-QC"]')).toBeAttached();
      const point = await statePoint(phone, 'CA-QC');
      await phone.touchscreen.tap(point.x, point.y);
      const card = phone.getByRole('region', { name: 'Chosen state or province' });
      await expect(card).toContainText('Quebec');
      await card.getByRole('button', { name: 'See binders' }).click();
      await expect(phone).toHaveURL(/tab=binders.*state=CA-QC|state=CA-QC.*tab=binders/);
    } finally {
      await context.close();
    }
  });
});
