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
 * Mobile Phase 2 (card catalog) on Search since stage R5 (mockup screen 12) against the real stack
 * and the mock catalog of the isolated database (fictional seed cards, never a real provider):
 * the card search while typing (game chips, the typed part highlighted, printing codes, recent
 * searches on this phone with their privacy line) and the card page (API pictures only).
 */
test.describe('mobile catalog', () => {
  requireStack();

  test('type a card, filter by game, open it, and find the search again on this phone', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'cat', 'Mobile Catalog');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByRole('search', { name: /Card name or code/ }).click({ timeout: 30_000 });
    // The empty box: only the privacy line before the first search.
    await expect(search.getByTestId('recent-searches-privacy')).toHaveText(
      'Only you see your searches. You can turn this off in Settings › Privacy.'
    );
    await search.getByLabel('Card name or code').fill('emberfang');
    const vmax = search.getByRole('button', { name: 'Emberfang Fox VMAX, Pokémon' });
    await expect(vmax).toBeVisible({ timeout: 30_000 });
    await expect(search.getByRole('button', { name: 'Emberfang Fox, Pokémon' })).toBeVisible();
    // The typed part highlighted; no count, no printings, no type line.
    await expect(vmax.getByText('Emberfang', { exact: true })).toBeVisible();
    await expect(search).not.toContainText(/printings?|\d+ cards/);

    // The game chips are the only filter.
    await search.getByRole('radio', { name: 'Yu-Gi-Oh!' }).click();
    await expect(vmax).toHaveCount(0, { timeout: 30_000 });
    await search.getByRole('radio', { name: 'All games' }).click();
    await expect(vmax).toBeVisible({ timeout: 30_000 });
    await expect(search.getByRole('button', { name: /Filters/ })).toHaveCount(0);

    // Every picture is an API picture (cached artwork or placeholder), never a provider URL.
    const sources = await search
      .locator('img')
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.startsWith(`${API_URL}/api/v1/public/`), source).toBe(true);
    }

    await vmax.click();
    const card = screen(page, 'card');
    await expect(card.getByTestId('card-name')).toHaveText('Emberfang Fox VMAX', {
      timeout: 30_000,
    });
    await expect(card.getByTestId('card-game')).toHaveText('POKÉMON');

    // The search is remembered on this device (also after a reload).
    await page.goto('/search?typing=1');
    const back = screen(page, 'search');
    await expect(back.getByRole('button', { name: 'Search again for emberfang' })).toBeVisible({
      timeout: 30_000,
    });
    await back.getByRole('button', { name: 'Search again for emberfang' }).click();
    await expect(back.getByRole('button', { name: 'Emberfang Fox VMAX, Pokémon' })).toBeVisible({
      timeout: 30_000,
    });
    await back.getByLabel('Card name or code').fill('');
    await back.getByRole('button', { name: 'Clear recent searches' }).click();
    await expect(back.getByRole('button', { name: 'Search again for emberfang' })).toHaveCount(0);
  });

  test('a printing code finds its card; nothing matches says so; an unknown card says so', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'code', 'Mobile Codes');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByRole('search', { name: /Card name or code/ }).click({ timeout: 30_000 });
    await search.getByLabel('Card name or code').fill('AZR-EN001');
    await expect(
      search.getByRole('button', { name: 'Azure-Eyes Sky Dragon, Yu-Gi-Oh!' })
    ).toBeVisible({ timeout: 30_000 });

    await search.getByLabel('Card name or code').fill('zzzqqqxxx');
    await expect(search.getByTestId('search-no-match')).toHaveText(
      'No card matches “zzzqqqxxx”Try fewer letters, or the code printed on the card, like LAVD-EN008.',
      { timeout: 30_000 }
    );
    await search.getByRole('button', { name: 'Cancel' }).click();
    await expect(search.getByTestId('search-map')).toBeVisible();

    await openInApp(page, '/cards/00000000-0000-4000-8a00-ffffffffffff');
    await expect(screen(page, 'card').getByText('Card not found')).toBeVisible({
      timeout: 30_000,
    });
  });
});
