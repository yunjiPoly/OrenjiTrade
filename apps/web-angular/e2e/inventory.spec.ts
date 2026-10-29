import { Locator, Page, expect, test } from '@playwright/test';
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
  API_URL,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Inventory (web redesign stage WB, spec 9, boards W10 to W15) against the real local stack: the
 * Add cards drawer and its loop, Edit card with Previous, Next and the leave guard, a delete with
 * Undo, inline price and copies, quick add rows, a bulk move refused for another game, a drag to a
 * binder, a bulk delete with Undo, the Binders tab, New binder, Edit binder with the deck core
 * fields and the game lock; a second collector viewing a public binder. Every collector is fresh;
 * the cards come from the fictional seed catalog.
 */

/** A row of the table by its card. */
function row(page: Page, name: string): Locator {
  return page.locator('[role="row"][data-item-id]', { hasText: name });
}

function toast(page: Page, title: string | RegExp): Locator {
  return page.getByTestId('toast').filter({ hasText: title });
}

function pane(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Binders' });
}

async function items(
  page: Page,
  token: string,
): Promise<
  {
    id: string;
    quantity: number;
    askingPriceText?: string | null;
    visibility: string;
    binder?: { id: string } | null;
    card: { name: string };
  }[]
> {
  const response = await page.request.get(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(token),
    params: { size: 100 },
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { items: never[] }).items;
}

test.describe('inventory (web WB)', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('add cards in the drawer and loop, edit with Previous and Next, the leave guard, a delete with Undo', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'wbadd');
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your cards, in one place' })).toBeVisible();

    // Add cards: a card, then its printing, then the details (the phone's fields).
    await page.getByTestId('inventory-add').click();
    const add = page.getByRole('dialog', { name: 'Add cards' });
    await expect(add.getByText('Add many at once')).toBeVisible();
    await expect(add).not.toContainText(/scan|camera/i);
    await add.getByTestId('add-search').fill('azure');
    await add
      .getByRole('option', { name: /Azure-Eyes Sky Dragon/ })
      .first()
      .click();
    await expect(add.getByText(/printings?\. Pick the one on your card\./)).toBeVisible();
    await add.getByRole('button', { name: /AZR-EN001/ }).click();
    await add.getByRole('button', { name: 'One more' }).click();
    await add.getByRole('radio', { name: 'Percent of the TCGplayer price' }).click();
    await add
      .getByRole('textbox', { name: 'Asking price in percent of the TCGplayer price' })
      .fill('85');
    await expect(add.getByRole('radio', { name: 'Private' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await add.getByTestId('add-submit').click();
    await expect(toast(page, 'Saved')).toContainText('Azure-Eyes Sky Dragon');
    // The loop: back to the search, focused; the new row is at the top of the table.
    await expect(add.getByTestId('add-search')).toBeFocused();
    await expect(row(page, 'Azure-Eyes Sky Dragon')).toContainText('85% TCG');
    await expect(row(page, 'Azure-Eyes Sky Dragon')).toContainText('×2');
    // An exact printing goes straight to the details; "Keep these" keeps the price mode.
    await add.getByTestId('add-search').fill('AZR-EN011');
    await add.getByRole('option', { name: /AZR-EN011/ }).click();
    await expect(add.getByText('Keep these for the next card')).toBeVisible();
    await add
      .getByRole('textbox', { name: 'Asking price in percent of the TCGplayer price' })
      .fill('90');
    await add.getByTestId('add-submit').click();
    await expect(row(page, 'Lantern Fox Spirit')).toContainText('90% TCG');
    await add.getByTestId('add-done').click();
    await expect(add).toHaveCount(0);
    await expect(page.getByTestId('inventory-summary')).toHaveText('2 cards · 3 copies · 0 public');

    // Edit card: a click on the row; Next saves first.
    await row(page, 'Lantern Fox Spirit').locator('.c-card').click();
    const edit = page.getByRole('dialog', { name: 'Edit card' });
    await expect(edit).toContainText('1 of 2 in All cards');
    await expect(edit.getByTestId('edit-save')).toHaveText(/No changes yet/);
    await expect(edit.getByRole('link', { name: /Check TCGplayer price/ })).toHaveAttribute(
      'href',
      /tcgplayer\.com\/search\/yugioh\/product\?q=Lantern/,
    );
    await edit.getByRole('button', { name: 'One more' }).click();
    await edit.getByTestId('edit-next').click();
    await expect(edit).toContainText('2 of 2 in All cards');
    await expect(row(page, 'Lantern Fox Spirit')).toContainText('×2');
    // The leave guard.
    await edit.getByRole('textbox', { name: 'Public note' }).fill('Sleeved, for trade');
    await edit.getByRole('button', { name: 'Close' }).click();
    const discard = page.getByRole('dialog', { name: 'Discard your changes?' });
    await discard.getByRole('button', { name: 'Keep editing' }).click();
    await edit.getByRole('radio', { name: 'Public' }).click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(toast(page, 'Saved').first()).toBeVisible();
    await expect(edit.getByTestId('edit-save')).toHaveText(/No changes yet/);
    // Previous with Alt+↑.
    await page.keyboard.press('Alt+ArrowUp');
    await expect(edit).toContainText('1 of 2 in All cards');
    await page.keyboard.press('Escape');
    await expect(edit).toHaveCount(0);
    const saved = await items(page, collector.idToken);
    const azure = saved.find((it) => it.card.name === 'Azure-Eyes Sky Dragon')!;
    expect(azure.visibility).toBe('PUBLIC');
    expect(azure.askingPriceText).toBe('85% TCG');

    // Delete from the row menu, then Undo from the toast.
    await page.getByTestId(`row-more-${azure.id}`).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete Azure-Eyes Sky Dragon?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(row(page, 'Azure-Eyes Sky Dragon')).toHaveCount(0);
    await toast(page, 'Card deleted').getByRole('button', { name: 'Undo' }).click();
    await expect(toast(page, 'Card restored')).toBeVisible();
    await expect(row(page, 'Azure-Eyes Sky Dragon')).toBeVisible();
    expect((await items(page, collector.idToken)).length).toBe(2);

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });

  test('inline price and copies, quick add rows, a bulk move refused for another game, a drag to a binder, a bulk delete with Undo', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'wbbulk');
    const ygo = await apiCreateBinder(request, collector.idToken, {
      name: 'E2E trades',
      gameId: await gameIdOf(request, collector.idToken, 'yugioh'),
    });
    for (const code of ['AZR-EN001', 'AZR-EN011', 'SVX-001']) {
      await apiCreateItem(request, collector.idToken, {
        printingId: await printingIdOf(request, collector.idToken, code),
        visibility: 'PRIVATE',
        conditionStated: false,
      });
    }
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/inventory');
    await expect(row(page, 'Emberfang Fox VMAX')).toBeVisible();

    // Inline price: [$ | % TCG] and a number; Enter saves.
    await row(page, 'Azure-Eyes Sky Dragon')
      .getByRole('button', { name: /^Asking price/ })
      .click();
    const editor = page.getByRole('group', { name: 'Asking price of Azure-Eyes Sky Dragon' });
    await editor.getByRole('radio', { name: 'Percent of the TCGplayer price' }).click();
    await editor.getByRole('textbox').fill('85');
    await page.keyboard.press('Enter');
    await expect(row(page, 'Azure-Eyes Sky Dragon')).toContainText('85% TCG');
    // Inline copies: the stepper on hover.
    await row(page, 'Lantern Fox Spirit').hover();
    await row(page, 'Lantern Fox Spirit')
      .getByRole('button', { name: 'One more Lantern Fox Spirit' })
      .click();
    await expect(row(page, 'Lantern Fox Spirit').locator('.qty > [aria-hidden="true"]')).toHaveText(
      '×2',
    );
    const afterInline = await items(page, collector.idToken);
    expect(
      afterInline.find((it) => it.card.name === 'Azure-Eyes Sky Dragon')?.askingPriceText,
    ).toBe('85% TCG');

    // Quick add rows (Shift+N): a code adds a row; an unknown code says so in place.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Shift+N');
    const quick = page.getByRole('region', { name: 'Quick add rows' });
    await quick.getByTestId('quick-code').fill('GLM-EN042');
    await expect(quick.getByTestId('quick-printing')).toContainText('GLM-EN042');
    await page.keyboard.press('Enter');
    await expect(quick.getByRole('list', { name: 'Added in this session' })).toContainText(
      "Monarch's Tempest Decree",
    );
    await expect(quick.getByTestId('quick-code')).toBeFocused();
    await expect(row(page, "Monarch's Tempest Decree")).toBeVisible();
    await quick.getByTestId('quick-code').fill('ZZZ-EN999');
    await page.keyboard.press('Enter');
    await expect(quick.getByTestId('quick-error')).toHaveText(
      'No Yu-Gi-Oh! card has that code. Try the code printed on the card, like LAVD-EN008.',
    );
    await page.keyboard.press('Escape');
    await expect(quick).toHaveCount(0);

    // Select two Yu-Gi-Oh! cards and the Pokémon card; Move to binder refuses the Pokémon card.
    await row(page, 'Azure-Eyes Sky Dragon').getByRole('checkbox').check();
    await row(page, 'Lantern Fox Spirit').getByRole('checkbox').check();
    await row(page, 'Emberfang Fox VMAX').getByRole('checkbox').check();
    const dock = page.getByRole('group', { name: 'Selected cards' });
    await expect(dock).toContainText('3 selected');
    await dock.getByTestId('bulk-move').click();
    await page.getByRole('menuitem', { name: 'E2E trades' }).click();
    await expect(toast(page, 'Moved 2 to E2E trades')).toContainText(
      "1 Pokémon card can't go in a Yu-Gi-Oh! binder.",
    );
    await expect(pane(page).getByTestId(`pane-binder-${ygo.id}`)).toContainText('2');
    // The focus stays in the dock after its action, and Esc on the page clears the selection
    // (WB review F7, U1): it no longer falls to the page's body.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('app-bulk-dock') !== null))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(dock).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');

    // A Pokémon card dragged onto the Yu-Gi-Oh! binder is refused before any request (spec 9.7).
    let bulkCalls = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/inventory\/items\/bulk$/.test(request.url())) {
        bulkCalls++;
      }
    });
    const target = pane(page).getByTestId(`pane-binder-${ygo.id}`);
    {
      const from = (await row(page, 'Emberfang Fox VMAX').locator('.c-art').boundingBox())!;
      const to = (await target.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await expect(target).not.toContainText('Move 1 card here');
      await page.mouse.up();
      await page.waitForTimeout(500);
      expect(bulkCalls).toBe(0);
      await expect(target).toContainText('2');
    }

    // Drag the new card's art onto the binder in the pane (the menu path is above).
    const source = row(page, "Monarch's Tempest Decree").locator('.c-art');
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await expect(target).toContainText('Move 1 card here');
    await page.mouse.up();
    await expect(toast(page, 'Moved 1 to E2E trades')).toBeVisible();
    await expect(target).toContainText('3');

    // Ctrl/Cmd+A in the table, Delete, then Undo brings every card back.
    await row(page, 'Azure-Eyes Sky Dragon').focus();
    await page.keyboard.press('ControlOrMeta+a');
    await expect(dock).toContainText('4 selected');
    await dock.getByTestId('bulk-delete').click();
    await page
      .getByRole('dialog', { name: 'Delete 4 cards?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('heading', { name: 'Your cards, in one place' })).toBeVisible();
    await toast(page, '4 cards deleted').getByRole('button', { name: 'Undo' }).click();
    await expect(toast(page, '4 cards restored')).toBeVisible();
    await expect(row(page, 'Emberfang Fox VMAX')).toBeVisible();
    expect((await items(page, collector.idToken)).length).toBe(4);
  });

  test("the owner reaches a public binder's page from Inventory; a hidden owner hears why and where to fix it; Skip to content stays on the page", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    // Declared a province, hidden from the map (the default): public cards nobody sees yet.
    const owner = await createOnboardedCollector(request, 'wbpublic', { location: true });
    const binder = await apiCreateBinder(request, owner.idToken, {
      name: 'E2E shown binder',
      gameId: await gameIdOf(request, owner.idToken, 'yugioh'),
    });
    await apiCreateItem(request, owner.idToken, {
      printingId: await printingIdOf(request, owner.idToken, 'AZR-EN001'),
      binderId: binder.id,
      visibility: 'PUBLIC',
      conditionStated: false,
    });
    await apiPublishBinder(request, owner.idToken, binder.id, 'UNTIL_DISABLED');
    await signInThroughUi(page, owner.email, owner.password);
    await page.goto('/inventory');
    const banner = page.getByTestId('visibility-banner');
    await expect(banner).toContainText(
      'You are hidden from the map and your profile is not public',
    );
    await expect(banner.getByRole('link', { name: 'Privacy settings' })).toHaveAttribute(
      'href',
      '/settings/privacy',
    );

    // Skip to content moves the focus into the page, never to Home (WB review A10).
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.locator('#main-content')).toBeFocused();

    // Visible to others once the owner is on the map: "View public page" (WB review F2).
    await apiUpdatePrivacy(request, owner.idToken, { discoverable: true });
    await page.goto(`/inventory?binder=${binder.id}`);
    await expect(banner).toHaveCount(0);
    const strip = page.getByTestId('binder-strip');
    await expect(strip.getByRole('link', { name: 'View public page' })).toBeVisible();
    await page.goto('/inventory?tab=binders');
    await expect(page.getByTestId(`binder-public-${binder.id}`)).toBeVisible();
    await page.getByTestId(`binder-public-${binder.id}`).click();
    await expect(page).toHaveURL(new RegExp(`/binders/${binder.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'E2E shown binder' })).toBeVisible();
  });

  test("the toolbar's Clear filters gives the focus to the list; a dropped photo stays on Inventory", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const collector = await createOnboardedCollector(request, 'wbclear');
    for (const code of ['AZR-EN001', 'SVX-001']) {
      await apiCreateItem(request, collector.idToken, {
        printingId: await printingIdOf(request, collector.idToken, code),
        visibility: 'PRIVATE',
        conditionStated: false,
      });
    }
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/inventory?q=azure');
    await expect(row(page, 'Azure-Eyes Sky Dragon')).toBeVisible();
    await expect(row(page, 'Emberfang Fox VMAX')).toHaveCount(0);

    // By keyboard: the link leaves with the filters, the focus lands on a row (WB review R1-1).
    await page.getByTestId('clear-filters').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(row(page, 'Emberfang Fox VMAX')).toBeVisible();
    await expect(page.getByTestId('clear-filters')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.closest('[role="row"][data-item-id]') !== null),
      )
      .toBe(true);

    // Only a .ydk or a .csv opens Import (spec 9.7, WB review R1-3): a photo says where it goes.
    const host = page.locator('app-inventory-page');
    const photo = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(['not a deck'], 'photo.png', { type: 'image/png' }));
      return data;
    });
    await host.dispatchEvent('dragenter', { dataTransfer: photo });
    await host.dispatchEvent('dragover', { dataTransfer: photo });
    await host.dispatchEvent('drop', { dataTransfer: photo });
    await expect(toast(page, 'Drop a .ydk or .csv file to import')).toContainText(
      'To add photos, open a card and drop them there.',
    );
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(row(page, 'Emberfang Fox VMAX')).toBeVisible();
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
    // The binder page (web stage WD, board W9): the owner row with the handle and the province
    // only, the cards with their price as typed; never a private note or a distance.
    await expect(page.getByRole('link', { name: owner.handle, exact: true })).toBeVisible();
    await expect(page.getByTestId('owner-public-label')).toContainText('Quebec');
    await expect(page.getByTestId('owner-public-label')).not.toContainText('Canada');
    await expect(page.getByTestId('owner-distance')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText(/\bkm\b/);
    await expect(page.getByText(/^\s*2 cards · Updated/)).toBeVisible();
    const dragon = page.getByTestId('binder-card').filter({ hasText: 'Azure-Eyes Sky Dragon' });
    await expect(dragon).toContainText('$45.00');
    await expect(dragon).toContainText('×1');
    // Offers left the web (decision 2): no "Accepting offers" chip.
    await expect(page.getByRole('main')).not.toContainText('Accepting offers');
    await expect(page.getByText('E2E-private-note-never-public')).toHaveCount(0);
    // A binder made before stage G holds both games: both cards show.
    await expect(
      page.getByTestId('binder-card').filter({ hasText: 'Emberfang Fox VMAX' }),
    ).toBeVisible();

    // ADR 0017: no JSON response carried a coordinate.
    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });

  test('binders: the Binders tab, New binder with its game tiles and the limit, Edit binder with the deck core fields, Move up, the game lock', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'wbbinders');
    const yugioh = await gameIdOf(request, collector.idToken, 'yugioh');
    for (let i = 1; i <= 4; i++) {
      await apiCreateBinder(request, collector.idToken, {
        name: `Limit binder ${i}`,
        gameId: yugioh,
      });
    }
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/inventory?tab=binders');
    await expect(page.getByTestId('binders-summary')).toHaveText('4 binders');
    await expect(page.getByRole('heading', { name: /Yu-Gi-Oh!/ })).toBeVisible();
    await expect(page.getByText('Selling a whole deck?')).toBeVisible();

    // New binder: the five game tiles, a deck core opens Edit binder on its fields.
    await page.getByTestId('binders-new').click();
    const create = page.getByRole('dialog', { name: 'New binder' });
    await expect(create.getByRole('radio', { name: /One Piece/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await create.getByTestId('new-binder-name').fill('Snake-Eye core');
    await create.getByRole('switch', { name: 'Sell as a deck core' }).click();
    await create.getByTestId('new-binder-create').click();
    const edit = page.getByRole('dialog', { name: 'Edit binder' });
    await expect(edit.getByTestId('binder-price')).toBeVisible();
    await edit.getByTestId('binder-price').fill('$180');
    await edit.getByRole('radio', { name: 'Private' }).click();
    await expect(
      edit.getByText('Buyers can only find a deck core when it is public.'),
    ).toBeVisible();
    await edit.getByRole('radio', { name: 'Public' }).click();
    await edit.getByTestId('binder-save').click();
    await expect(toast(page, 'Saved')).toBeVisible();
    await expect(page.getByTestId('binders-summary')).toHaveText('5 binders · 1 deck core');
    await expect(page.getByText('Deck core · $180').first()).toBeVisible();

    // The sixth binder: the limit, in plain words, nothing to buy.
    await edit.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('binders-new').click();
    await create.getByTestId('new-binder-name').fill('One binder too many');
    await create.getByTestId('new-binder-create').click();
    const limit = page.getByRole('alertdialog', { name: 'You reached a limit' });
    await expect(limit.getByTestId('limit-note')).toHaveText(
      'Every collector has the same limits.',
    );
    await limit.getByRole('button', { name: 'OK' }).click();
    await expect(create.getByTestId('new-binder-error')).toHaveText(
      'You have 5 binders, the most each collector can have. Every collector has the same limits.',
    );
    await expect(create).not.toContainText(/premium|upgrade|plan/i);
    await create.getByRole('button', { name: 'Cancel' }).click();

    // Move up from the card's menu (the drag's menu path); the order is saved.
    await page.getByRole('button', { name: 'More for Limit binder 3' }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    const yugiohBinders = page.getByRole('region', { name: /Yu-Gi-Oh!/ }).getByRole('listitem');
    await expect(yugiohBinders.nth(1)).toContainText('Limit binder 3');
    await page.reload();
    await expect(yugiohBinders.nth(1)).toContainText('Limit binder 3');

    // The game lock: an empty binder may change game, until a card lands in it (409).
    await page.getByRole('button', { name: 'More for Limit binder 4' }).click();
    await page.getByRole('menuitem', { name: 'Edit binder' }).click();
    await edit.getByRole('combobox', { name: 'Game' }).click();
    await page.getByRole('option', { name: /Pokémon/ }).click();
    const binders = await (
      await request.get(`${API_URL}/api/v1/binders`, { headers: authHeader(collector.idToken) })
    ).json();
    const four = (binders as { id: string; name: string }[]).find(
      (b) => b.name === 'Limit binder 4',
    )!;
    await apiCreateItem(request, collector.idToken, {
      printingId: await printingIdOf(request, collector.idToken, 'AZR-EN001'),
      binderId: four.id,
    });
    await edit.getByTestId('binder-save').click();
    await expect(edit.getByRole('alert')).toHaveText(
      "This binder already has Yu-Gi-Oh! cards, so its game can't change.",
    );
  });
});

/** The id of a game (`GET /games`). */
async function gameIdOf(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  slug: string,
): Promise<string> {
  const response = await request.get(`${API_URL}/api/v1/games`, { headers: authHeader(token) });
  expect(response.ok()).toBeTruthy();
  const game = ((await response.json()) as { id: string; slug: string }[]).find(
    (g) => g.slug === slug,
  );
  expect(game, `game ${slug}`).toBeTruthy();
  return game!.id;
}
