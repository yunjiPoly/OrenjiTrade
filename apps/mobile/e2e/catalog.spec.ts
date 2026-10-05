import { expect, test } from './support/fixtures';
import {
  API_URL,
  createOnboardedCollector,
  openInApp,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/**
 * Mobile Phase 2 (card catalog) against the real stack and the mock catalog of the isolated
 * database (fictional seed cards, never a real provider): the Search tab (live search, game and
 * schema filters, printing codes, recent searches) and the card detail (printings, market price,
 * API pictures only).
 */
test.describe('mobile catalog', () => {
  requireStack();

  test('search the catalog, filter, open a card and switch printings', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'cat', 'Mobile Catalog');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Search');
    const search = screen(page, 'search');
    // The whole catalog first (the 4 seed games), then a typo-tolerant search.
    await expect(search.getByTestId('search-count')).toHaveText(/^\d+ cards$/, { timeout: 30_000 });
    await search.getByLabel('Find a card').fill('emberfang');
    await expect(search.getByTestId('search-count')).toHaveText(/cards? for “emberfang”/);
    await expect(search.getByRole('link', { name: 'Emberfang Fox VMAX' })).toBeVisible();
    await expect(search.getByRole('link', { name: 'Emberfang Fox', exact: true })).toBeVisible();

    // Game pill, then a language from the game schema: only cards with a French printing.
    await search.getByRole('radio', { name: 'Pokémon' }).click();
    await search.getByRole('button', { name: 'Filters' }).click();
    const filters = page.getByTestId('card-filters');
    await filters.getByRole('radio', { name: 'French' }).click();
    await filters.getByRole('button', { name: 'Show results' }).click();
    await expect(search.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
    await expect(search.getByRole('link', { name: 'Emberfang Fox VMAX' })).toBeVisible();
    await expect(search.getByRole('link', { name: 'Emberfang Fox', exact: true })).toHaveCount(0);

    // Every picture is an API picture (cached artwork or placeholder), never a provider URL.
    const sources = await search
      .locator('img')
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.startsWith(`${API_URL}/api/v1/public/`), source).toBe(true);
    }

    await search.getByRole('link', { name: 'Emberfang Fox VMAX' }).click();
    const card = screen(page, 'card');
    await expect(card.getByTestId('card-name')).toHaveText('Emberfang Fox VMAX', {
      timeout: 30_000,
    });
    await expect(card.getByText('Printings (2)')).toBeVisible();
    await expect(card.getByTestId('card-attributes')).toContainText('320');
    // The English holo has a market price; the French reverse holo has none.
    await expect(card.getByTestId('card-price')).toContainText('38.00');
    await card.getByRole('radio', { name: /French/ }).click();
    await expect(page).toHaveURL(/\?printing=/);
    await expect(card.getByTestId('card-price')).toHaveText(
      'No market price for this printing yet.'
    );
    await expect(card.getByTestId('card-selected-printing')).toContainText('Reverse holo');

    // The search is remembered on this device (also after a reload).
    await page.goto('/search');
    const back = screen(page, 'search');
    await expect(back.getByRole('button', { name: 'Search again for emberfang' })).toBeVisible({
      timeout: 30_000,
    });
    await back.getByRole('button', { name: 'Search again for emberfang' }).click();
    await expect(back.getByTestId('search-count')).toHaveText(/for “emberfang”/);
  });

  test('a printing code finds its card; an unknown card says so', async ({ page, request }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'code', 'Mobile Codes');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByLabel('Find a card').fill('AZR-EN001');
    await expect(search.getByText('Printing code match')).toBeVisible({ timeout: 30_000 });
    await expect(search.getByRole('link', { name: 'Azure-Eyes Sky Dragon' })).toBeVisible();

    await search.getByLabel('Find a card').fill('zzzqqqxxx');
    await expect(search.getByText('No cards match')).toBeVisible({ timeout: 30_000 });
    await search.getByRole('button', { name: 'Clear search and filters' }).click();
    await expect(search.getByTestId('search-count')).toHaveText(/^\d+ cards$/);

    await openInApp(page, '/cards/00000000-0000-4000-8a00-ffffffffffff');
    await expect(screen(page, 'card').getByText('Card not found')).toBeVisible({
      timeout: 30_000,
    });
  });
});
