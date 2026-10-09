import { Locator, Page, Response, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
} from './support/inventory';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
} from './support/stack';

/**
 * Card pictures (ADR 0015) on every main card surface, against the real local stack and the
 * fictional seed catalog: the API serves its own placeholder pictures, so this runs offline.
 * Every picture must come from the API (OrenjiTrade's image routes), render with a real natural
 * size, and nothing may point at YGOPRODeck's image host: no request, no `img` src and no JSON
 * answer (re-host-only provider, never hotlinked). Unlike the other specs, the placeholder
 * pictures are NOT stubbed here: their natural size is what is checked.
 */

const PROVIDER_HOST = /(^|[/.])ygoprodeck\.com/i;
const PROVIDER_IMAGES = 'images.ygoprodeck.com';
const OWN_PICTURE = new RegExp(
  `^${API_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/v1/public/(placeholder-images|card-images)/`,
);

interface ProviderGuard {
  /** Waits for the pending answer reads, then asserts nothing reached or named the provider. */
  verify(): Promise<void>;
}

/**
 * Aborts and records any request to a YGOPRODeck host, and scans every JSON answer of the API for
 * the provider's image host.
 */
async function guardProvider(page: Page): Promise<ProviderGuard> {
  const requests: string[] = [];
  const leaks: string[] = [];
  const reads: Promise<void>[] = [];
  await page.route(
    (url) => PROVIDER_HOST.test(url.hostname),
    (route) => {
      requests.push(route.request().url());
      return route.abort();
    },
  );
  page.on('request', (request) => {
    if (PROVIDER_HOST.test(new URL(request.url()).hostname)) {
      requests.push(request.url());
    }
  });
  page.on('response', (response: Response) => {
    if (!response.url().startsWith(API_URL)) {
      return;
    }
    if (!(response.headers()['content-type'] ?? '').includes('json')) {
      return;
    }
    reads.push(
      response
        .text()
        .then((body) => {
          if (body.includes(PROVIDER_IMAGES)) {
            leaks.push(response.url());
          }
        })
        .catch(() => undefined),
    );
  });
  return {
    async verify() {
      await Promise.all(reads);
      expect(requests, 'requests to a YGOPRODeck host').toEqual([]);
      expect(leaks, `API answers naming ${PROVIDER_IMAGES}`).toEqual([]);
    },
  };
}

/** No `img` of the page (card or not) points at the provider. */
async function expectNoProviderSources(page: Page): Promise<void> {
  const sources = await page
    .locator('img')
    .evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).currentSrc || image.getAttribute('src')),
    );
  expect(sources.filter((src) => src && PROVIDER_HOST.test(src))).toEqual([]);
}

/**
 * The card pictures in `scope`: at least `minimum` of them, the first `max` scrolled into view
 * (they load lazily) and rendered from an API picture URL with a non-zero natural size; none of
 * them failed to load.
 */
async function expectPictures(scope: Locator, minimum: number, max = 6): Promise<void> {
  const pictures = scope.locator('app-card-image img');
  await expect
    .poll(() => pictures.count(), { message: 'card pictures in the section' })
    .toBeGreaterThanOrEqual(minimum);
  const count = Math.min(await pictures.count(), max);
  for (let index = 0; index < count; index++) {
    const picture = pictures.nth(index);
    await picture.scrollIntoViewIfNeeded();
    expect(await picture.getAttribute('src')).toMatch(OWN_PICTURE);
    expect(await picture.getAttribute('alt')).not.toBeNull();
    await expect
      .poll(
        () =>
          picture.evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0)),
        { message: `natural width of card picture ${index + 1}` },
      )
      .toBeGreaterThan(0);
    // The frame (the image's host element) reports it loaded: the skeleton is gone.
    await expect(picture.locator('xpath=..')).toHaveAttribute('data-state', 'loaded');
  }
  await expect(scope.locator('app-card-image[data-state="error"]')).toHaveCount(0);
}

test.describe('card pictures', () => {
  requireStack();

  test('catalog, suggestions, card detail and set pages show API pictures, never the provider', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const guard = await guardProvider(page);
    const collector = await createOnboardedCollector(request, 'pictures');
    await signInThroughUi(page, collector.email, collector.password);

    // Top-bar suggestions: one picture per card or printing entry.
    const search = page.getByRole('banner').getByRole('combobox', { name: 'Search cards' });
    await search.fill('azure');
    await expect(page.getByRole('option', { name: /Azure-Eyes Sky Dragon/ }).first()).toBeVisible();
    await expectPictures(page.getByRole('listbox'), 1, 3);
    await search.press('Escape');

    // The catalog grid, narrowed to the fictional Azure Dawn set: the real Yu-Gi-Oh! catalog
    // (npm run catalog:import) may fill the unfiltered first page locally.
    await page.goto('/cards?game=yugioh&set=AZR');
    await expect(page.getByRole('heading', { level: 1, name: 'Card catalog' })).toBeVisible();
    await expectPictures(page.getByRole('main'), 4, 6);
    await expectNoProviderSources(page);

    // Card detail: the hero (eager), the printings table and the provider attribution.
    await page.getByRole('link', { name: 'Azure-Eyes Sky Dragon' }).first().click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Azure-Eyes Sky Dragon' }),
    ).toBeVisible();
    const hero = page.getByTestId('card-hero-image');
    await expectPictures(hero.locator('xpath=..'), 1, 1);
    await expect(hero.locator('img')).toHaveAttribute('loading', 'eager');
    await expect(hero.locator('img')).toHaveAttribute('alt', /^Azure-Eyes Sky Dragon, printing /);
    const box = await hero.boundingBox();
    expect(box && box.width > 100 && box.height > box.width, 'card-shaped hero').toBeTruthy();
    await expectPictures(
      page.getByRole('table', { name: 'Printings of Azure-Eyes Sky Dragon' }),
      2,
      2,
    );
    await expect(page.getByRole('main').getByTestId('card-data-attribution')).toContainText(
      'Card data and images courtesy of YGOPRODeck',
    );
    await expect(page.getByRole('contentinfo').getByTestId('card-data-attribution')).toContainText(
      '4K Media Inc.',
    );
    await expectNoProviderSources(page);

    // The set page: its cards and the checklist.
    await page
      .getByRole('region', { name: 'Selected printing' })
      .getByRole('link', { name: 'Azure Dawn (AZR)' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Azure Dawn' })).toBeVisible();
    await expectPictures(page.getByRole('list', { name: 'Cards in this set' }), 2, 4);
    await expectPictures(page.getByRole('table', { name: 'Azure Dawn checklist' }), 2, 4);
    await expectNoProviderSources(page);

    await guard.verify();
  });

  test('inventory, public binder, profile and wishlist pictures come from the API', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const guard = await guardProvider(page);
    const owner = await createOnboardedCollector(request, 'picowner', { location: true });
    await apiUpdatePrivacy(request, owner.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, owner.idToken, {
      name: 'E2E picture binder',
      kind: 'TRADE',
      description: 'Fictional binder for the card pictures E2E spec.',
    });
    const dragon = await printingIdOf(request, owner.idToken, 'AZR-EN001');
    await apiCreateItem(request, owner.idToken, {
      printingId: dragon,
      binderId: binder.id,
      availability: 'TRADE_OR_SALE',
      askingPrice: 45,
      acceptsOffers: true,
    });
    await apiCreateItem(request, owner.idToken, {
      printingId: await printingIdOf(request, owner.idToken, 'SVX-001'),
      binderId: binder.id,
      availability: 'SALE',
      askingPrice: 38,
    });
    await apiPublishBinder(request, owner.idToken, binder.id, 'UNTIL_DISABLED');
    const suggest = await request.get(`${API_URL}/api/v1/cards/suggest`, {
      headers: authHeader(owner.idToken),
      params: { q: 'Lantern Fox Spirit', limit: 5 },
    });
    expect(suggest.ok(), 'suggest Lantern Fox Spirit').toBeTruthy();
    const fox = ((await suggest.json()) as { kind: string; id: string; name: string }[]).find(
      (entry) => entry.kind === 'CARD' && entry.name === 'Lantern Fox Spirit',
    );
    expect(fox, 'Lantern Fox Spirit in the seed catalog').toBeTruthy();
    const wish = await request.post(`${API_URL}/api/v1/wishlist`, {
      headers: authHeader(owner.idToken),
      data: { cardId: fox!.id },
    });
    expect(wish.status(), 'POST /wishlist').toBe(201);

    await signInThroughUi(page, owner.email, owner.password);

    // Inventory grid: one picture per item, named after the card.
    await page.goto('/inventory');
    await expect(page.getByTestId('inventory-count')).toHaveText(/2 cards/);
    await expectPictures(page.getByRole('main'), 2, 2);
    await expect(
      page.getByTestId('inventory-item').first().locator('app-card-image img'),
    ).toHaveAttribute('alt', /\S/);
    await expectNoProviderSources(page);

    // The public binder page.
    await page.goto(`/binders/${binder.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E picture binder' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Azure-Eyes Sky Dragon');
    await expectPictures(page.getByRole('main'), 2, 4);
    await expectNoProviderSources(page);

    // The collector profile: public cards (and the binder preview).
    await page.goto(`/collectors/${owner.handle}`);
    await expect(page.getByRole('heading', { level: 1, name: owner.displayName })).toBeVisible();
    await expectPictures(page.getByRole('list', { name: 'Public cards' }), 2, 2);
    await expectNoProviderSources(page);

    // The wishlist.
    await page.goto('/wishlist');
    await expect(page.locator('[data-wish]')).toHaveCount(1);
    await expectPictures(page.locator('[data-wish]'), 1, 1);
    await expect(page.locator('[data-wish] app-card-image img')).toHaveAttribute(
      'alt',
      'Lantern Fox Spirit',
    );
    await expectNoProviderSources(page);

    await guard.verify();
  });
});
