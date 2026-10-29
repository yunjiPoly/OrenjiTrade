import { Page } from '@playwright/test';
import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, expect, signIn, test } from './support/fixtures';
import { placeOf } from './support/places';

/**
 * Acceptance — inventory (spec § 50; the web redesign WB's Inventory): a collector opens the
 * dedicated inventory page from the primary navigation, adds a card (private by default), creates
 * a binder, moves the card into it, makes the card public, adds a public note (the phone's card
 * model, decision 8: no condition on the web) and saves; the binder is published and the state
 * survives a reload. A second collector then sees the public card in the published binder.
 */

const CARD = 'Azure-Eyes Sky Dragon';

function card(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

/** A row of Inventory's table (web WB). */
function row(page: Page, name: string) {
  return page.locator('[role="row"][data-item-id]', { hasText: name });
}

test.describe('acceptance: inventory', () => {
  requireStack();

  test('open inventory, add a card, create a binder, move it in, make it public, update condition, save', async ({
    page,
    api,
    actors,
  }) => {
    test.setTimeout(150_000);
    const owner = await api.collector('acc-inv', {
      place: placeOf('inventory'),
      discoverable: true,
    });
    const binderName = `Acceptance trades ${suffix()}`;
    await signIn(page, owner);

    // Open the inventory from the rail (web redesign WA, spec 4.6).
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Inventory' })
      .click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your cards, in one place' })).toBeVisible();

    // Add cards (web WB, spec 9.9): a card, its printing, the phone's fields; private by default.
    await page.getByTestId('inventory-add').click();
    const add = page.getByRole('dialog', { name: 'Add cards' });
    await add.getByTestId('add-search').fill('azure');
    await add
      .getByRole('option', { name: new RegExp(CARD) })
      .first()
      .click();
    await add.getByRole('button', { name: /AZR-EN001/ }).click();
    await add.getByRole('button', { name: 'One more' }).click();
    await add.getByRole('radio', { name: 'Dollars' }).click();
    await add.getByRole('textbox', { name: 'Asking price in dollars' }).fill('45');
    await expect(add.getByRole('radio', { name: 'Private' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await add.getByTestId('add-submit').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Saved' })).toContainText(CARD);
    await add.getByTestId('add-done').click();
    const dragon = row(page, CARD);
    await expect(dragon).toContainText('×2');
    await expect(dragon).toContainText('$45.00');
    await expect(dragon).toContainText('Private');

    // Create a binder from the pane (Yu-Gi-Oh!, the first game tile).
    const binders = page.getByRole('navigation', { name: 'Binders' });
    await binders.getByTestId('pane-new').click();
    const form = await dialogReady(page.getByRole('dialog', { name: 'New binder' }));
    await form.getByTestId('new-binder-name').fill(binderName);
    await expect(form.getByRole('radio', { name: /Yu-Gi-Oh!/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await form.getByTestId('new-binder-create').click();
    await expect(form).toBeHidden();
    await expect(page).toHaveURL(/binder=[0-9a-f-]{36}/);
    const binderId = /binder=([0-9a-f-]{36})/.exec(page.url())![1];
    await expect(page.getByRole('heading', { name: 'This binder is empty' })).toBeVisible();

    // Move the card into the binder, make it public, add a public note, save (Edit card).
    await binders.getByTestId('pane-all').click();
    await row(page, CARD).locator('.c-card').click();
    const editor = page.getByRole('dialog', { name: 'Edit card' });
    await editor.getByRole('combobox', { name: 'Binder' }).click();
    await page.getByRole('option', { name: binderName }).click();
    await editor.getByRole('radio', { name: 'Public' }).click();
    await editor.getByRole('textbox', { name: 'Public note' }).fill('Lightly played, sleeved.');
    await editor.getByTestId('edit-save').click();
    await expect(editor.getByTestId('edit-save')).toHaveText(/No changes yet/);
    await editor.getByRole('button', { name: 'Close' }).click();
    await expect(editor).toBeHidden();
    await expect(dragon).toContainText(binderName);
    await expect(dragon).toContainText('Public · not visible');
    await expect(binders.getByTestId(`pane-binder-${binderId}`)).toContainText('1');

    // Publish the binder from its strip.
    await binders.getByTestId(`pane-binder-${binderId}`).click();
    await page.getByTestId('binder-strip').getByRole('radio', { name: 'Public' }).click();
    await expect(
      page.getByTestId('toast').filter({ hasText: `${binderName} is public` }),
    ).toBeVisible();
    api.trackPublished(owner, binderId);

    // Saved on the server: the state survives a reload.
    await page.reload();
    await expect(row(page, CARD)).toContainText(/Public(?! · not visible)/);
    await expect(row(page, CARD)).toContainText('×2');

    // Another collector sees the public card in the published binder.
    const viewer = await api.collector('acc-invview', { place: placeOf('registration') });
    const other = await actors.open(viewer);
    await other.goto(`/binders/${binderId}`);
    await expect(other.getByRole('heading', { level: 1, name: binderName })).toBeVisible();
    const listed = card(other, CARD);
    await expect(listed).toContainText('Lightly played, sleeved.');
    await expect(listed.getByTestId('item-price')).toHaveText('$45.00');
    await expect(other.getByTestId('owner-public-label')).toContainText(placeOf('inventory').label);
    await expect(other.getByTestId('owner-distance')).toHaveCount(0);
  });
});
