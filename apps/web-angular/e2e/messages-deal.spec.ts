import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  openAccountMenu,
  requireStack,
  signInThroughUi,
  stubCardImages,
  forbidMapProviders,
} from './support/stack';

/**
 * Web stage WC, Messages: the deal beside the chat (spec 10, boards W18 to W21), against the real
 * local stack with two browser contexts. A buyer finds the seller's card in Who has this card and
 * presses Message: the non-modal chat drawer opens about that card (F6 and Esc), then the chat in
 * Messages with the deal panel; the buyer sends a quick reply, an address and an e-Transfer email
 * typed in their dialogs (nothing of them is ever written to localStorage, sessionStorage or
 * IndexedDB). The seller marks one of two copies sold with a tracking number, both read the sale
 * note live, the seller undoes it from the note, marks it sold again and rates the buyer from the
 * note. The tracking number never reaches the browser console. A narrow window goes to
 * `/messages/:id` and shows the deal panel as a sheet. No JSON answer carries a coordinate.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

const TRACKING = '1Z999AA10123456784';
const ADDRESS = 'Rae Buyer\n42 Fictional Street\nToronto, ON M5V 0A1';
const EMAIL = 'rae.buyer@example.test';

interface Deal {
  seller: OnboardedCollector;
  buyer: OnboardedCollector;
  cardId: string;
  cardName: string;
}

/** A seller in Quebec with two copies of one card in a public binder, and a buyer in Ontario. */
async function createDeal(api: APIRequestContext): Promise<Deal> {
  const seller = await createOnboardedCollector(api, 'dsell', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-QC' },
    displayName: `Sam Seller ${suffix()}`,
  });
  await apiUpdatePrivacy(api, seller.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, seller.idToken, {
    name: `E2E deal binder ${suffix()}`,
    kind: 'SALE',
    description: 'Fictional binder for the deal chat E2E suite.',
  });
  const item = await apiCreateItem(api, seller.idToken, {
    printingId: await printingIdOf(api, seller.idToken, 'AZR-EN001'),
    binderId: binder.id,
    quantity: 2,
    condition: 'NEAR_MINT',
    availability: 'SALE',
    askingPriceText: '$16',
  });
  await apiPublishBinder(api, seller.idToken, binder.id, 'UNTIL_DISABLED');
  const read = await api.get(`${API_URL}/api/v1/inventory/items/${item.id}`, {
    headers: authHeader(seller.idToken),
  });
  expect(read.ok()).toBeTruthy();
  const detail = (await read.json()) as { card: { id: string; name: string } };
  const buyer = await createOnboardedCollector(api, 'dbuy', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-ON' },
    displayName: `Rae Buyer ${suffix()}`,
  });
  return { seller, buyer, cardId: detail.card.id, cardName: detail.card.name };
}

async function openSignedIn(
  browser: Browser,
  collector: OnboardedCollector,
  viewport = { width: 1440, height: 900 },
): Promise<{ page: Page; console: string[] }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const lines: string[] = [];
  page.on('console', (message) => lines.push(message.text()));
  await stubCardImages(page);
  await forbidMapProviders(page);
  await signInThroughUi(page, collector.email, collector.password);
  return { page, console: lines };
}

async function expectLive(page: Page): Promise<void> {
  await expect(page.getByTestId('realtime-status').first()).toHaveAttribute(
    'data-state',
    'connected',
    { timeout: 20_000 },
  );
}

/** Everything the page keeps in localStorage, sessionStorage and every IndexedDB store, as text. */
async function browserStorage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    const databases = (await indexedDB.databases?.()) ?? [];
    for (const info of databases) {
      if (!info.name) {
        continue;
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(store, 'readonly').objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error);
        });
        parts.push(JSON.stringify(values));
      }
      db.close();
    }
    return parts.join('\n');
  });
}

test.describe('Messages: the deal beside the chat (web WC)', () => {
  requireStack();

  test('a buyer chats from the card page drawer, the seller marks it sold with tracking, undoes it and rates', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const { seller, buyer, cardId, cardName } = await createDeal(request);

    const sellerSide = await openSignedIn(browser, seller);
    const sellerPage = sellerSide.page;
    const watchSeller = watchCoordinates(sellerPage);
    await sellerPage.goto('/messages');
    await expect(sellerPage.getByRole('heading', { name: 'No chats yet' })).toBeVisible();
    await expectLive(sellerPage);

    // --- The buyer: Who has this card, Message, the chat drawer ---------------------------------
    const buyerSide = await openSignedIn(browser, buyer);
    const buyerPage = buyerSide.page;
    const watchBuyer = watchCoordinates(buyerPage);
    await buyerPage.goto(`/search?card=${cardId}`);
    const message = buyerPage.getByRole('button', {
      name: `Message ${seller.handle} about ${cardName}`,
    });
    await expect(message).toBeVisible({ timeout: 20_000 });
    await message.click();
    const drawer = buyerPage.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'false');
    await expect(drawer.getByTestId('pinned-bar')).toContainText(cardName);
    await expect(drawer.getByTestId('pinned-bar')).toContainText('$16');
    await expect(drawer.getByTestId('chat-tip')).toContainText(
      'Check their rating before you send an e-Transfer, and ask for tracking.',
    );
    // The page stays usable beside it: no scrim, the holders' list is still there.
    await expect(message).toBeVisible();

    // A quick reply goes out as it is.
    await drawer.getByRole('button', { name: 'Send “Is it still available?”' }).click();
    const drawerLog = drawer.getByRole('log', { name: `Messages with ${seller.handle}` });
    await expect(drawerLog).toContainText('Is it still available?');

    // F6 moves between the page and the drawer; Esc closes it and the focus goes back.
    const field = drawer.getByRole('textbox', { name: 'Message' });
    await field.focus();
    await buyerPage.keyboard.press('F6');
    await expect(message).toBeFocused();
    await buyerPage.keyboard.press('F6');
    await expect(field).toBeFocused();
    await buyerPage.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(message).toBeFocused();

    // Open again, then go full page: the inbox, the chat and the deal panel (lg).
    await message.click();
    await drawer.getByTestId('open-in-messages').click();
    await expect(buyerPage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const chatB = buyerPage.getByRole('region', { name: `Chat with ${seller.handle}` });
    const dealB = buyerPage.getByTestId('deal-panel');
    await expect(dealB).toContainText('How deals work here');
    await expect(dealB).toContainText(
      'OrenjiTrade never holds the money and does not protect payments.',
    );
    await expect(dealB).toContainText(seller.handle);
    await expect(dealB).toContainText('Quebec, Canada');
    await expectLive(buyerPage);

    // "Send my address" and "Send my e-Transfer email": typed each time, never saved.
    await chatB.getByRole('button', { name: 'Share in this chat' }).click();
    await buyerPage.getByRole('menuitem', { name: /Send my address/ }).click();
    const addressDialog = buyerPage.getByRole('dialog', { name: 'Send my address' });
    await expect(addressDialog).toContainText(
      `OrenjiTrade doesn’t keep this. It goes only into this chat, where you and ${seller.handle} can see it.`,
    );
    await addressDialog.getByRole('textbox', { name: 'Name and mailing address' }).fill(ADDRESS);
    await addressDialog.getByRole('button', { name: 'Send in this chat' }).click();
    await expect(addressDialog).toBeHidden();
    await expect(buyerPage.getByText('Address sent in this chat')).toBeVisible();
    const logB = chatB.getByRole('log', { name: `Messages with ${seller.handle}` });
    await expect(logB).toContainText('Ship to:');
    await expect(logB).toContainText('42 Fictional Street');

    await chatB.getByRole('button', { name: 'Share in this chat' }).click();
    await buyerPage.getByRole('menuitem', { name: /Send my e-Transfer email/ }).click();
    const emailDialog = buyerPage.getByRole('dialog', { name: 'Send my e-Transfer email' });
    const emailField = emailDialog.getByRole('textbox', { name: 'Your e-Transfer email' });
    await emailField.fill(EMAIL);
    await emailField.press('Enter');
    await expect(emailDialog).toBeHidden();
    await expect(logB).toContainText(`e-Transfer to ${EMAIL}`);

    const stored = await browserStorage(buyerPage);
    expect(stored, 'the address in the browser storage').not.toContain('42 Fictional Street');
    expect(stored, 'the e-Transfer email in the browser storage').not.toContain(EMAIL);

    // --- The seller: the chat arrives live, the deal panel, Mark as sold -----------------------
    const row = sellerPage.locator(`[data-conversation="${buyer.handle}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    // The first chat opened from /messages by keyboard keeps the focus on its row, and Esc from
    // the chat comes back to it (spec 10.2; WC review F5, U3, A1).
    await row.focus();
    await sellerPage.keyboard.press('Enter');
    await expect(sellerPage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    await expect(row).toBeFocused();
    const chatS = sellerPage.getByRole('region', { name: `Chat with ${buyer.handle}` });
    await chatS.getByRole('textbox', { name: 'Message' }).focus();
    await sellerPage.keyboard.press('Escape');
    await expect(row).toBeFocused();
    await expect(chatS.getByTestId('chat-tip')).toContainText(
      'Ship after the e-Transfer arrives, and add the tracking number when you mark it sold.',
    );
    await expect(chatS.getByTestId('pinned-bar')).toContainText('your card');
    const dealS = sellerPage.getByTestId('deal-panel');
    await expect(dealS).toContainText('Your copies');
    await expect(dealS).toContainText('×2');
    await expect(chatS.getByRole('log')).toContainText('Ship to:');

    await chatS.getByRole('button', { name: `Mark as sold: ${cardName}` }).click();
    const sold = sellerPage.getByRole('dialog', { name: 'Mark as sold?' });
    await expect(sold.getByTestId('mark-sold-sentence')).toContainText(
      `Sold to ${buyer.handle}. You keep 1 copy in your inventory. You can rate each other next.`,
    );
    await sold.getByTestId('tracking-input').fill(TRACKING);
    await sold.getByRole('button', { name: 'Mark as sold', exact: true }).click();
    await expect(sold).toBeHidden();
    await expect(sellerPage.getByText('Marked as sold')).toBeVisible();
    const noteS = chatS.getByTestId('sale-note');
    await expect(noteS).toContainText(`You marked ${cardName} as sold to ${buyer.handle}.`);
    await expect(noteS.getByTestId('sale-tracking')).toHaveText(TRACKING);
    await expect(chatS.getByTestId('sold-tag')).toBeVisible();
    await expect(dealS.getByTestId('deal-sold')).toContainText(TRACKING);

    // The buyer reads it live, worded for them, with the later quick replies.
    const noteB = chatB.getByTestId('sale-note');
    await expect(noteB).toContainText(`${seller.handle} marked ${cardName} as sold to you.`, {
      timeout: 15_000,
    });
    await expect(noteB.getByTestId('sale-tracking')).toHaveText(TRACKING);
    await expect(noteB.getByTestId('sale-undo')).toHaveCount(0);
    await expect(chatB.getByRole('button', { name: 'Send “Tracking number?”' })).toBeVisible();
    // The buyer may rate the seller at once, without a reload (spec 10.4; WC review U5).
    await expect(noteB.getByRole('button', { name: `Rate ${seller.handle}` })).toBeVisible({
      timeout: 15_000,
    });

    // --- Undo from the note: it leaves both chats --------------------------------------------
    await noteS.getByTestId('sale-undo').click();
    await expect(sellerPage.getByText('Sale undone. It is back in your inventory.')).toBeVisible();
    // The toast's Undo goes with it (WC review U4).
    await expect(sellerPage.getByText('Marked as sold', { exact: true })).toHaveCount(0);
    await expect(chatS.getByTestId('sale-note')).toHaveCount(0);
    await expect(chatS.getByRole('button', { name: `Mark as sold: ${cardName}` })).toBeVisible();
    await expect(chatB.getByTestId('sale-note')).toHaveCount(0, { timeout: 15_000 });

    // --- Sold again, then the seller rates the buyer from the note ------------------------------
    await chatS.getByRole('button', { name: `Mark as sold: ${cardName}` }).click();
    await sold.getByRole('button', { name: 'Mark as sold', exact: true }).click();
    await expect(chatS.getByTestId('sale-note')).toBeVisible();
    await chatS
      .getByTestId('sale-note')
      .getByRole('button', { name: `Rate ${buyer.handle}` })
      .click();
    const rate = sellerPage.getByRole('dialog', { name: `Rate ${buyer.handle}` });
    await expect(rate.getByTestId('rating-deal')).toContainText(`${cardName} · sold`);
    await rate
      .getByRole('radiogroup', { name: 'Overall' })
      .getByRole('radio', { name: '5 stars, Excellent' })
      .click();
    await rate.getByRole('button', { name: 'Publish rating' }).click();
    await expect(
      sellerPage.getByText(`Your rating of ${buyer.handle} is published.`),
    ).toBeVisible();

    // Report from the chat's menu, cancelled.
    await chatS.getByRole('button', { name: `More for ${buyer.handle}` }).click();
    await sellerPage.getByRole('menuitem', { name: `Report ${buyer.handle}` }).click();
    const report = sellerPage.getByRole('dialog', { name: `Report ${buyer.handle}` });
    await expect(report.getByTestId('report-choose-first')).toHaveText('Choose a reason first.');
    await expect(report.getByRole('button', { name: 'Send report' })).toBeDisabled();
    await report.getByRole('button', { name: 'Cancel' }).click();
    // The focus goes back to "⋯", whose menu row is gone (WC review A1).
    await expect(chatS.getByRole('button', { name: `More for ${buyer.handle}` })).toBeFocused();

    // Tracking numbers never reach the console (spec 10.5, 17).
    for (const lines of [sellerSide.console, buyerSide.console]) {
      expect(lines.filter((line) => line.includes(TRACKING))).toEqual([]);
    }
    for (const watcher of [watchSeller, watchBuyer]) {
      await watcher.settle();
      expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
    }
    await sellerPage.context().close();
    await buyerPage.context().close();
  });

  test('below 960 Message opens the chat on its own route, and the deal panel is a sheet', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const { seller, buyer, cardId, cardName } = await createDeal(request);
    const { page } = await openSignedIn(browser, buyer, { width: 390, height: 844 });
    await page.goto(`/search?card=${cardId}`);
    await page.getByRole('button', { name: `Message ${seller.handle} about ${cardName}` }).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('chat-drawer')).toHaveCount(0);
    const chat = page.getByRole('region', { name: `Chat with ${seller.handle}` });
    await expect(chat.getByTestId('pinned-bar')).toContainText(cardName);
    // A chat opens above the tabs, as on the phone: no per-tab bar, no tab bar (WC review U2).
    await expect(page.getByTestId('top-bar')).toHaveCount(0);
    await expect(page.getByTestId('tab-messages')).toHaveCount(0);
    await chat.getByTestId('deal-toggle').click();
    const sheet = page.getByRole('dialog', { name: 'Deal' });
    await expect(sheet).toContainText('How deals work here');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(chat.getByTestId('deal-toggle')).toBeFocused();
    // Its Close takes a pointer too: nothing covers the sheet (WC review U2, A4).
    await chat.getByTestId('deal-toggle').click();
    await sheet.getByRole('button', { name: 'Close the deal panel' }).click();
    await expect(sheet).toBeHidden();
    // Back: the inbox between the bars again, the focus on that chat's row (WC review A1).
    await chat.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByTestId('tab-messages')).toBeVisible();
    await expect(page.locator(`[data-conversation="${seller.handle}"]`)).toBeFocused();
    await page.context().close();
  });

  test('signing out closes the chat drawer and forgets its draft; the next account starts empty (WC review F1, P1)', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const { seller, buyer, cardId, cardName } = await createDeal(request);
    const { page } = await openSignedIn(browser, buyer);
    await page.goto(`/search?card=${cardId}`);
    await page.getByRole('button', { name: `Message ${seller.handle} about ${cardName}` }).click();
    const drawer = page.getByTestId('chat-drawer');
    await drawer.getByRole('button', { name: 'Send “Is it still available?”' }).click();
    await expect(drawer.getByRole('log')).toContainText('Is it still available?');
    const draft = `UNSENT-DRAFT ${suffix()}`;
    await drawer.getByRole('textbox', { name: 'Message' }).fill(draft);
    await page.evaluate(
      () => ((window as unknown as { e2eNoReload?: boolean }).e2eNoReload = true),
    );

    // Signing out: the chat and its draft leave with the account; the sign-in form is reachable.
    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByTestId('top-bar-sign-in')).toBeVisible();
    await expect(page.getByTestId('chat-drawer')).toHaveCount(0);
    await expect(page.getByText('Is it still available?')).toHaveCount(0);

    // The other collector of that chat signs in on the same tab, without a reload.
    await page.getByTestId('top-bar-sign-in').click();
    await page.getByLabel('Email').fill(seller.email);
    await page.getByLabel('Password', { exact: true }).fill(seller.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 20_000 });
    await page.getByTestId('rail-messages').click();
    await page.locator(`[data-conversation="${buyer.handle}"]`).click();
    const chat = page.getByRole('region', { name: `Chat with ${buyer.handle}` });
    await expect(chat.getByRole('log')).toContainText('Is it still available?');
    await expect(chat.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(
      await page.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
    ).toBe(true);
    await page.context().close();
  });
});
