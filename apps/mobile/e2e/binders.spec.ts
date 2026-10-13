import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  openInApp,
  openTab,
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
  query: string
): Promise<string> {
  const cards = await request.get(`${API_URL}/api/v1/cards?query=${encodeURIComponent(query)}`);
  expect(cards.ok(), 'GET /cards').toBeTruthy();
  const cardId = ((await cards.json()) as { items: { id: string }[] }).items[0]?.id;
  const card = await request.get(`${API_URL}/api/v1/cards/${cardId}`);
  const printingId = ((await card.json()) as { printings: { id: string }[] }).printings[0]?.id;
  const created = await request.post(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(token),
    data: { printingId, quantity: 1, condition: 'NEAR_MINT', availability: 'TRADE' },
  });
  expect(created.status(), 'POST /inventory/items').toBe(201);
  return ((await created.json()) as { id: string }).id;
}

async function item(request: APIRequestContext, token: string, id: string) {
  const response = await request.get(`${API_URL}/api/v1/inventory/items/${id}`, {
    headers: authHeader(token),
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { binder?: { id: string; name: string } | null };
}

/**
 * Mobile Phase 3 (binders) against the real stack: create a binder, add a card to it, publish
 * it for 24 hours, remove the card and delete the binder; the plan's binder limit; a public
 * binder of another collector (owner area only, public cards only).
 */
test.describe('mobile binders', () => {
  requireStack();

  test('create a binder, add a card, publish it, remove the card and delete it', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'bind', 'Mobile Binders');
    const itemId = await addCardThroughApi(request, collector.idToken, 'Lantern Fox Spirit');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Inventory');
    const inventory = screen(page, 'inventory');
    await inventory.getByRole('tab', { name: 'Binders' }).click();
    await expect(inventory.getByText('No binders yet')).toBeVisible({ timeout: 30_000 });
    await inventory.getByRole('button', { name: 'New binder' }).click();

    const form = screen(page, 'new-binder');
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form.getByText('Give your binder a name.')).toBeVisible();
    await form.getByLabel('Binder name').fill('Mobile trades');
    await form.getByRole('radio', { name: 'Trade binder' }).click();
    await form.getByLabel('Description (optional)').fill('Doubles for trade.');
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(snackbar(page)).toHaveText('Binder “Mobile trades” created.', { timeout: 30_000 });

    // The new binder opens: private and empty.
    const binder = screen(page, 'binder');
    await expect(binder.getByTestId('binder-title')).toHaveText('Mobile trades', {
      timeout: 30_000,
    });
    await expect(binder.getByTestId('binder-visibility')).toHaveText('Private');
    await expect(binder.getByText('This binder is empty')).toBeVisible();

    // Add the card from the inventory.
    await binder.getByRole('button', { name: 'Add cards' }).click();
    const sheet = page.getByTestId('add-items-sheet');
    await sheet.getByRole('checkbox', { name: /^Lantern Fox Spirit/ }).click();
    await sheet.getByRole('button', { name: 'Add 1 card' }).click();
    await expect(snackbar(page)).toHaveText('1 card added to “Mobile trades”.', {
      timeout: 30_000,
    });
    await expect(binder.getByRole('button', { name: /^Lantern Fox Spirit/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(binder.getByTestId('binder-counts')).toHaveText('Trade binder · 1 card');
    expect((await item(request, collector.idToken, itemId)).binder?.name).toBe('Mobile trades');

    // Publish for 24 hours (the collector is not discoverable: public, but not visible yet).
    await binder.getByRole('button', { name: 'Publish' }).click();
    await page.getByTestId('binder-publish-ONE_DAY').click();
    await expect(snackbar(page)).toHaveText('“Mobile trades” is public for 24 hours.', {
      timeout: 30_000,
    });
    await expect(binder.getByTestId('binder-visibility')).toHaveText(/^Public · ends in/);
    const mine = await request.get(`${API_URL}/api/v1/binders`, {
      headers: authHeader(collector.idToken),
    });
    const [saved] = (await mine.json()) as { visibility: string; description: string }[];
    expect(saved).toMatchObject({
      visibility: 'TEMPORARILY_PUBLIC',
      description: 'Doubles for trade.',
    });

    // Private again, then the card leaves the binder (unfiled).
    await binder.getByRole('button', { name: 'Make private' }).click();
    await expect(snackbar(page)).toHaveText('“Mobile trades” is private now.', { timeout: 30_000 });
    await binder.getByRole('button', { name: 'Remove Lantern Fox Spirit from the binder' }).click();
    await expect(snackbar(page)).toHaveText(
      'Lantern Fox Spirit removed from “Mobile trades”. It is unfiled now.',
      { timeout: 30_000 }
    );
    await expect(binder.getByText('This binder is empty')).toBeVisible({ timeout: 30_000 });
    expect((await item(request, collector.idToken, itemId)).binder ?? null).toBeNull();

    // Rename, then delete after a confirmation.
    await binder.getByRole('button', { name: 'Edit' }).click();
    const edit = screen(page, 'edit-binder');
    await expect(edit.getByLabel('Binder name')).toHaveValue('Mobile trades', { timeout: 30_000 });
    await edit.getByLabel('Binder name').fill('Mobile trades 2026');
    await edit.getByRole('button', { name: 'Save binder' }).click();
    await expect(snackbar(page)).toHaveText('Binder saved.', { timeout: 30_000 });
    await expect(screen(page, 'binder').getByTestId('binder-title')).toHaveText(
      'Mobile trades 2026',
      { timeout: 30_000 }
    );
    await screen(page, 'binder').getByRole('button', { name: 'Delete' }).click();
    await page
      .getByTestId('binder-delete-dialog')
      .getByRole('button', { name: 'Delete binder' })
      .click();
    await expect(snackbar(page)).toHaveText('Binder “Mobile trades 2026” deleted.', {
      timeout: 30_000,
    });
    const after = await request.get(`${API_URL}/api/v1/binders`, {
      headers: authHeader(collector.idToken),
    });
    expect(await after.json()).toEqual([]);
  });

  test('the plan’s binder limit is explained when creating one more', async ({ page, request }) => {
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
    await page.goto('/binders/new');
    const form = screen(page, 'new-binder');
    await form.getByLabel('Binder name').fill('One too many', { timeout: 30_000 });
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form.getByTestId('binder-limit')).toContainText(
      'You reached the number of binders your plan allows',
      { timeout: 30_000 }
    );
    await expect(form.getByTestId('binder-limit-message')).toHaveText(
      /^You have used 5 of 5 binders on the Free plan\./
    );
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
    await expect(binder.getByTestId('public-binder-owner')).toContainText('@collector1');
    // The owner's state and country (ADR 0017): never their city (collector1 shows Montréal on
    // their profile only; the binder's own description may name places) or a distance.
    await expect(binder.getByTestId('public-binder-owner-area')).toHaveText('Quebec, Canada');
    await expect(binder.getByTestId('public-binder-owner')).not.toContainText(/Montréal|\bkm\b/);
    await expect(binder.getByText('Azure-Eyes Sky Dragon', { exact: true })).toBeVisible();
    // Private notes never reach other collectors; public notes do.
    await expect(binder.getByText('“Pack fresh, sleeved since opening.”')).toBeVisible();
    await expect(binder.getByText('Pulled at the spring locals.')).toHaveCount(0);
    // No owner actions.
    await expect(binder.getByRole('button', { name: 'Publish' })).toHaveCount(0);

    // Availability filter.
    await binder.getByRole('button', { name: 'Availability: Any availability' }).click();
    await page.getByTestId('public-binder-availability-option-SALE').click();
    await expect(binder.getByTestId('public-binder-count')).toHaveText('1 card', {
      timeout: 30_000,
    });
  });
});
