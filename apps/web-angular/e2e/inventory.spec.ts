import { Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  coordinateLeaks,
  watchCoordinates,
} from './support/inventory';
import {
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Inventory, binders and public binders (Phase 3) against the real local stack: the add-card
 * flow, binders, moving and editing cards, publishing, bulk actions with a temporary
 * publication, a second collector viewing a public binder, and the `binders.max` plan limit.
 * Every collector is fresh (unique emails); items and binders come from the seed catalog.
 */

/** A 1×1 PNG (fictional photo of an owned copy). */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function card(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

function binderNav(page: Page) {
  return page.getByRole('navigation', { name: 'Binders' });
}

test.describe('inventory', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('add a card, create a binder, move the card in, make it public and edit it', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'inventory');
    await signInThroughUi(page, collector.email, collector.password);

    // Open the dedicated inventory page from the primary navigation.
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Inventory' })
      .click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your inventory is empty' })).toBeVisible();

    // Add card: catalog autocomplete -> printing -> details (kept private for now).
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add a card' });
    await add.getByRole('combobox', { name: 'Card name or printing code' }).fill('azure');
    await page.getByRole('option', { name: /Azure-Eyes Sky Dragon/ }).click();
    await expect(add.getByRole('heading', { name: 'Azure-Eyes Sky Dragon' })).toBeVisible();
    await add.getByRole('radio', { name: /AZR-EN001/ }).check();
    await add.getByRole('button', { name: 'Continue' }).click();
    await add.getByLabel('Quantity').fill('2');
    await add.getByLabel('Asking price').fill('45');
    await expect(add.getByRole('radio', { name: 'Private', exact: true })).toBeChecked();
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    await expect(add).toBeHidden();
    await expect(page.getByText('Azure-Eyes Sky Dragon added to your inventory.')).toBeVisible();

    const dragon = card(page, 'Azure-Eyes Sky Dragon');
    await expect(dragon).toBeVisible();
    await expect(dragon.getByTestId('quantity')).toHaveText('2');
    await expect(dragon).toContainText('$45.00');
    await expect(dragon).toContainText('AZR-EN001');
    await expect(dragon.getByRole('img', { name: /^Visibility: Private/ })).toBeVisible();
    await expect(dragon).toContainText('Updated just now');
    await expect(page.getByTestId('summary-private')).toContainText('1');

    // Quick edit: the stepper saves the quantity right away.
    await dragon
      .getByRole('button', { name: 'Increase quantity of Azure-Eyes Sky Dragon' })
      .click();
    await expect(dragon.getByTestId('quantity')).toHaveText('3');
    await expect(page.getByTestId('summary-total')).toContainText('3 copies');

    // Create a binder from the binder list.
    await binderNav(page).getByRole('button', { name: 'New binder' }).click();
    const binderForm = page.getByRole('dialog', { name: 'New binder' });
    await binderForm.getByLabel('Binder name').fill('E2E trades');
    await binderForm.getByRole('button', { name: 'Create binder' }).click();
    await expect(binderForm).toBeHidden();
    await expect(page).toHaveURL(/binder=[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 2, name: 'E2E trades' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This binder is empty' })).toBeVisible();

    // Back to every card; the edit panel moves the card into the binder, makes it public and
    // updates its condition.
    await binderNav(page)
      .getByRole('link', { name: /All cards/ })
      .click();
    await card(page, 'Azure-Eyes Sky Dragon')
      .getByRole('button', { name: 'Edit Azure-Eyes Sky Dragon' })
      .click();
    const editor = page.getByRole('dialog', { name: 'Azure-Eyes Sky Dragon' });
    await expect(editor.getByText('Listed as fresh', { exact: true })).toBeVisible();
    await editor.getByRole('combobox', { name: 'Binder' }).click();
    await page.getByRole('option', { name: 'E2E trades' }).click();
    await editor.getByRole('radio', { name: 'Public', exact: true }).click();
    await editor.getByRole('combobox', { name: 'Condition' }).click();
    await page.getByRole('option', { name: 'Lightly Played' }).click();
    await editor.getByLabel('Public notes').fill('Sleeved since the day it was pulled.');
    // A photo of the owner's copy (re-encoded by the API, metadata stripped).
    await editor.locator('input[type=file]').setInputFiles({
      name: 'my-copy.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG, 'base64'),
    });
    await expect(
      editor.getByRole('list', { name: 'Photos' }).getByRole('img', { name: 'Photo 1' }),
    ).toBeVisible();
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByText('Azure-Eyes Sky Dragon: changes saved.')).toBeVisible();

    await expect(dragon.getByLabel('Condition: Lightly Played')).toBeVisible();
    await expect(dragon).toContainText('E2E trades');
    // Public, but the binder is still private: explained, not silently hidden.
    await expect(
      dragon.getByRole('img', { name: /^Visibility: Public · not visible/ }),
    ).toBeVisible();
    await expect(binderNav(page).getByRole('link', { name: /E2E trades/ })).toContainText('1');

    // Publish the binder until disabled from its header.
    await binderNav(page)
      .getByRole('link', { name: /E2E trades/ })
      .click();
    await expect(card(page, 'Azure-Eyes Sky Dragon')).toBeVisible();
    await page.getByRole('button', { name: 'Publish E2E trades' }).click();
    await page.getByRole('menuitem', { name: 'Public until disabled' }).click();
    await expect(page.getByText('“E2E trades” is public until you make it private.')).toBeVisible();
    await expect(
      page.getByTestId('binder-visibility').getByRole('img', { name: /^Visibility: Public/ }),
    ).toBeVisible();
    // A new collector is hidden from the map: the page says why nobody sees the binder yet.
    await expect(page.getByText('Your public cards are not visible yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy settings' })).toHaveAttribute(
      'href',
      '/settings/privacy',
    );

    // The state survives a reload (everything is server state + URL).
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'E2E trades' }).first()).toBeVisible();
    await expect(
      card(page, 'Azure-Eyes Sky Dragon').getByLabel('Condition: Lightly Played'),
    ).toBeVisible();
  });

  test('bulk visibility with a temporary publication, availability with skipped cards, move to binder', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'bulk');
    const token = collector.idToken;
    const [dragon, fiend, sorceress] = await Promise.all([
      printingIdOf(request, token, 'AZR-EN001'),
      printingIdOf(request, token, 'AZR-EN021'),
      printingIdOf(request, token, 'AZR-EN031'),
    ]);
    await apiCreateItem(request, token, { printingId: dragon, availability: 'TRADE' });
    await apiCreateItem(request, token, { printingId: fiend, availability: 'SALE' });
    await apiCreateItem(request, token, { printingId: sorceress, availability: 'SALE' });
    await apiCreateBinder(request, token, { name: 'Bulk binder', kind: 'TRADE' });

    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/inventory');
    await expect(page.getByTestId('inventory-count')).toHaveText(/3 cards/);

    // Select one card, then the whole page from the bulk bar.
    await page.getByRole('checkbox', { name: 'Select Azure-Eyes Sky Dragon' }).check();
    const bulk = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bulk).toContainText('1 selected');
    await bulk.getByRole('checkbox', { name: 'Select all cards on this page' }).check();
    await expect(bulk).toContainText('3 selected');

    // Temporary publication with a duration.
    await bulk.getByRole('button', { name: 'Visibility' }).click();
    await page.getByRole('menuitem', { name: 'Temporarily public' }).click();
    await page.getByRole('menuitem', { name: 'Public for 24 hours' }).click();
    await expect(page.getByTestId('bulk-result')).toHaveText(
      '3 cards are now public for 24 hours.',
    );
    await expect(page.getByTestId('summary-temporary')).toContainText('3');
    await expect(page.getByTestId('summary-temporary')).toContainText('next ends in');
    await expect(
      card(page, 'Gravehollow Fiend').getByRole('img', { name: /^Visibility: Public · ends in/ }),
    ).toBeVisible();

    // The visibility segmented control tells the three states apart.
    const visibility = page
      .getByRole('toolbar', { name: 'Inventory filters' })
      .getByRole('radiogroup', { name: 'Visibility' });
    await visibility.getByRole('radio', { name: 'Temporarily public' }).click();
    await expect(page).toHaveURL(/visibility=TEMPORARILY_PUBLIC/);
    await expect(page.getByTestId('inventory-count')).toHaveText(/3 cards/);
    await visibility.getByRole('radio', { name: 'Private' }).click();
    await expect(page.getByRole('heading', { name: 'No cards match these filters' })).toBeVisible();
    await visibility.getByRole('radio', { name: 'All', exact: true }).click();
    await expect(page.getByTestId('inventory-count')).toHaveText(/3 cards/);

    // Availability: the card already for trade is skipped, with the reason.
    await page.getByRole('checkbox', { name: 'Select Azure-Eyes Sky Dragon' }).check();
    await bulk.getByRole('checkbox', { name: 'Select all cards on this page' }).check();
    await expect(bulk).toContainText('3 selected');
    await bulk.getByRole('button', { name: 'Availability' }).click();
    await page.getByRole('menuitem', { name: 'Trade', exact: true }).click();
    await expect(page.getByTestId('bulk-result')).toHaveText(
      '2 cards set to trade. 1 card skipped: already in that state.',
    );

    // Move everything to a binder.
    await bulk.getByRole('button', { name: 'Move to binder' }).click();
    await page.getByRole('menuitem', { name: 'Bulk binder' }).click();
    await expect(page.getByTestId('bulk-result')).toHaveText('3 cards moved to “Bulk binder”.');
    await expect(binderNav(page).getByRole('link', { name: /Bulk binder/ })).toContainText('3');
    await expect(binderNav(page).getByRole('link', { name: /Unfiled/ })).toContainText('0');

    // Back to private in one go.
    await bulk.getByRole('button', { name: 'Visibility' }).click();
    await page.getByRole('menuitem', { name: 'Make private' }).click();
    await expect(page.getByTestId('bulk-result')).toHaveText('3 cards are now private.');
    await expect(page.getByTestId('summary-private')).toContainText('3');

    // Delete asks first, then empties the inventory.
    await bulk.getByRole('button', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete 3 cards?' });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('bulk-result')).toHaveText('3 cards deleted.');
    await expect(page.getByRole('heading', { name: 'Your inventory is empty' })).toBeVisible();
  });

  test('a second collector opens a published binder with the owner state and country only', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const owner = await createOnboardedCollector(request, 'binderowner', { location: true });
    await apiUpdatePrivacy(request, owner.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, owner.idToken, {
      name: 'E2E public binder',
      kind: 'TRADE',
      description: 'Fictional trade binder for the E2E suite.',
    });
    await apiCreateItem(request, owner.idToken, {
      printingId: await printingIdOf(request, owner.idToken, 'AZR-EN001'),
      binderId: binder.id,
      condition: 'NEAR_MINT',
      askingPrice: 45,
      availability: 'TRADE_OR_SALE',
      acceptsOffers: true,
      notes: 'E2E-private-note-never-public',
      publicNotes: 'Sleeved since the day it was pulled.',
    });
    await apiCreateItem(request, owner.idToken, {
      printingId: await printingIdOf(request, owner.idToken, 'SVX-001'),
      binderId: binder.id,
      availability: 'SALE',
      askingPrice: 38,
    });
    await apiPublishBinder(request, owner.idToken, binder.id, 'UNTIL_DISABLED');

    const viewer = await createOnboardedCollector(request, 'binderviewer', { location: true });
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, viewer.email, viewer.password);

    // The collector profile lists the public binder and enables "View public binder".
    await page.goto(`/collectors/${owner.handle}`);
    await expect(page.getByRole('heading', { level: 1, name: owner.displayName })).toBeVisible();
    const binders = page.getByRole('list', { name: 'Public binders' });
    await expect(binders.getByRole('link', { name: 'E2E public binder' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Public cards' })).toContainText(
      'Azure-Eyes Sky Dragon',
    );
    await page.getByRole('link', { name: 'View public binder' }).click();

    await expect(page).toHaveURL(new RegExp(`/binders/${binder.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'E2E public binder' })).toBeVisible();
    await expect(page).toHaveTitle('E2E public binder · OrenjiTrade');
    const ownerCard = page.getByRole('region', { name: 'Owner' });
    await expect(ownerCard).toContainText(owner.displayName);
    await expect(ownerCard).toContainText(`@${owner.handle}`);
    await expect(page.getByTestId('owner-public-label')).toContainText('Quebec, Canada');
    await expect(page.getByTestId('owner-distance')).toHaveCount(0);
    await expect(ownerCard).not.toContainText(/\bkm\b/);
    await expect(page.getByTestId('binder-item-count')).toContainText('2 cards');

    const dragon = card(page, 'Azure-Eyes Sky Dragon');
    await expect(dragon.getByTestId('item-price')).toHaveText('$45.00');
    await expect(dragon.getByLabel('Condition: Near Mint')).toBeVisible();
    await expect(dragon).toContainText('Trade or sale');
    await expect(dragon).toContainText('Accepting offers');
    await expect(dragon).toContainText('Sleeved since the day it was pulled.');
    await expect(page.getByText('E2E-private-note-never-public')).toHaveCount(0);

    // Game filter.
    await page
      .getByRole('group', { name: 'Game' })
      .getByRole('button', { name: 'Pokémon' })
      .click();
    await expect(page).toHaveURL(/game=pokemon/);
    await expect(page.getByTestId('public-item-count')).toHaveText(/^\s*1 card\b/);
    await expect(card(page, 'Emberfang Fox VMAX')).toBeVisible();
    await expect(card(page, 'Azure-Eyes Sky Dragon')).toHaveCount(0);

    // ADR 0017: no JSON response carried a coordinate.
    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });

  test('the binders.max limit opens the limit-reached dialog; binders reorder from the keyboard', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'binderlimit');
    for (let i = 1; i <= 5; i++) {
      await apiCreateBinder(request, collector.idToken, { name: `Limit binder ${i}` });
    }
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/inventory');
    await expect(binderNav(page).getByRole('link', { name: /Limit binder 5/ })).toBeVisible();

    await binderNav(page).getByRole('button', { name: 'New binder' }).click();
    const binderForm = page.getByRole('dialog', { name: 'New binder' });
    await binderForm.getByLabel('Binder name').fill('One binder too many');
    await binderForm.getByRole('button', { name: 'Create binder' }).click();

    const limit = page.getByRole('alertdialog', { name: 'You reached a plan limit' });
    await expect(limit).toBeVisible();
    await expect(limit.getByTestId('limit-summary')).toContainText('5 of 5');
    await limit.getByRole('button', { name: 'Not now' }).click();
    await expect(limit).toBeHidden();
    await expect(binderForm.getByRole('alert')).toHaveText(
      'You reached the number of binders your plan allows.',
    );
    await binderForm.getByRole('button', { name: 'Cancel' }).click();

    // The binder manager reorders from the keyboard; focus stays on the moved binder's arrow.
    await page.getByRole('button', { name: 'Manage binders', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Manage binders' });
    const moveUp = manager.getByRole('button', { name: 'Move Limit binder 3 up' });
    // Wait for the dialog's own initial focus (after its opening animation) before moving it.
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('mat-dialog-container')))
      .toBe(true);
    await moveUp.focus();
    await page.keyboard.press('Enter');
    await expect(manager.getByTestId('binder-row').nth(1)).toContainText('Limit binder 3');
    await expect(moveUp).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(manager.getByTestId('binder-row').first()).toContainText('Limit binder 3');
    // Delete a binder from the manager (after a confirmation).
    await manager.getByRole('button', { name: 'Delete Limit binder 5' }).click();
    await page
      .getByRole('dialog', { name: 'Delete “Limit binder 5”?' })
      .getByRole('button', { name: 'Delete binder' })
      .click();
    await expect(manager.getByTestId('binder-row')).toHaveCount(4);
    await manager.getByRole('button', { name: 'Done' }).click();

    const order = page.getByRole('list', { name: 'Your binders' }).getByRole('listitem');
    await expect(order.first()).toContainText('Limit binder 3');
    await page.reload();
    await expect(order.first()).toContainText('Limit binder 3');
    await expect(order.nth(1)).toContainText('Limit binder 1');
  });
});
