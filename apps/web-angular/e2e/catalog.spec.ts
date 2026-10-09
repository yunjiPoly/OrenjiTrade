import { Page, expect, test } from '@playwright/test';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Card catalog (Phase 2) against the real local stack: top-bar autocomplete to the card detail,
 * schema-driven attributes and printings, set pages, filters kept in the URL, and printing-code
 * search. Uses the fictional seed catalog imported at API startup (`db/seed/catalog/*.json`).
 *
 * The catalog is public; most tests still sign in a fresh collector so their API calls count
 * against that account's rate limit instead of the anonymous per-IP budget the whole suite shares.
 * The not-found test stays anonymous to cover signed-out visitors.
 */

/** The top-bar autocomplete (a deferred chunk; waits until it replaced the plain field). */
function topSearch(page: Page) {
  return page.getByRole('banner').getByRole('combobox', { name: 'Search cards' });
}

test.describe('card catalog', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('autocomplete leads to the card detail, its printings and its set', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'browse');
    await signInThroughUi(page, collector.email, collector.password);
    await expect(page).toHaveURL(/\/map(\?region=[a-z-]+)?$/);
    const search = topSearch(page);
    // Specific enough to rank the fictional card first when the real Yu-Gi-Oh! catalog is
    // imported locally (it has an "Azure-Eyes Silver Dragon").
    await search.fill('azure-eyes sky');
    const option = page.getByRole('option', { name: /Azure-Eyes Sky Dragon/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText('Yu-Gi-Oh!');
    await expect(option).toContainText('AZR-EN001');
    await expect(
      page.getByRole('option', { name: /See all results for “azure-eyes sky”/ }),
    ).toBeVisible();

    // Keyboard only: highlight the first suggestion and open it.
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Azure-Eyes Sky Dragon' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Azure-Eyes Sky Dragon · OrenjiTrade');
    await expect(page.getByText('Monster · Normal')).toBeVisible();

    // Attributes are rendered from the Yu-Gi-Oh! schema (labels, number formatting).
    const attributes = page.getByRole('region', { name: 'Attributes' });
    await expect(attributes.locator('[data-key="atk"]')).toContainText('ATK');
    await expect(attributes.locator('[data-key="atk"]')).toContainText('3,000');
    await expect(attributes.locator('[data-key="attribute"]')).toContainText('LIGHT');

    // Selected printing (first one) with its market price.
    const selected = page.getByRole('region', { name: 'Selected printing' });
    await expect(selected.getByRole('list', { name: 'Printing details' })).toContainText(
      'AZR-EN001',
    );
    await expect(selected).toContainText('Ultra Rare');
    await expect(selected).toContainText('1st Edition');
    await expect(page.getByTestId('selected-price')).toContainText('$42.00');

    // Printings table: pick the French printing.
    const printings = page.getByRole('table', { name: 'Printings of Azure-Eyes Sky Dragon' });
    await expect(printings.getByRole('row')).toHaveCount(3);
    await expect(printings).toContainText('French');
    await printings.getByRole('button', { name: 'Show printing AZR-FR001' }).click();
    await expect(page).toHaveURL(/printing=[0-9a-f-]{36}/);
    await expect(page.getByTestId('selected-price')).toContainText('$33.60');
    await expect(selected).toContainText('Unlimited');

    // "Who has this in my region" opens the card holders of the browsed region (ADR 0017).
    await expect(page.getByRole('link', { name: 'Who has this in my region' })).toHaveAttribute(
      'href',
      /^\/search\?card=[0-9a-f-]{36}$/,
    );
    // "Add to wishlist" opens the wishlist dialog on this card with the chosen printing checked
    // in the printing picker.
    await page.getByRole('button', { name: 'Add to wishlist' }).click();
    const wishDialog = page.getByRole('dialog', { name: 'Add to wishlist' });
    await expect(wishDialog.getByTestId('wish-card')).toContainText('Azure-Eyes Sky Dragon');
    await expect(wishDialog.getByRole('radio', { name: /^AZR-FR001,/ })).toBeChecked();
    await expect(wishDialog.getByRole('radio', { name: /^Any printing/ })).not.toBeChecked();
    await wishDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(wishDialog).toBeHidden();

    // The hero picture is a real API placeholder image.
    const hero = page.getByRole('img', { name: /Azure-Eyes Sky Dragon, printing AZR-FR001/ });
    const src = await hero.getAttribute('src');
    expect(src).toContain(`${API_URL}/api/v1/public/placeholder-images/yugioh/`);
    // Sent with the collector's token so it counts against the account, not the shared
    // anonymous per-IP budget.
    const image = await request.get(src!, { headers: authHeader(collector.idToken) });
    expect(image.ok()).toBeTruthy();
    expect(image.headers()['content-type']).toContain('image/svg+xml');

    // The set page lists the set's cards and its checklist.
    await selected.getByRole('link', { name: 'Azure Dawn (AZR)' }).click();
    await expect(page).toHaveURL(/\/sets\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Azure Dawn' })).toBeVisible();
    await expect(page).toHaveTitle('Azure Dawn · OrenjiTrade');
    await expect(
      page.getByRole('list', { name: 'Cards in this set' }).getByRole('link', {
        name: 'Lantern Fox Spirit',
      }),
    ).toBeVisible();
    const checklist = page.getByRole('table', { name: 'Azure Dawn checklist' });
    await expect(checklist).toContainText('AZR-EN011');
    await checklist.getByRole('link', { name: 'Azure-Eyes Sky Dragon' }).first().click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Azure-Eyes Sky Dragon' }),
    ).toBeVisible();
  });

  test('filters narrow the catalog and live in the URL', async ({ page, request }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'catalog');
    await signInThroughUi(page, collector.email, collector.password);

    await page.goto('/cards');
    await expect(page.getByRole('heading', { level: 1, name: 'Card catalog' })).toBeVisible();
    await expect(page.getByTestId('catalog-count')).toContainText('cards');
    const games = page.getByRole('group', { name: 'Game' });
    await expect(games.getByRole('button', { name: 'All games' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('combobox', { name: 'Set' })).toBeDisabled();

    // Game -> set -> rarity.
    await games.getByRole('button', { name: 'Yu-Gi-Oh!' }).click();
    await expect(page).toHaveURL(/game=yugioh/);
    await expect(games.getByRole('button', { name: 'Yu-Gi-Oh!' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('combobox', { name: 'Set' }).click();
    await page.getByRole('option', { name: 'Azure Dawn (AZR)' }).click();
    await expect(page).toHaveURL(/set=AZR/);
    await page.getByRole('combobox', { name: 'Rarity' }).click();
    // Exact: the Yu-Gi-Oh! schema also lists Platinum, Prismatic, Gold... Secret Rare (V101).
    await page.getByRole('option', { name: 'Secret Rare', exact: true }).click();
    await expect(page).toHaveURL(/rarity=Secret(%20|\+)Rare/);
    const results = page.getByRole('list', { name: 'Search results' });
    await expect(page.getByTestId('catalog-count')).toHaveText(/^\s*1 card\b/);
    await expect(results.getByRole('link', { name: 'Lantern Fox Spirit' })).toBeVisible();

    // The URL is the state: a reload shows the same filters and results.
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Rarity' })).toContainText('Secret Rare');
    await expect(page.getByRole('combobox', { name: 'Set' })).toContainText('Azure Dawn (AZR)');
    await expect(results.getByRole('link', { name: 'Lantern Fox Spirit' })).toBeVisible();

    // Clearing keeps the query-less catalog; language and edition come from the game schema.
    await page.getByRole('button', { name: /Clear filters/ }).click();
    await expect(page).not.toHaveURL(/rarity=/);
    await games.getByRole('button', { name: 'Yu-Gi-Oh!' }).click();
    await page.getByRole('combobox', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'French' }).click();
    await expect(page).toHaveURL(/language=fr/);
    await expect(page.getByTestId('catalog-count')).toHaveText(/^\s*4 cards\b/);
    await expect(results.getByRole('link', { name: 'Chevalier Épée-Miroir' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Edition' }).click();
    await page.getByRole('option', { name: '1st Edition' }).click();
    await expect(page.getByRole('heading', { name: 'No cards match' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.getByTestId('catalog-count')).toContainText('cards');
  });

  test('printing codes find their card from the page search and the autocomplete', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'codes');
    await signInThroughUi(page, collector.email, collector.password);

    // Page search: an exact printing code short-circuits to that card.
    await page.goto('/cards');
    await page
      .getByRole('searchbox', { name: 'Card name, text or printing code' })
      .fill('AZR-EN011');
    await expect(page).toHaveURL(/q=AZR-EN011/);
    await expect(page.getByTestId('catalog-count')).toHaveText(/^\s*1 card\b/);
    await expect(page.getByText('Printing code match')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Search results' }).getByRole('link', {
        name: 'Lantern Fox Spirit',
      }),
    ).toBeVisible();

    // Autocomplete: a printing-code prefix suggests printings; choosing one preselects it.
    const search = topSearch(page);
    await search.fill('AZR-EN01');
    const printing = page.getByRole('option', { name: /Lantern Fox Spirit/ });
    await expect(printing).toContainText('Printing');
    await expect(printing).toContainText('AZR-EN011');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}\?printing=[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Lantern Fox Spirit' })).toBeVisible();
    // Both printings of the card share the code; the suggested one is the selected one.
    await expect(
      page.getByRole('button', { name: 'Show printing AZR-EN011', pressed: true }),
    ).toHaveCount(1);

    // Enter without choosing a suggestion searches the whole catalog.
    // "sky dragon", not "dragon": with the real Yu-Gi-Oh! catalog imported locally, more than a
    // page of real dragons would push the fictional card off the first page.
    await search.fill('sky dragon');
    await expect(
      page.getByRole('option', { name: /See all results for “sky dragon”/ }),
    ).toBeVisible();
    await search.press('Enter');
    await expect(page).toHaveURL(/\/cards\?q=sky(%20|\+)dragon$/);
    await expect(
      page.getByRole('list', { name: 'Search results' }).getByRole('link', {
        name: 'Azure-Eyes Sky Dragon',
      }),
    ).toBeVisible();

    // The Search tab shows the first matching cards.
    await page.goto('/search?q=lantern');
    await expect(page.getByRole('heading', { name: 'Cards for “lantern”' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lantern Fox Spirit' })).toBeVisible();

    // An unknown set gets a not-found state with a way back.
    await page.goto('/sets/not-a-set');
    await expect(page.getByRole('heading', { name: 'Set not found' })).toBeVisible();
  });

  test('signed-out visitors get a friendly not-found state for an unknown card', async ({
    page,
  }) => {
    await page.goto('/cards/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Card not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse the catalog' })).toHaveAttribute(
      'href',
      '/cards',
    );
  });
});
