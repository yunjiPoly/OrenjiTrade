import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiConversation,
  apiDeckCore,
  apiListItem,
  apiMessages,
  apiNotifications,
  apiPublicBinder,
  apiSaleMessages,
  apiSendText,
  apiStartConversationAbout,
  authHeader,
  cardOfPrinting,
  createOnboardedCollector,
  openInApp,
  openTab,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/**
 * Deals happen in the chat and ship by mail (stage R4 of the phone redesign, mockup screens 22 to
 * 25; ADR 0018). Two fresh fictional collectors on the isolated stack: one uses the app, the other
 * is driven through the API. The chat's pinned card and its side (buying or selling), the safety
 * tip of that side, the quick replies, the "+" sheet with the saved e-Transfer email or address
 * (kept on the phone, sent only inside a message), Mark as sold with a tracking number, its Undo,
 * the sale message worded per side and the buyer's notification.
 */
test.describe('mobile deals in the chat', () => {
  requireStack();

  test('as the seller: e-Transfer email from the + sheet, Mark as sold, Undo, sold again, Rate', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const ada = await createOnboardedCollector(request, 'dsell', `Ada Seller ${suffix()}`, {
      location: PLACES.quebec,
      discoverable: true,
    });
    const ben = await createOnboardedCollector(request, 'dbuy', `Ben Buyer ${suffix()}`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    const { printingId, cardName } = await cardOfPrinting(request, ada.idToken, 'PFT-002');
    const binderId = await apiPublicBinder(request, ada, 'Deals binder');
    const card = await apiListItem(request, ada, binderId, printingId, {
      quantity: 2,
      askingPriceText: '$32',
    });
    const conversationId = await apiStartConversationAbout(request, ben, ada.id, {
      subjectItemId: card.id,
    });
    expect(await apiSendText(request, ben, conversationId, 'Is it still available?')).toBe(201);

    // Nothing Ada saves on the phone may reach a request except the message she sends.
    const requests: string[] = [];
    page.on('request', (sent) => requests.push(`${sent.url()} ${sent.postData() ?? ''}`));

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    const inbox = screen(page, 'messages');
    await expect(inbox.getByTestId(`conversation-subject-${ben.handle}`)).toBeVisible({
      timeout: 30_000,
    });
    await inbox.getByTestId(`conversation-row-${ben.handle}`).click();
    const chat = screen(page, 'conversation');
    // The status line names the province, never a city.
    await expect(chat.getByTestId('conversation-status')).toHaveText('Ontario', {
      timeout: 30_000,
    });
    const bar = chat.getByTestId('pinned-bar');
    await expect(bar.getByTestId('pinned-name')).toHaveText(cardName);
    await expect(bar.getByTestId('pinned-line')).toContainText('$32 · your card');
    await expect(chat.getByTestId('chat-safety-tip-text')).toHaveText(
      'Ship after the e-Transfer arrives, and add the tracking number when you mark it sold.'
    );

    // A quick reply sends at once; then the replies after the seller's answer.
    await chat.getByRole('button', { name: 'Send “Yes, still available”' }).click();
    await expect(chat.getByText('Yes, still available', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(chat.getByRole('button', { name: 'Send “Got your e-Transfer”' })).toBeVisible();
    await expect(chat.getByRole('button', { name: 'Send “Yes, still available”' })).toHaveCount(0);

    // "+": the e-Transfer email, asked the first time, into the message box, sent only by Ada.
    await chat.getByRole('button', { name: 'Share in this chat' }).click();
    await expect(page.getByTestId('composer-send-address')).toHaveCount(0);
    await page.getByTestId('composer-send-etransfer').click();
    const ask = page.getByTestId('saved-detail-sheet');
    await expect(ask).toContainText('Saved on this phone only');
    const email = `ada.${suffix()}@example.com`;
    await ask.getByLabel('Email or phone number').fill(email);
    await ask.getByRole('button', { name: 'Save and use' }).click();
    const box = chat.getByLabel('Message', { exact: true });
    await expect(box).toHaveValue(`e-Transfer to ${email}`, { timeout: 30_000 });
    expect(requests.filter((line) => line.includes(email))).toEqual([]);
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(async () => (await apiMessages(request, ben, conversationId)).map((m) => m.body))
      .toContain(`e-Transfer to ${email}`);

    // Mark as sold: one copy of two, with a tracking number.
    await bar.getByRole('button', { name: `Mark ${cardName} as sold` }).click();
    const sheet = page.getByTestId('mark-sold-sheet');
    await expect(sheet.getByTestId('mark-sold-line')).toContainText('2 copies');
    await expect(sheet.getByTestId('mark-sold-sentence')).toHaveText(
      `Sold to ${ben.handle}. You'll have 1 left. You can rate each other next.`
    );
    await sheet.getByLabel('Tracking number, optional').fill('LX123456789CA');
    await sheet.getByRole('button', { name: 'Mark as sold' }).click();
    await expect(snackbar(page)).toContainText('Marked as sold', { timeout: 30_000 });
    await expect(chat.getByTestId('pinned-sold')).toBeVisible({ timeout: 30_000 });
    await expect(chat.getByTestId('sale-message-text')).toHaveText(
      `You marked ${cardName} as sold to ${ben.handle}.`,
      { timeout: 30_000 }
    );
    await expect(chat.getByTestId('sale-message-tracking')).toContainText('LX123456789CA');
    await expect
      .poll(async () => (await apiSaleMessages(request, ben, conversationId)).length)
      .toBe(1);
    expect((await apiConversation(request, ben, conversationId)).subject?.sold).toBe(true);
    const notices = await apiNotifications(request, ben);
    expect(notices.find((notice) => notice.type === 'SALE_RECORDED')?.title).toBe(
      `${ada.handle} marked ${cardName} as sold to you`
    );

    // Undo, from the toast: the copy comes back, the message and the notice go.
    await snackbar(page).getByRole('button', { name: 'Undo' }).click();
    await expect(snackbar(page)).toContainText('Sale undone', { timeout: 30_000 });
    await expect(chat.getByTestId('pinned-mark-sold')).toBeVisible({ timeout: 30_000 });
    await expect(chat.getByTestId('sale-message-text')).toHaveCount(0);
    await expect
      .poll(async () => (await apiSaleMessages(request, ben, conversationId)).length)
      .toBe(0);
    const item = await request.get(`${API_URL}/api/v1/inventory/items/${card.id}`, {
      headers: authHeader(ada.idToken),
    });
    expect(((await item.json()) as { quantity: number }).quantity).toBe(2);

    // Sold again, then "Rate {other}" opens the rating of the sale.
    await bar.getByRole('button', { name: `Mark ${cardName} as sold` }).click();
    await page.getByTestId('mark-sold-sheet').getByRole('button', { name: 'Mark as sold' }).click();
    await expect(chat.getByTestId('sale-message-text')).toBeVisible({ timeout: 30_000 });
    await chat.getByRole('button', { name: `Rate ${ben.handle}` }).click();
    const rate = screen(page, 'rate');
    await expect(rate.getByTestId('rating-form')).toBeVisible({ timeout: 30_000 });
    // Stage R14 (mockup v50 screen 61): the deal under the buyer, as the seller reads it.
    await expect(rate.getByTestId('rate-person-line')).toContainText(
      `${cardName} · bought from you`
    );
  });

  test('as the buyer: a deck core pinned from its page, the address from the + sheet, sold to me', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const ada = await createOnboardedCollector(request, 'dbuy2', `Ada Buyer ${suffix()}`, {
      location: PLACES.quebec,
      discoverable: true,
    });
    const ben = await createOnboardedCollector(request, 'dsell2', `Ben Seller ${suffix()}`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    const { printingId } = await cardOfPrinting(request, ben.idToken, 'PFT-002');
    const coreId = await apiDeckCore(request, ben, 'Moth core', '$95', printingId);

    await signInThroughUi(page, ada.email, ada.password);
    await openInApp(page, `/binders/${coreId}`);
    const core = page.getByTestId('deck-core-page').filter({ visible: true });
    await expect(core.getByTestId('deck-core-name')).toHaveText('Moth core', { timeout: 30_000 });
    await core.getByTestId('deck-core-message').click();

    const chat = screen(page, 'conversation');
    const bar = chat.getByTestId('pinned-bar');
    await expect(bar.getByTestId('pinned-name')).toHaveText('Moth core', { timeout: 30_000 });
    await expect(bar.getByTestId('pinned-line')).toHaveText('Deck core');
    await expect(bar.getByTestId('pinned-price')).toHaveText('$95');
    await expect(chat.getByTestId('chat-safety-tip-text')).toHaveText(
      'Check their rating before you send an e-Transfer, and ask for tracking.'
    );
    await expect(chat.getByRole('button', { name: 'Send “Is it still available?”' })).toBeVisible();

    // "+": the address, asked the first time (several lines), checked in the message box.
    await chat.getByRole('button', { name: 'Share in this chat' }).click();
    await expect(page.getByTestId('composer-send-etransfer')).toHaveCount(0);
    await page.getByTestId('composer-send-address').click();
    const ask = page.getByTestId('saved-detail-sheet');
    await ask.getByLabel('Address').fill('Ada Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0');
    await ask.getByRole('button', { name: 'Save and use' }).click();
    const box = chat.getByLabel('Message', { exact: true });
    await expect(box).toHaveValue('Ship to:\nAda Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0', {
      timeout: 30_000,
    });
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    const conversationId = (await page.url()).split('/messages/')[1]?.split(/[?#]/)[0] ?? '';
    await expect
      .poll(async () => (await apiMessages(request, ben, conversationId)).map((m) => m.body))
      .toContain('Ship to:\nAda Tremblay\n123 Rue Exemple\nMontréal QC H0H 0H0');

    // Ben marks it sold: the sale arrives live, worded for Ada, and the bar says Sold.
    const sold = await request.post(`${API_URL}/api/v1/conversations/${conversationId}/sales`, {
      headers: authHeader(ben.idToken),
      data: { trackingNumber: '1Z999AA10123456784' },
    });
    expect(sold.status(), 'POST sales').toBe(201);
    await expect(chat.getByTestId('sale-message-text')).toHaveText(
      `${ben.handle} marked Moth core as sold to you.`,
      { timeout: 30_000 }
    );
    await expect(chat.getByTestId('sale-message-tracking')).toContainText('1Z999AA10123456784');
    await expect(chat.getByTestId('pinned-sold')).toBeVisible({ timeout: 30_000 });
    // The deck core left Search.
    const page404 = await request.get(`${API_URL}/api/v1/public/binders/${coreId}`, {
      headers: authHeader(ada.idToken),
    });
    expect(page404.status()).toBe(404);
  });
});
