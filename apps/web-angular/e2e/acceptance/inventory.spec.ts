import { Page } from '@playwright/test';
import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, expect, signIn, test } from './support/fixtures';
import { besides, randomCentre } from './support/places';

/**
 * Acceptance — inventory (spec § 50): a collector opens the dedicated inventory page from the
 * primary navigation, adds a card (private by default), creates a binder, moves the card into
 * it, makes the card public, updates its condition and saves; the binder is published and the
 * state survives a reload. A second collector then sees the public card in the published binder.
 */

const CARD = 'Azure-Eyes Sky Dragon';

function card(page: Page, name: string) {
  return page.getByRole('article', { name, exact: true });
}

test.describe('acceptance: inventory', () => {
  requireStack();

  test('open inventory, add a card, create a binder, move it in, make it public, update condition, save', async ({
    page,
    api,
    actors,
  }) => {
    test.setTimeout(150_000);
    const area = randomCentre('inventory');
    const owner = await api.collector('acc-inv', { area, radiusKm: 5, discoverable: true });
    const binderName = `Acceptance trades ${suffix()}`;
    await signIn(page, owner);

    // Open the dedicated inventory page from the primary navigation.
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Inventory' })
      .click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your inventory is empty' })).toBeVisible();

    // Add a card: autocomplete → printing → details; private by default.
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    const add = await dialogReady(page.getByRole('dialog', { name: 'Add a card' }));
    await add.getByRole('combobox', { name: 'Card name or printing code' }).fill('azure');
    await page.getByRole('option', { name: new RegExp(CARD) }).click();
    await add.getByRole('radio', { name: /AZR-EN001/ }).check();
    await add.getByRole('button', { name: 'Continue' }).click();
    await add.getByLabel('Quantity').fill('2');
    await add.getByLabel('Asking price').fill('45');
    await expect(add.getByRole('radio', { name: 'Private', exact: true })).toBeChecked();
    await add.getByRole('button', { name: 'Add to inventory' }).click();
    await expect(add).toBeHidden();
    await expect(page.getByText(`${CARD} added to your inventory.`)).toBeVisible();
    const dragon = card(page, CARD);
    await expect(dragon.getByTestId('quantity')).toHaveText('2');
    await expect(dragon.getByRole('img', { name: /^Visibility: Private/ })).toBeVisible();

    // Create a binder.
    const binders = page.getByRole('navigation', { name: 'Binders' });
    await binders.getByRole('button', { name: 'New binder' }).click();
    const form = await dialogReady(page.getByRole('dialog', { name: 'New binder' }));
    await form.getByLabel('Binder name').fill(binderName);
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form).toBeHidden();
    await expect(page).toHaveURL(/binder=[0-9a-f-]{36}/);
    const binderId = /binder=([0-9a-f-]{36})/.exec(page.url())![1];
    await expect(page.getByRole('heading', { name: 'This binder is empty' })).toBeVisible();

    // Move the card into the binder, make it public, update its condition, save.
    await binders.getByRole('link', { name: /All cards/ }).click();
    await card(page, CARD)
      .getByRole('button', { name: `Edit ${CARD}` })
      .click();
    const editor = await dialogReady(page.getByRole('dialog', { name: CARD }));
    await editor.getByRole('combobox', { name: 'Binder' }).click();
    await page.getByRole('option', { name: binderName }).click();
    await editor.getByRole('radio', { name: 'Public', exact: true }).click();
    await editor.getByRole('combobox', { name: 'Condition' }).click();
    await page.getByRole('option', { name: 'Lightly Played' }).click();
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByText(`${CARD}: changes saved.`)).toBeVisible();
    await expect(dragon.getByLabel('Condition: Lightly Played')).toBeVisible();
    await expect(dragon).toContainText(binderName);
    await expect(
      dragon.getByRole('img', { name: /^Visibility: Public · not visible/ }),
    ).toBeVisible();
    await expect(binders.getByRole('link', { name: new RegExp(binderName) })).toContainText('1');

    // Publish the binder from its header.
    await binders.getByRole('link', { name: new RegExp(binderName) }).click();
    await page.getByRole('button', { name: `Publish ${binderName}` }).click();
    await page.getByRole('menuitem', { name: 'Public until disabled' }).click();
    await expect(
      page.getByText(`“${binderName}” is public until you make it private.`),
    ).toBeVisible();
    api.trackPublished(owner, binderId);

    // Saved on the server: the state survives a reload.
    await page.reload();
    await expect(card(page, CARD).getByLabel('Condition: Lightly Played')).toBeVisible();
    await expect(card(page, CARD).getByRole('img', { name: /^Visibility: Public/ })).toBeVisible();
    await expect(card(page, CARD).getByTestId('quantity')).toHaveText('2');

    // Another collector sees the public card in the published binder.
    const viewer = await api.collector('acc-invview', { area: besides(area), radiusKm: 10 });
    const other = await actors.open(viewer);
    await other.goto(`/binders/${binderId}`);
    await expect(other.getByRole('heading', { level: 1, name: binderName })).toBeVisible();
    const listed = card(other, CARD);
    await expect(listed.getByLabel('Condition: Lightly Played')).toBeVisible();
    await expect(listed.getByTestId('item-price')).toHaveText('$45.00');
    await expect(other.getByTestId('owner-distance')).toHaveText(/km away/);
  });
});
