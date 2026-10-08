import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

interface Item {
  id: string;
  quantity: number;
  condition: string;
  finish: string;
  availability: string;
  acceptsOffers: boolean;
  askingPrice: number | null;
  visibility: string;
  publicNotes: string;
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
 * Mobile Phase 3 (inventory) against the real stack: a fresh collector adds a card through the
 * catalog search → printing → details flow, edits it and deletes it; the API holds every step.
 */
test.describe('mobile inventory', () => {
  requireStack();

  test('add a card to the inventory, edit it and delete it', async ({ page, request }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'inv', 'Mobile Inventory');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Inventory');
    const inventory = screen(page, 'inventory');
    await expect(inventory.getByText('Your inventory is empty')).toBeVisible({ timeout: 30_000 });
    await inventory.getByRole('button', { name: 'Add card' }).click();

    // Step 1: catalog autocomplete.
    const add = screen(page, 'add-item');
    await add.getByLabel('Card name or printing code').fill('tidal otter');
    // A card suggestion (a printing suggestion would preselect that printing).
    await add
      .getByRole('button', { name: /^Tidal Otterling(, SVX-025)?$/ })
      .first()
      .click();

    // Step 2: the printing (the reverse holo).
    await expect(add.getByText('Step 2 of 3 · Choose the printing')).toBeVisible();
    await add.getByRole('radio', { name: /Reverse holo/ }).click();
    await add.getByRole('button', { name: 'Continue' }).click();

    // Step 3: details. Defaults: 1 copy, Near Mint, private.
    await expect(add.getByText('Step 3 of 3 · Add details')).toBeVisible();
    await expect(add.getByRole('radio', { name: 'Near Mint' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(add.getByRole('radio', { name: 'Private' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await add.getByLabel('Copies').fill('0');
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    await expect(add.getByText('At least 1 copy.')).toBeVisible();
    await add.getByLabel('Copies').fill('2');
    await add.getByRole('radio', { name: 'Lightly Played' }).click();
    await add.getByRole('radio', { name: 'Trade', exact: true }).click();
    await add.getByRole('switch', { name: 'Accepts offers' }).click();
    await add.getByLabel('Asking price (optional)').fill('3.50');
    await add.getByRole('radio', { name: 'Public', exact: true }).click();
    await add.getByLabel('Public notes').fill('Sleeved since opening.');
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    await expect(snackbar(page)).toHaveText('Tidal Otterling added to your inventory.', {
      timeout: 30_000,
    });

    // Back on the Inventory tab: the new card, as the API holds it.
    const list = screen(page, 'inventory');
    const row = list.getByRole('button', { name: /^Tidal Otterling, SVX-025/ });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('×2');
    await expect(row).toContainText('Trade');
    await expect(row).toContainText('Offers');
    const [created] = await items(request, collector.idToken);
    expect(created).toMatchObject({
      quantity: 2,
      condition: 'LIGHTLY_PLAYED',
      finish: 'REVERSE_HOLO',
      availability: 'TRADE',
      acceptsOffers: true,
      askingPrice: 3.5,
      visibility: 'PUBLIC',
      publicNotes: 'Sleeved since opening.',
    });

    // Edit: three copies, for sale; only the changed fields are sent.
    await row.click();
    const edit = screen(page, 'edit-item');
    await expect(edit.getByTestId('edit-item-name')).toHaveText('Tidal Otterling', {
      timeout: 30_000,
    });
    await expect(edit.getByLabel('Copies')).toHaveValue('2');
    const patch = page.waitForRequest(
      (request) => request.method() === 'PATCH' && request.url().includes('/inventory/items/')
    );
    await edit.getByLabel('Copies').fill('3');
    await edit.getByRole('radio', { name: 'Sale', exact: true }).click();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    expect((await patch).postDataJSON()).toEqual({ quantity: 3, availability: 'SALE' });
    await expect(snackbar(page)).toHaveText('Card saved.', { timeout: 30_000 });
    const [edited] = await items(request, collector.idToken);
    expect(edited).toMatchObject({ quantity: 3, availability: 'SALE' });

    // Delete, after a confirmation (cancel first).
    await edit.getByRole('button', { name: 'Delete card' }).click();
    const dialog = page.getByTestId('edit-item-delete-dialog');
    await expect(dialog).toContainText('Delete Tidal Otterling?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await items(request, collector.idToken)).toHaveLength(1);
    await edit.getByRole('button', { name: 'Delete card' }).click();
    await page
      .getByTestId('edit-item-delete-dialog')
      .getByRole('button', { name: 'Delete card' })
      .click();
    await expect(snackbar(page)).toHaveText('Tidal Otterling deleted from your inventory.', {
      timeout: 30_000,
    });
    await expect(screen(page, 'inventory').getByText('Your inventory is empty')).toBeVisible({
      timeout: 30_000,
    });
    expect(await items(request, collector.idToken)).toHaveLength(0);
  });

  test('add a card from its card detail, filter and sort the inventory', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'inv2', 'Mobile Filters');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByLabel('Find a card').fill('Azure-Eyes');
    await search.getByRole('link', { name: 'Azure-Eyes Sky Dragon' }).click();
    const card = screen(page, 'card');
    await card.getByRole('button', { name: 'Add to inventory' }).click();
    // The first printing comes preselected from the card detail.
    const add = screen(page, 'add-item');
    await add.getByRole('button', { name: 'Continue' }).click();
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    await expect(snackbar(page)).toHaveText('Azure-Eyes Sky Dragon added to your inventory.', {
      timeout: 30_000,
    });
    // Back on the card detail.
    await expect(screen(page, 'card').getByTestId('card-name')).toBeVisible();

    await page.goto('/inventory');
    const inventory = screen(page, 'inventory');
    await expect(
      inventory.getByRole('button', { name: /^Azure-Eyes Sky Dragon, AZR-EN001/ })
    ).toBeVisible({ timeout: 30_000 });
    await expect(inventory.getByTestId('inventory-summary-totals')).toHaveText(
      '1 card · 1 copy · 0 public now'
    );

    // Intent filter: nothing for sale only.
    await inventory.getByRole('button', { name: 'Intent: Any intent' }).click();
    await page.getByTestId('inventory-filter-intent-option-SALE').click();
    await expect(inventory.getByText('No cards match')).toBeVisible({ timeout: 30_000 });
    await inventory.getByRole('button', { name: 'Clear filters' }).click();
    await expect(
      inventory.getByRole('button', { name: /^Azure-Eyes Sky Dragon, AZR-EN001/ })
    ).toBeVisible();

    // Game filter and sort reach the API.
    const listed = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/inventory/items?') && request.url().includes('game=yugioh')
    );
    await inventory.getByRole('button', { name: 'Game: All games' }).click();
    await page.getByTestId('inventory-filter-game-option-yugioh').click();
    expect(new URL((await listed).url()).searchParams.get('game')).toBe('yugioh');
    const sorted = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/inventory/items?') && request.url().includes('sort=name')
    );
    await inventory.getByRole('button', { name: 'Sort: Recently updated' }).click();
    await page.getByTestId('inventory-sort-option-name').click();
    await sorted;
    await expect(
      inventory.getByRole('button', { name: /^Azure-Eyes Sky Dragon, AZR-EN001/ })
    ).toBeVisible();
  });
});
