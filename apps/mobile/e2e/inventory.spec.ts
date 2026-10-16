import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  PHOTO_PNG,
  apiAddItem,
  authHeader,
  createOnboardedCollector,
  openInApp,
  openTab,
  PLACES,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

interface Item {
  id: string;
  quantity: number;
  condition: string;
  conditionStated: boolean;
  finish: string;
  availability: string;
  acceptsOffers: boolean;
  askingPrice: number | null;
  askingPriceText: string | null;
  currency: string;
  visibility: string;
  publicNotes: string;
  images: { id: string }[];
  card: { name: string };
}

async function items(request: APIRequestContext, token: string): Promise<Item[]> {
  const response = await request.get(`${API_URL}/api/v1/inventory/items?size=50`, {
    headers: authHeader(token),
  });
  expect(response.ok(), 'GET /inventory/items').toBeTruthy();
  return ((await response.json()) as { items: Item[] }).items;
}

/**
 * Stage R2 of the phone redesign (owner spec 2026-10-14, section 6, mockup screens 1 to 9) against
 * the real stack: a fresh collector adds a card with a price in "% TCG" and a photo (Add cards →
 * typing → Choose the printing → Add to inventory), sees "Saved" and the row's Public tag, edits
 * it (the price switched to "$"; a save confirms it), deletes it and undoes the delete; then the
 * filter sheet narrows and sorts the list. The price switch and the tag are the owner's change of
 * 2026-10-16 (mockup v43).
 */
test.describe('mobile inventory (stage R2)', () => {
  requireStack();

  test('add a card with a price and a photo, see Saved, edit it, delete it and undo', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    // On the map, so that collectors of the region can really find a public card (the form's hint
    // says so only then).
    const collector = await createOnboardedCollector(request, 'inv', 'Mobile Inventory', {
      location: PLACES.quebec,
      discoverable: true,
    });
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Inventory');
    const inventory = screen(page, 'inventory');
    await expect(inventory.getByText('Your inventory is empty')).toBeVisible({ timeout: 30_000 });
    await inventory.getByRole('button', { name: 'Add cards' }).first().click();

    // Screen 3, then 4: the search first.
    const start = screen(page, 'add-cards-start');
    await expect(
      start.getByText('New cards start private. You choose what to publish.')
    ).toBeVisible();
    await expect(start.getByText('Coming later')).toBeVisible();
    await start.getByRole('search', { name: 'Card name or code' }).click();
    const typing = screen(page, 'add-cards-typing');
    await typing.getByLabel('Card name or code').fill('tidal otter');
    await expect(typing.getByText('CARDS', { exact: true })).toBeVisible({ timeout: 30_000 });
    await typing
      .getByRole('button', { name: /^Tidal Otterling, Pokémon · \d+ printings$/ })
      .click();

    // Screen 5: the reverse holo printing.
    const printing = screen(page, 'add-cards-printing');
    await expect(printing.getByText(/printings\. Pick the one on your card\./)).toBeVisible({
      timeout: 30_000,
    });
    await printing.getByRole('button', { name: /^SVX-025, .*Reverse Holo/i }).click();

    // Screen 6: the fields of the spec; the fixed values are not shown.
    const add = screen(page, 'add-item');
    await expect(add.getByTestId('card-header-name')).toHaveText('Tidal Otterling');
    await expect(add.getByLabel('Copies')).toHaveValue('1');
    await expect(add.getByRole('radio', { name: 'Private' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(add.getByText('Condition')).toHaveCount(0);
    await expect(add.getByText('Accepts offers')).toHaveCount(0);
    await add.getByRole('button', { name: 'One more' }).click();
    // The price: "$" the first time; "% TCG" takes a whole number.
    await expect(add.getByRole('radio', { name: 'Dollars' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await add.getByRole('radio', { name: 'Percent of the TCGplayer price' }).click();
    await expect(add.getByText('Percent of the TCGplayer market price.')).toBeVisible();
    await add.getByLabel('Asking price').fill('85');
    await add.getByRole('radio', { name: 'Public' }).click();
    await expect(add.getByText('Collectors in Americas (North) can find it.')).toBeVisible();
    await add.getByLabel('Public note').fill('NM, English, 1st, for trade');
    const chooser = page.waitForEvent('filechooser');
    await add.getByRole('button', { name: 'Add photos' }).click();
    await (await chooser).setFiles({ name: 'front.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(add.getByTestId('card-photos-count')).toHaveText('1 / 4');

    const upload = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/images')
    );
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    expect((await upload).status()).toBe(201);
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    await expect(snackbar(page)).toContainText('Tidal Otterling');
    await expect(snackbar(page).getByRole('button', { name: /^View/ })).toBeVisible();

    const [created] = await items(request, collector.idToken);
    expect(created).toMatchObject({
      quantity: 2,
      askingPriceText: '85% TCG',
      askingPrice: null,
      currency: 'CAD',
      condition: '',
      conditionStated: false,
      availability: 'TRADE_OR_SALE',
      acceptsOffers: false,
      finish: 'REVERSE_HOLO',
      visibility: 'PUBLIC',
      publicNotes: 'NM, English, 1st, for trade',
    });
    expect(created?.images).toHaveLength(1);

    // Screen 8: the row shows only the picture, name, code, who can see it, price and copies.
    const list = screen(page, 'inventory');
    const row = list.getByRole('button', {
      name: /^Tidal Otterling, SVX-025, Public, 85% TCG, 2 copies$/,
    });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('85% TCG');
    await expect(row).toContainText('×2');
    await expect(row.getByTestId(/-visibility$/)).toContainText('Public');
    await expect(row).not.toContainText(/Trade|Offers|Near Mint|not visible/);
    await expect(list.getByTestId('inventory-summary-totals')).toHaveText(
      '1 card · 2 copies · 1 public'
    );

    // Screen 7: Edit card, "No changes yet" until a change; a save confirms the card.
    await row.click();
    const edit = screen(page, 'edit-item');
    await expect(edit.getByTestId('card-header-name')).toHaveText('Tidal Otterling', {
      timeout: 30_000,
    });
    await expect(edit.getByLabel('Asking price')).toHaveValue('85');
    await expect(
      edit.getByRole('radio', { name: 'Percent of the TCGplayer price' })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(edit.getByTestId('card-photos-count')).toHaveText('1 / 4');
    const save = edit.getByTestId('edit-item-save');
    await expect(save).toHaveText('No changes yet');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    // The answer, not the toast: the "Saved" of the add may still be on screen.
    const patch = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' && response.url().includes('/inventory/items/')
    );
    // "$" clears the number (85% is not $85), then 12.50.
    await edit.getByRole('radio', { name: 'Dollars' }).click();
    await expect(edit.getByLabel('Asking price')).toHaveValue('');
    await edit.getByLabel('Asking price').fill('12.50');
    await expect(save).toHaveText('Save changes');
    await save.click();
    const patched = await patch;
    expect(patched.request().postDataJSON()).toEqual({ askingPriceText: '$12.50', confirm: true });
    expect(patched.status()).toBe(200);
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    const [edited] = await items(request, collector.idToken);
    expect(edited).toMatchObject({ askingPriceText: '$12.50', askingPrice: 12.5 });

    // Delete, asked in a sheet (Keep it first), then undone from the toast (screen 9).
    await screen(page, 'inventory')
      .getByRole('button', { name: /^Tidal Otterling, SVX-025, Public, \$12\.50, 2 copies$/ })
      .click();
    const again = screen(page, 'edit-item');
    await again.getByRole('button', { name: 'Delete this card' }).click();
    const sheet = page.getByTestId('edit-item-delete-sheet');
    await expect(sheet).toContainText('Delete Tidal Otterling?');
    await expect(sheet).toContainText(
      'It leaves your inventory and any binder. Its photos are deleted too.'
    );
    await sheet.getByRole('button', { name: 'Keep it' }).click();
    expect(await items(request, collector.idToken)).toHaveLength(1);
    await again.getByRole('button', { name: 'Delete this card' }).click();
    await page
      .getByTestId('edit-item-delete-sheet')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(snackbar(page)).toContainText('Card deleted', { timeout: 30_000 });
    await expect(screen(page, 'inventory').getByText('Your inventory is empty')).toBeVisible({
      timeout: 30_000,
    });
    expect(await items(request, collector.idToken)).toHaveLength(0);
    const restore = page.waitForResponse((response) => response.url().endsWith('/restore'));
    await snackbar(page).getByRole('button', { name: /^Undo/ }).click();
    expect((await restore).status()).toBe(200);
    await expect(snackbar(page)).toContainText('Card restored', { timeout: 30_000 });
    const [restored] = await items(request, collector.idToken);
    expect(restored).toMatchObject({
      quantity: 2,
      askingPriceText: '$12.50',
      publicNotes: 'NM, English, 1st, for trade',
      visibility: 'PUBLIC',
    });
    expect(restored?.images).toHaveLength(1);
    await expect(
      screen(page, 'inventory').getByRole('button', { name: /^Tidal Otterling, SVX-025/ })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('add a card from its card page, filter and sort the inventory in the sheet', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'inv2', 'Mobile Filters');
    // Two cards of another game, one with a plain amount, one with a text price.
    const fox = await printingIdOf(request, collector.idToken, 'PFT-002');
    await apiAddItem(request, collector, fox, {
      condition: undefined,
      conditionStated: false,
      askingPriceText: '$20',
    });
    await apiAddItem(request, collector, fox, {
      condition: undefined,
      conditionStated: false,
      askingPriceText: '90% TCG',
    });
    await signInThroughUi(page, collector.email, collector.password);

    // Add to inventory from the card page: the printing is preselected, the details open.
    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByLabel('Find a card').fill('Azure-Eyes');
    await search.getByRole('link', { name: 'Azure-Eyes Sky Dragon' }).click();
    const card = screen(page, 'card');
    await card.getByRole('button', { name: 'Add to inventory' }).click();
    const add = screen(page, 'add-item');
    await expect(add.getByTestId('card-header-name')).toHaveText('Azure-Eyes Sky Dragon', {
      timeout: 30_000,
    });
    // The comma is a decimal point: saved as "$12.50".
    await add.getByLabel('Asking price').fill('12,50');
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    await expect(snackbar(page)).toContainText('Azure-Eyes Sky Dragon', { timeout: 30_000 });
    // Back on the card page.
    await expect(screen(page, 'card').getByTestId('card-name')).toBeVisible();

    await openInApp(page, '/inventory');
    const inventory = screen(page, 'inventory');
    await expect(inventory.getByTestId('inventory-summary-totals')).toHaveText(
      '3 cards · 3 copies · 0 public',
      { timeout: 30_000 }
    );

    // Price, highest first: the plain amounts, then the text price.
    await inventory.getByRole('button', { name: 'Filter and sort' }).click();
    const sheet = page.getByTestId('inventory-filters');
    await expect(sheet.getByRole('button', { name: 'Show 3 cards' })).toBeVisible({
      timeout: 30_000,
    });
    await sheet.getByRole('radio', { name: 'Price' }).click();
    await sheet.getByRole('button', { name: 'Show 3 cards' }).click();
    const rows = inventory.getByRole('button', { name: /, (AZR|PFT)-/ });
    await expect(rows.first()).toHaveAccessibleName(/, \$20, 1 copy$/, { timeout: 30_000 });
    await expect(rows.nth(1)).toHaveAccessibleName(/, \$12\.50, 1 copy$/);
    await expect(rows.nth(2)).toHaveAccessibleName(/90% TCG/);

    // Game: Yu-Gi-Oh! only; the count is known before the list changes.
    await inventory.getByRole('button', { name: 'Filter and sort' }).click();
    await sheet.getByRole('radio', { name: 'Yu-Gi-Oh!' }).click();
    await expect(sheet.getByRole('button', { name: 'Show 1 card' })).toBeVisible({
      timeout: 30_000,
    });
    const listed = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/inventory/items?') &&
        request.url().includes('game=yugioh') &&
        request.url().includes('size=24')
    );
    await sheet.getByRole('button', { name: 'Show 1 card' }).click();
    expect(new URL((await listed).url()).searchParams.get('sort')).toBe('price');
    await expect(
      inventory.getByRole('button', { name: 'Filter and sort, 1 filter on' })
    ).toBeVisible();
    await expect(rows).toHaveCount(1, { timeout: 30_000 });

    // No binder, then Clear all.
    await inventory.getByRole('button', { name: 'Filter and sort, 1 filter on' }).click();
    await sheet.getByRole('button', { name: 'Clear all' }).click();
    await expect(sheet.getByRole('button', { name: 'Show 3 cards' })).toBeVisible({
      timeout: 30_000,
    });
    await sheet.getByRole('button', { name: 'Show 3 cards' }).click();
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
  });
});
