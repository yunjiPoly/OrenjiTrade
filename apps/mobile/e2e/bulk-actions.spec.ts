import { expect, test } from './support/fixtures';
import {
  apiAddItem,
  apiInventoryItem,
  createOnboardedCollector,
  openTab,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Multi-select bulk actions of the Inventory tab (stage M7, the web's inventory bulk bar on
 * `POST /inventory/items/bulk`): select cards, make them public, private again (already-private
 * ones skipped), set an availability, delete after a confirmation; the API holds each step.
 */
test.describe('mobile inventory bulk actions', () => {
  requireStack();

  test('select cards and change their visibility and availability in bulk, then delete them', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const owner = await createOnboardedCollector(request, 'bulk', 'Mobile Bulk');
    const printingId = await printingIdOf(request, owner.idToken, 'PFT-002');
    const first = await apiAddItem(request, owner, printingId, { condition: 'NEAR_MINT' });
    const second = await apiAddItem(request, owner, printingId, { condition: 'LIGHTLY_PLAYED' });
    const third = await apiAddItem(request, owner, printingId, { condition: 'MODERATELY_PLAYED' });
    await signInThroughUi(page, owner.email, owner.password);

    await openTab(page, 'Inventory');
    const inventory = screen(page, 'inventory');
    await expect(inventory.getByTestId(`item-${third.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(inventory.getByTestId('bulk-bar')).toHaveCount(0);

    // Selection mode: the rows become checkboxes; the bar appears with the first selection.
    await inventory.getByTestId('inventory-select').click();
    await expect(inventory.getByRole('button', { name: 'Done selecting' })).toBeVisible();
    const bar = inventory.getByTestId('bulk-bar');
    await expect(bar).toHaveCount(0);
    await inventory.getByTestId(`item-${first.id}`).click();
    await expect(bar.getByTestId('bulk-count')).toHaveText('1 selected');
    await inventory.getByTestId(`item-${second.id}`).click();
    await expect(bar.getByTestId('bulk-count')).toHaveText('2 selected');

    // Make them public: one request for both, the outcome sentence, the API.
    const published = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'POST' && candidate.url().endsWith('/api/v1/inventory/items/bulk')
    );
    await bar.getByTestId('bulk-visibility').click();
    await page.getByTestId('bulk-visibility-PUBLIC').click();
    const body = (await published).postDataJSON() as {
      action: string;
      visibility: string;
      itemIds: string[];
    };
    expect(body).toMatchObject({ action: 'SET_VISIBILITY', visibility: 'PUBLIC' });
    expect([...body.itemIds].sort()).toEqual([first.id, second.id].sort());
    await expect(snackbar(page)).toHaveText('2 cards are now public.', { timeout: 30_000 });
    expect((await apiInventoryItem(request, owner, first.id)).visibility).toBe('PUBLIC');
    expect((await apiInventoryItem(request, owner, second.id)).visibility).toBe('PUBLIC');
    expect((await apiInventoryItem(request, owner, third.id)).visibility).toBe('PRIVATE');

    // Select all, back to private: the already-private card is skipped and said so.
    await bar.getByRole('checkbox', { name: 'Select all cards on this page' }).click();
    await expect(bar.getByTestId('bulk-count')).toHaveText('3 selected');
    await bar.getByTestId('bulk-visibility').click();
    await page.getByTestId('bulk-visibility-PRIVATE').click();
    await expect(snackbar(page)).toHaveText(
      '2 cards are now private. 1 card skipped: already in that state.',
      { timeout: 30_000 }
    );
    expect((await apiInventoryItem(request, owner, first.id)).visibility).toBe('PRIVATE');

    // Temporarily public for a day: the request carries the end.
    const temporary = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'POST' && candidate.url().endsWith('/api/v1/inventory/items/bulk')
    );
    await bar.getByTestId('bulk-visibility').click();
    await page.getByTestId('bulk-visibility-TEMPORARILY_PUBLIC').click();
    await page.getByTestId('bulk-duration-24h').click();
    const temporaryBody = (await temporary).postDataJSON() as {
      visibility: string;
      publicUntil?: string;
    };
    expect(temporaryBody.visibility).toBe('TEMPORARILY_PUBLIC');
    expect(Date.parse(temporaryBody.publicUntil ?? '')).toBeGreaterThan(Date.now());
    await expect(snackbar(page)).toHaveText('3 cards are now public for 24 hours.', {
      timeout: 30_000,
    });

    // An availability for all.
    await bar.getByTestId('bulk-availability').click();
    await page.getByTestId('bulk-availability-SALE').click();
    await expect(snackbar(page)).toHaveText('3 cards set to sale.', { timeout: 30_000 });

    // Delete, after a confirmation (cancel first).
    await bar.getByTestId('bulk-delete').click();
    const dialog = page.getByTestId('bulk-delete-dialog');
    await expect(dialog).toContainText('Delete 3 cards?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(inventory.getByTestId(`item-${third.id}`)).toBeVisible();
    await bar.getByTestId('bulk-delete').click();
    await page.getByTestId('bulk-delete-dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(snackbar(page)).toHaveText('3 cards deleted.', { timeout: 30_000 });
    await expect(inventory.getByText('Your inventory is empty')).toBeVisible({ timeout: 30_000 });
    await expect(inventory.getByTestId('bulk-bar')).toHaveCount(0);
  });
});
