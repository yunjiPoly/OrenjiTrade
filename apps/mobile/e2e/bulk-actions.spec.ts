import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiAddItem,
  apiInventoryItem,
  authHeader,
  createOnboardedCollector,
  gameIdOf,
  openTab,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Select mode of the Inventory (owner spec 2026-10-14, section 6: the bulk actions that still make
 * sense, on `POST /inventory/items/bulk`): select cards, make them public, private again
 * (already-private ones skipped), confirm them as still available, move them to a binder, delete
 * them after a sheet and undo the delete from its toast; the API holds each step.
 */
test.describe('mobile inventory bulk actions', () => {
  requireStack();

  test('select cards, change their visibility, confirm, move, delete them and undo', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const owner = await createOnboardedCollector(request, 'bulk', 'Mobile Bulk');
    const printingId = await printingIdOf(request, owner.idToken, 'PFT-002');
    const first = await apiAddItem(request, owner, printingId, { condition: 'NEAR_MINT' });
    const second = await apiAddItem(request, owner, printingId, { condition: 'LIGHTLY_PLAYED' });
    const third = await apiAddItem(request, owner, printingId, { condition: 'MODERATELY_PLAYED' });
    const binder = await request.post(`${API_URL}/api/v1/binders`, {
      headers: authHeader(owner.idToken),
      data: {
        name: 'Mobile bulk binder',
        visibility: 'PRIVATE',
        gameId: await gameIdOf(request, 'pokemon'),
      },
    });
    expect(binder.status(), 'POST /binders').toBe(201);
    const binderId = ((await binder.json()) as { id: string }).id;
    await signInThroughUi(page, owner.email, owner.password);

    await openTab(page, 'Inventory');
    const inventory = screen(page, 'inventory');
    await expect(inventory.getByTestId(`item-${third.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(inventory.getByTestId('bulk-bar')).toHaveCount(0);

    // Select mode: the rows become checkboxes; the bar appears with the first selection.
    await inventory.getByRole('button', { name: 'Select' }).click();
    await expect(inventory.getByRole('button', { name: 'Done' })).toBeVisible();
    const bar = inventory.getByTestId('bulk-bar');
    await expect(bar).toHaveCount(0);
    await inventory.getByTestId(`item-${first.id}`).click();
    await expect(bar.getByTestId('bulk-count')).toHaveText('1 selected');
    await inventory.getByTestId(`item-${second.id}`).click();
    await expect(bar.getByTestId('bulk-count')).toHaveText('2 selected');
    // Only the actions that still make sense.
    await expect(bar.getByRole('button', { name: 'Availability' })).toHaveCount(0);

    // Make them public: one request for both, the outcome sentence, the API.
    const published = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'POST' && candidate.url().endsWith('/api/v1/inventory/items/bulk')
    );
    await bar.getByRole('button', { name: 'Make public' }).click();
    const body = (await published).postDataJSON() as {
      action: string;
      visibility: string;
      itemIds: string[];
    };
    expect(body).toMatchObject({ action: 'SET_VISIBILITY', visibility: 'PUBLIC' });
    expect([...body.itemIds].sort()).toEqual([first.id, second.id].sort());
    await expect(snackbar(page)).toHaveText('2 cards are now public.', { timeout: 30_000 });
    expect((await apiInventoryItem(request, owner, first.id)).visibility).toBe('PUBLIC');
    expect((await apiInventoryItem(request, owner, third.id)).visibility).toBe('PRIVATE');

    // Select all, back to private: the already-private card is skipped and said so.
    await bar.getByRole('checkbox', { name: 'Select all cards on this page' }).click();
    await expect(bar.getByTestId('bulk-count')).toHaveText('3 selected');
    await bar.getByRole('button', { name: 'Make private' }).click();
    await expect(snackbar(page)).toHaveText(
      '2 cards are now private. 1 card skipped: already in that state.',
      { timeout: 30_000 }
    );
    expect((await apiInventoryItem(request, owner, first.id)).visibility).toBe('PRIVATE');

    // Still available, and into a binder.
    await bar.getByRole('button', { name: 'Still available' }).click();
    await expect(snackbar(page)).toHaveText('3 cards confirmed as still available.', {
      timeout: 30_000,
    });
    await bar.getByRole('button', { name: 'Move to binder' }).click();
    await page.getByTestId(`bulk-binder-${binderId}`).click();
    await expect(snackbar(page)).toHaveText('3 cards moved to “Mobile bulk binder”.', {
      timeout: 30_000,
    });

    // Delete, asked in a sheet (Keep them first), then undone from the toast.
    await bar.getByRole('button', { name: 'Delete' }).click();
    const sheet = page.getByTestId('bulk-delete-sheet');
    await expect(sheet).toContainText('Delete 3 cards?');
    await sheet.getByRole('button', { name: 'Keep them' }).click();
    await expect(sheet).toBeHidden();
    await expect(inventory.getByTestId(`item-${third.id}`)).toBeVisible();
    await bar.getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('bulk-delete-sheet').getByRole('button', { name: 'Delete' }).click();
    await expect(snackbar(page)).toContainText('3 cards deleted', { timeout: 30_000 });
    await expect(inventory.getByText('Your inventory is empty')).toBeVisible({ timeout: 30_000 });
    await expect(inventory.getByTestId('bulk-bar')).toHaveCount(0);
    await snackbar(page).getByRole('button', { name: /^Undo/ }).click();
    await expect(snackbar(page)).toContainText('3 cards restored', { timeout: 30_000 });
    await expect(inventory.getByTestId(`item-${third.id}`)).toBeVisible({ timeout: 30_000 });
    const back = await apiInventoryItem(request, owner, second.id);
    expect(back.condition).toBe('LIGHTLY_PLAYED');
  });
});
