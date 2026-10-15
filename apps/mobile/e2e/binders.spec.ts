import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  openInApp,
  openTab,
  PHOTO_PNG,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/** The seed's public Yu-Gi-Oh! trade binder of collector1 (db/seed/inventory.json). */
const SEED_PUBLIC_BINDER = '00000000-0000-4000-8b00-000000000101';

/** Adds a card to a collector's inventory through the API (the first printing of a search hit). */
async function addCardThroughApi(
  request: APIRequestContext,
  token: string,
  query: string,
  fields: Record<string, unknown> = {}
): Promise<string> {
  const cards = await request.get(`${API_URL}/api/v1/cards?query=${encodeURIComponent(query)}`);
  expect(cards.ok(), 'GET /cards').toBeTruthy();
  const cardId = ((await cards.json()) as { items: { id: string }[] }).items[0]?.id;
  const card = await request.get(`${API_URL}/api/v1/cards/${cardId}`);
  const printingId = ((await card.json()) as { printings: { id: string }[] }).printings[0]?.id;
  const created = await request.post(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(token),
    data: { printingId, quantity: 1, condition: 'NEAR_MINT', availability: 'TRADE', ...fields },
  });
  expect(created.status(), 'POST /inventory/items').toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function item(request: APIRequestContext, token: string, id: string) {
  const response = await request.get(`${API_URL}/api/v1/inventory/items/${id}`, {
    headers: authHeader(token),
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    binder?: { id: string; name: string } | null;
    visibility: string;
  };
}

interface SavedBinder {
  id: string;
  name: string;
  visibility: string;
  sellsAsCore: boolean;
  askingPriceText: string | null;
  askingPrice: number | null;
  description: string;
  photos: { url: string }[];
}

async function binders(request: APIRequestContext, token: string): Promise<SavedBinder[]> {
  const response = await request.get(`${API_URL}/api/v1/binders`, { headers: authHeader(token) });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as SavedBinder[];
}

/**
 * Binders and deck cores on the phone (owner spec 2026-10-14, section 7, stage R3) against the real
 * stack: Inventory › Binders, New binder and Edit binder with "Sell as a deck core" (photos, a
 * price as typed, a note, key cards picked from the inventory), the deck core page as its owner and
 * a buyer see it, a plain binder kept, renamed, emptied and deleted, the binder limit, and another
 * collector's public binder (a state only, public cards only).
 */
test.describe('mobile binders and deck cores', () => {
  requireStack();

  test('make a binder a deck core with a photo and a price, see it on its page, edit and delete it', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const seller = await createOnboardedCollector(request, 'core', 'Mobile Core Seller', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const itemId = await addCardThroughApi(request, seller.idToken, 'Lantern Fox Spirit', {
      quantity: 3,
      visibility: 'PRIVATE',
    });
    const dragonId = await addCardThroughApi(request, seller.idToken, 'Azure-Eyes Sky Dragon', {
      visibility: 'PRIVATE',
    });
    await signInThroughUi(page, seller.email, seller.password);

    // Inventory › Binders (screen 17): empty, then New binder.
    await openTab(page, 'Inventory');
    const inventory = screen(page, 'inventory');
    await inventory.getByRole('tab', { name: /^Binders/ }).click();
    await expect(inventory.getByText('No binders yet')).toBeVisible({ timeout: 30_000 });
    await inventory.getByTestId('inventory-new-binder').click();

    // New binder (screen 18): the switch, a photo, the price, the note and a key card.
    const form = screen(page, 'new-binder');
    await expect(form.getByRole('button', { name: 'Create binder' })).toBeDisabled({
      timeout: 30_000,
    });
    await form.getByLabel('Name').fill('Lantern core');
    await expect(form.getByRole('radio', { name: 'Private' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await form.getByRole('switch', { name: 'Sell as a deck core' }).click();
    await expect(form.getByRole('radio', { name: 'Public' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(form.getByText('Collectors in Americas (North) can find it.')).toBeVisible();
    await expect(form.getByTestId('binder-cards-title')).toHaveText('Key cards · optional');
    const chooser = page.waitForEvent('filechooser');
    await form.getByRole('button', { name: 'Add photos' }).click();
    await (await chooser).setFiles({ name: 'core.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(form.getByTestId('card-photos-count')).toHaveText('1 / 4');
    await form.getByLabel('Asking price').fill('$180');
    await form.getByLabel('Public note').fill('All NM, English. Sleeves included.');
    await form.getByRole('button', { name: 'Add cards' }).click();
    const sheet = page.getByTestId('card-picker-sheet');
    await sheet.getByRole('checkbox', { name: /^Lantern Fox Spirit/ }).click();
    await sheet.getByRole('checkbox', { name: /^Azure-Eyes Sky Dragon/ }).click();
    await sheet.getByRole('button', { name: 'Add 2 cards' }).click();
    await expect(form.getByText('Added when you save')).toHaveCount(2);

    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && /\/binders\/[^/]+\/images$/.test(response.url())
    );
    await form.getByRole('button', { name: 'Create binder' }).click();
    expect((await upload).status()).toBe(201);
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    await expect(snackbar(page)).toContainText('Lantern core');

    const [core] = await binders(request, seller.idToken);
    expect(core).toMatchObject({
      name: 'Lantern core',
      visibility: 'PUBLIC',
      sellsAsCore: true,
      askingPriceText: '$180',
      askingPrice: 180,
      description: 'All NM, English. Sleeves included.',
    });
    expect(core?.photos).toHaveLength(1);
    const moved = await item(request, seller.idToken, itemId);
    expect(moved.binder?.name).toBe('Lantern core');
    // The cards keep the visibility their collector gave them: buyers see them as the deck
    // core's key cards, never one by one.
    expect(moved.visibility).toBe('PRIVATE');
    expect((await item(request, seller.idToken, dragonId)).visibility).toBe('PRIVATE');

    // Back on Inventory › Binders: the deck core with its tag.
    const list = screen(page, 'inventory');
    await expect(list.getByTestId('binders-summary')).toHaveText('1 deck core', {
      timeout: 30_000,
    });
    const row = list.getByRole('button', {
      name: /^Lantern core, 1 photo · Public, Deck core · \$180/,
    });
    await expect(row).toBeVisible();
    await row.click();

    // Edit binder, then its public page (what buyers see).
    const edit = screen(page, 'edit-binder');
    await expect(edit.getByLabel('Name')).toHaveValue('Lantern core', { timeout: 30_000 });
    await expect(edit.getByRole('button', { name: 'No changes yet' })).toBeDisabled();
    await edit.getByRole('link', { name: 'See its public page' }).click();
    const page16 = page.getByTestId('deck-core-page').filter({ visible: true });
    await expect(page16.getByTestId('deck-core-name')).toHaveText('Lantern core', {
      timeout: 30_000,
    });
    await expect(page16.getByTestId('deck-core-tag')).toHaveText('Deck core');
    await expect(page16.getByTestId('deck-core-price')).toHaveText('$180');
    await expect(page16.getByTestId('deck-core-seller-line')).toHaveText(
      'Quebec · 1 public binder'
    );
    await expect(page16.getByRole('link', { name: /^Lantern Fox Spirit, 3 copies/ })).toBeVisible();
    await expect(
      page16.getByRole('link', { name: /^Azure-Eyes Sky Dragon, 1 copy/ })
    ).toBeVisible();

    // "Edit binder" goes back to the Edit binder it came from (never a second one over it).
    await page16.getByRole('button', { name: 'Edit binder' }).click();
    await expect(edit.getByLabel('Name')).toHaveValue('Lantern core', { timeout: 30_000 });
    await expect(page.getByTestId('screen-edit-binder')).toHaveCount(1);
    // A card taken out of the deck core stays private.
    await edit.getByRole('button', { name: 'Remove Lantern Fox Spirit from this binder' }).click();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    await expect
      .poll(async () => (await item(request, seller.idToken, itemId)).binder ?? null)
      .toBeNull();
    expect((await item(request, seller.idToken, itemId)).visibility).toBe('PRIVATE');

    // From its page, Edit binder and Save changes: the page under it shows the new price.
    await openInApp(page, `/binders/${core!.id}?view=public`);
    const again = page.getByTestId('deck-core-page').filter({ visible: true });
    await expect(again.getByTestId('deck-core-price')).toHaveText('$180', { timeout: 30_000 });
    await again.getByRole('button', { name: 'Edit binder' }).click();
    const second = screen(page, 'edit-binder');
    await second.getByLabel('Asking price').fill('$150', { timeout: 30_000 });
    await second.getByRole('button', { name: 'Save changes' }).click();
    await expect(again.getByTestId('deck-core-price')).toHaveText('$150', { timeout: 30_000 });
    await expect(again.getByRole('link', { name: /^Lantern Fox Spirit/ })).toHaveCount(0);

    // Delete binder closes every screen of it; the card left in it stays private.
    await again.getByRole('button', { name: 'Edit binder' }).click();
    await screen(page, 'edit-binder')
      .getByRole('button', { name: 'Delete binder' })
      .click({ timeout: 30_000 });
    const confirm = page.getByTestId('edit-binder-delete-sheet');
    await expect(
      confirm.getByText('Its photos, price and note go away. Your cards stay in your inventory.')
    ).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete binder' }).click();
    await expect(snackbar(page)).toContainText('Binder deleted', { timeout: 30_000 });
    await expect(screen(page, 'inventory').getByText('No binders yet')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('deck-core-page').filter({ visible: true })).toHaveCount(0);
    const left = await item(request, seller.idToken, dragonId);
    expect(left.binder ?? null).toBeNull();
    expect(left.visibility).toBe('PRIVATE');
  });

  test('a buyer sees a deck core page and messages the seller', async ({ page, request }) => {
    test.setTimeout(180_000);
    const seller = await createOnboardedCollector(request, 'cseller', 'Mobile Core Owner', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const created = await request.post(`${API_URL}/api/v1/binders`, {
      headers: authHeader(seller.idToken),
      data: {
        name: 'Lantern engine',
        visibility: 'PUBLIC',
        sellsAsCore: true,
        askingPriceText: 'Trade only',
        description: 'Three Lantern Fox Spirit, all NM.',
      },
    });
    expect(created.status(), 'POST /binders').toBe(201);
    const coreId = ((await created.json()) as { id: string }).id;
    await addCardThroughApi(request, seller.idToken, 'Lantern Fox Spirit', {
      quantity: 3,
      binderId: coreId,
    });
    const photo = await request.post(`${API_URL}/api/v1/binders/${coreId}/images`, {
      headers: authHeader(seller.idToken),
      multipart: { file: { name: 'core.png', mimeType: 'image/png', buffer: PHOTO_PNG } },
    });
    expect(photo.status(), 'POST /binders/{id}/images').toBe(201);

    const buyer = await createOnboardedCollector(request, 'cbuy', 'Mobile Core Buyer', {
      location: PLACES.ontario,
    });
    await signInThroughUi(page, buyer.email, buyer.password);
    await openInApp(page, `/binders/${coreId}`);
    const seen = page.getByTestId('deck-core-page').filter({ visible: true });
    await expect(seen.getByTestId('deck-core-name')).toHaveText('Lantern engine', {
      timeout: 30_000,
    });
    await expect(seen.getByTestId('deck-core-tag')).toHaveText('Deck core');
    await expect(seen.getByTestId('deck-core-price')).toHaveText('Trade only');
    await expect(seen.getByTestId('deck-core-note')).toHaveText(
      'Three Lantern Fox Spirit, all NM.'
    );
    await expect(seen.getByTestId('deck-core-seller-line')).toHaveText('Quebec · 1 public binder');
    await expect(seen.getByTestId('deck-core-seller')).not.toContainText(/Montréal|\bkm\b/);
    await expect(seen.getByTestId('deck-core-photos-page-1')).toBeAttached();
    // A key card opens the card page (Who has this card comes with stage R5).
    await expect(seen.getByRole('link', { name: /^Lantern Fox Spirit, 3 copies/ })).toBeVisible();
    // Message opens the chat with the seller (the deck core is pinned to it from stage R4).
    await seen.getByRole('button', { name: `Message ${seller.handle}` }).click();
    await expect(screen(page, 'conversation')).toBeVisible({ timeout: 30_000 });
  });

  test('a plain binder: create, add a card, rename, take the card out and delete it', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'bind', 'Mobile Binders');
    const itemId = await addCardThroughApi(request, collector.idToken, 'Lantern Fox Spirit');
    await signInThroughUi(page, collector.email, collector.password);
    await openInApp(page, '/binders/new');

    const form = screen(page, 'new-binder');
    await form.getByLabel('Name').fill('Mobile trades', { timeout: 30_000 });
    await expect(form.getByText('Only you see it until you make it public.')).toBeVisible();
    await expect(form.getByText('No cards in this binder yet.')).toBeVisible();
    await form.getByRole('button', { name: 'Add cards' }).click();
    const sheet = page.getByTestId('card-picker-sheet');
    await sheet.getByRole('checkbox', { name: /^Lantern Fox Spirit/ }).click();
    await sheet.getByRole('button', { name: 'Add 1 card' }).click();
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    const [saved] = await binders(request, collector.idToken);
    expect(saved).toMatchObject({
      name: 'Mobile trades',
      visibility: 'PRIVATE',
      sellsAsCore: false,
    });
    const filed = await item(request, collector.idToken, itemId);
    expect(filed.binder?.name).toBe('Mobile trades');
    // A plain binder leaves its cards' own visibility alone.
    expect(filed.visibility).toBe('PRIVATE');

    await openInApp(page, `/binders/edit?id=${saved!.id}`);
    const edit = screen(page, 'edit-binder');
    await expect(edit.getByTestId('binder-cards-title')).toHaveText('Cards inside', {
      timeout: 30_000,
    });
    await expect(edit.getByTestId(`binder-card-${itemId}`)).toBeVisible({ timeout: 30_000 });
    await edit.getByLabel('Name').fill('Mobile trades 2026');
    await edit.getByRole('button', { name: 'Remove Lantern Fox Spirit from this binder' }).click();
    await expect(edit.getByText('Leaves when you save')).toBeVisible();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(snackbar(page)).toContainText('Mobile trades 2026', { timeout: 30_000 });
    expect((await item(request, collector.idToken, itemId)).binder ?? null).toBeNull();

    // The binder's own link (/binders/{id}: a profile row, a chat card, a deep link) opens Edit
    // binder for its owner; "Delete binder" there lands on Inventory › Binders too, never on
    // "This binder is not available" (review fix 2 of stage R3).
    await openInApp(page, `/binders/${saved!.id}`);
    const again = screen(page, 'binder');
    await again.getByRole('button', { name: 'Delete binder' }).click({ timeout: 30_000 });
    const confirm = page.getByTestId('edit-binder-delete-sheet');
    await expect(confirm.getByText('Delete Mobile trades 2026?')).toBeVisible();
    await expect(confirm.getByText('Your cards stay in your inventory.')).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete binder' }).click();
    await expect(snackbar(page)).toContainText('Binder deleted', { timeout: 30_000 });
    await expect(screen(page, 'inventory').getByText('No binders yet')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('public-binder-not-found')).toHaveCount(0);
    expect(await binders(request, collector.idToken)).toEqual([]);
  });

  test('the binder limit, the same for everyone, is explained when creating one more', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'blim', 'Mobile Limits');
    for (let i = 1; i <= 5; i++) {
      const created = await request.post(`${API_URL}/api/v1/binders`, {
        headers: authHeader(collector.idToken),
        data: { name: `Binder ${i}` },
      });
      expect(created.status(), `binder ${i}`).toBe(201);
    }
    await signInThroughUi(page, collector.email, collector.password);
    await openInApp(page, '/binders/new');
    const form = screen(page, 'new-binder');
    await form.getByLabel('Name').fill('One too many', { timeout: 30_000 });
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form.getByTestId('binder-limit')).toContainText(
      'You reached the number of binders you can have',
      { timeout: 30_000 }
    );
    await expect(form.getByTestId('binder-limit-message')).toHaveText(
      'You have used 5 of 5 binders. Delete a binder you no longer need.'
    );
    // Stage F1: nothing to buy.
    await expect(form.getByTestId('binder-limit')).not.toContainText(/premium|plan|upgrade/i);
  });

  test('another collector’s public binder shows public cards and a state only', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'bview', 'Mobile Visitor');
    await signInThroughUi(page, collector.email, collector.password);
    await openInApp(page, `/binders/${SEED_PUBLIC_BINDER}`);
    const binder = screen(page, 'binder');
    await expect(binder.getByTestId('public-binder-title')).toHaveText('Yu-Gi-Oh! trade binder', {
      timeout: 30_000,
    });
    await expect(binder.getByTestId('public-binder-owner')).toContainText('collector1');
    // The owner's province (ADR 0017): never their city (collector1 shows Montréal on their
    // profile only) or a distance.
    await expect(binder.getByTestId('public-binder-owner-line')).toHaveText(
      /^Quebec · \d+ public binders?$/
    );
    await expect(binder.getByTestId('public-binder-owner')).not.toContainText(/Montréal|\bkm\b/);
    await expect(binder.getByText('Azure-Eyes Sky Dragon', { exact: true })).toBeVisible();
    // Private notes never reach other collectors; public notes do.
    await expect(binder.getByText('“Pack fresh, sleeved since opening.”')).toBeVisible();
    await expect(binder.getByText('Pulled from a booster box in the spring.')).toHaveCount(0);
    // No owner actions; the chat with the owner instead.
    await expect(binder.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(binder.getByRole('button', { name: 'Message collector1' })).toBeVisible();

    // Search this binder.
    await binder.getByLabel('Search this binder').fill('Lantern');
    await expect(binder.getByTestId('public-binder-count')).toHaveText('1 card', {
      timeout: 30_000,
    });
    await expect(binder.getByText('Lantern Fox Spirit', { exact: true })).toBeVisible();
    await expect(binder.getByText('Azure-Eyes Sky Dragon', { exact: true })).toHaveCount(0);
  });
});
