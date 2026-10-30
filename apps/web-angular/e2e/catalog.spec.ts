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
 * Card catalog (Phase 2; the card and set pages of web stage WD) against the real local stack:
 * top-bar autocomplete to Who has this card (no card text or market price, the printing picker,
 * the wishlist toggle), set pages, filters kept in the URL, and printing-code search. Uses the fictional seed catalog imported at API startup (`db/seed/catalog/*.json`).
 *
 * The catalog is public; most tests still sign in a fresh collector so their API calls count
 * against that account's rate limit instead of the anonymous per-IP budget the whole suite shares.
 * The not-found test stays anonymous to cover signed-out visitors.
 */

/** The top-bar autocomplete (a deferred chunk; waits until it replaced the plain field). */
/** The top bar's search (web redesign WA, spec 4.4). */
function topSearch(page: Page) {
  return page.getByRole('banner').getByRole('combobox', { name: /^Search Yu-Gi-Oh! cards/ });
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
    await expect(page).toHaveURL(/:\d+\/(\?region=[a-z-]+)?$/);
    const search = topSearch(page);
    // Specific enough to rank the fictional card first when the real Yu-Gi-Oh! catalog is
    // imported locally (it has an "Azure-Eyes Silver Dragon").
    await search.fill('azure-eyes sky');
    const option = page.getByRole('option', { name: /Azure-Eyes Sky Dragon/ }).first();
    await expect(option).toBeVisible();
    // No counts and no game label in the rows (spec 4.4); the last row searches binders.
    await expect(option).not.toContainText('Yu-Gi-Oh!');
    await expect(
      page.getByRole('option', { name: /Search binders and deck cores for ‘azure-eyes sky’/ }),
    ).toBeVisible();

    // Keyboard only: highlight the first suggestion and open it.
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Azure-Eyes Sky Dragon' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Azure-Eyes Sky Dragon · OrenjiTrade');
    // Who has this card (spec 7, board W7): no card text, no attributes and no market price
    // (decision 10); "Check TCGplayer price" is a plain link to a search, nothing fetched.
    await expect(page.getByText('Monster · Normal')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Attributes' })).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText(/42\.00 CAD|market price/i);
    await expect(page.getByTestId('tcgplayer-link')).toHaveAttribute(
      'href',
      'https://www.tcgplayer.com/search/yugioh/product?q=Azure-Eyes%20Sky%20Dragon',
    );
    await expect(page.getByTestId('tcgplayer-link')).toHaveAttribute('target', '_blank');
    await expect(
      page.getByRole('heading', { level: 2, name: /Who has this card in Americas \(North\)/ }),
    ).toBeVisible();
    await expect(page.getByText('First printed in Azure Dawn')).toBeVisible();

    // "Any printing ▾": a listbox with a filter and rarity chips, no counts; picking the French
    // printing changes the art and the list.
    const pill = page.getByTestId('printing-pill');
    await expect(pill).toHaveText(/Any printing/);
    await pill.click();
    const picker = page.getByRole('dialog', { name: 'Which printing' });
    await expect(picker.getByRole('option')).toHaveCount(3);
    await expect(picker).not.toContainText(/\d+ (holders|copies|listings)/);
    await picker.getByRole('searchbox', { name: 'Set code or set name' }).fill('fr001');
    await expect(picker.getByRole('option')).toHaveCount(2);
    await picker
      .getByRole('option', { name: /AZR-FR001 · Azure Dawn · 2024 · Ultra Rare/ })
      .click();
    await expect(picker).toBeHidden();
    await expect(page).toHaveURL(/printing=[0-9a-f-]{36}/);
    await expect(pill).toHaveText(/AZR-FR001/);
    await expect(pill).toBeFocused();
    await expect(page.getByText('AZR-FR001 only.', { exact: false })).toBeVisible();

    // The wishlist toggle: off, "Add to wishlist" adds an "Any printing" wish at once; on, a
    // second click opens Edit wish.
    const toggle = page.getByTestId('card-wish-toggle');
    await expect(toggle).toHaveText(/Add to wishlist/);
    await toggle.click();
    await expect(toggle).toHaveText(/On your wishlist/);
    // Once on, it opens Edit wish (a dialog), not a pressed state.
    await expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
    await toggle.click();
    const wishDialog = page.getByRole('dialog', { name: 'Edit wish' });
    await expect(wishDialog.getByTestId('wish-card')).toContainText('Azure-Eyes Sky Dragon');
    await expect(wishDialog.getByRole('combobox', { name: 'Which copy' })).toContainText(
      'Any printing',
    );
    await expect(wishDialog).not.toContainText(/≈|\d+\.\d\d (CAD|USD)/);
    await wishDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(wishDialog).toBeHidden();
    // Edit wish removes it, after "You stop getting alerts for it." (spec 6.6).
    await toggle.click();
    await wishDialog.getByRole('button', { name: 'Remove from wishlist' }).click();
    const confirmRemove = page.getByRole('dialog', { name: 'Remove Azure-Eyes Sky Dragon?' });
    await expect(confirmRemove).toContainText('You stop getting alerts for it.');
    await confirmRemove.getByRole('button', { name: 'Remove from wishlist' }).click();
    await expect(wishDialog).toBeHidden();
    await expect(toggle).toHaveText(/Add to wishlist/);

    // A wishlist alert for "any printing in a rarity" links with `?rarity=`: the pill says so.
    const cardPath = new URL(page.url()).pathname;
    await page.goto(`${cardPath}?rarity=Ultra%20Rare`);
    await expect(pill).toHaveText(/Any Ultra Rare/);
    await expect(page.getByText('Every Ultra Rare printing.', { exact: false })).toBeVisible();

    // The picture is a real API placeholder image, at most 160 CSS pixels wide (ADR 0015).
    const hero = page.getByRole('img', { name: 'Azure-Eyes Sky Dragon' }).first();
    const src = await hero.getAttribute('src');
    expect(src).toContain(`${API_URL}/api/v1/public/placeholder-images/yugioh/`);
    expect((await hero.boundingBox())!.width).toBeLessThanOrEqual(160);
    // Sent with the collector's token so it counts against the account, not the shared
    // anonymous per-IP budget.
    const image = await request.get(src!, { headers: authHeader(collector.idToken) });
    expect(image.ok()).toBeTruthy();
    expect(image.headers()['content-type']).toContain('image/svg+xml');

    // The set page (spec 7.5): the code, the name, the release and the printings; a tile opens
    // the card page on that printing.
    await page.getByRole('link', { name: 'Azure Dawn' }).first().click();
    await expect(page).toHaveURL(/\/sets\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Azure Dawn' })).toBeVisible();
    await expect(page).toHaveTitle('Azure Dawn · OrenjiTrade');
    await expect(page.getByText(/Released .* · \d+ printings/)).toBeVisible();
    const tiles = page.getByRole('list', { name: 'Printings of this set' });
    await expect(tiles).toContainText('AZR-EN011');
    await tiles.getByRole('link', { name: /^Azure-Eyes Sky Dragon, AZR-EN001/ }).click();
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}\?printing=[0-9a-f-]{36}$/);
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
    await expect(page).toHaveURL(/\/cards\?text=AZR-EN011$/);
    // The catalogue's text survives a reload (an old `/cards?q=` link opens Search instead).
    await page.reload();
    await expect(page).toHaveURL(/\/cards\?text=AZR-EN011$/);
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
    const printing = page.getByRole('option', { name: /Lantern Fox Spirit, AZR-EN011/ }).first();
    await expect(printing).toContainText('AZR-EN011');
    await search.press('ArrowDown');
    await search.press('Enter');
    // One printing with the code opens it preselected; a code several printings share opens on
    // "Any printing" (spec 4.4: the recorded first-printing defect).
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}\?printing=([0-9a-f-]{36}|any)$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Lantern Fox Spirit' })).toBeVisible();

    // Enter without choosing a suggestion searches the whole catalog.
    // "sky dragon", not "dragon": with the real Yu-Gi-Oh! catalog imported locally, more than a
    // page of real dragons would push the fictional card off the first page.
    await search.fill('sky dragon');
    await expect(
      page.getByRole('option', { name: /Search binders and deck cores for ‘sky dragon’/ }),
    ).toBeVisible();
    await search.press('Enter');
    // Free text opens Search › Cards (spec 4.4) with the text in its field and the same results.
    await expect(page).toHaveURL(/\/search\?tab=cards&q=sky(%20|\+)dragon/);
    const pane = page.getByRole('combobox', { name: 'Search Yu-Gi-Oh! cards by name or code' });
    await expect(pane).toHaveValue('sky dragon');
    await expect(page.getByRole('option', { name: /Azure-Eyes Sky Dragon/ }).first()).toBeVisible();

    // The Search tab shows the first matching cards; Enter opens the first one.
    await page.goto('/search?q=lantern');
    await expect(page.getByRole('option', { name: 'Lantern Fox Spirit' }).first()).toBeVisible();
    await pane.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Lantern Fox Spirit' })).toBeVisible();

    // An unknown set gets a not-found state with a way back.
    await page.goto('/sets/not-a-set');
    await expect(
      page.getByRole('heading', { name: "This set isn't in the catalog" }),
    ).toBeVisible();
  });

  test('signed-out visitors get a friendly not-found state for an unknown card', async ({
    page,
  }) => {
    await page.goto('/cards/00000000-0000-4000-8000-000000000000');
    await expect(
      page.getByRole('heading', { name: "This card isn't in the catalog" }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Search cards' })).toHaveAttribute(
      'href',
      '/search?tab=cards',
    );
  });
});
