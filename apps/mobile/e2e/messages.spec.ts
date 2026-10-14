import { expect, test } from './support/fixtures';
import {
  apiMarkRead,
  apiMessages,
  apiSendText,
  apiStartConversation,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Mobile Phase 5 (messages) against the real, isolated stack with two fresh fictional collectors:
 * Ben (the second user, driven through the API) writes to Ada, who uses the app. Ada's inbox and
 * thread stay live over the realtime channel (STOMP over a WebSocket to the API's /ws): new
 * messages, unread counts, "Seen" receipts; she answers with text and a photo picked from the
 * library (uploaded through POST /uploads/images), mutes and blocks Ben.
 */

/** A 2 x 2 PNG standing in for a photo of a card (fictional, generated in memory). */
const PHOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64'
);

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile messages', () => {
  requireStack();

  test('inbox → conversation: messages arrive live, replies, "Seen", a photo', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const ada = await createOnboardedCollector(request, 'msga', `Ada Inbox ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'msgb', `Ben Sender ${suffix()}`);
    const conversationId = await apiStartConversation(request, ben, ada.id);
    expect(await apiSendText(request, ben, conversationId, 'Hi Ada, still trading?')).toBe(201);

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    const messages = screen(page, 'messages');
    await expect(messages.getByTestId('realtime-status')).toContainText('Live', {
      timeout: 30_000,
    });
    const row = messages.getByTestId(`conversation-row-${ben.handle}`);
    await expect(row).toContainText(ben.displayName, { timeout: 30_000 });
    await expect(messages.getByTestId(`conversation-preview-${ben.handle}`)).toHaveText(
      'Hi Ada, still trading?'
    );
    await expect(messages.getByTestId(`unread-badge-${ben.handle}`)).toHaveText('1');
    await expect(page.getByRole('tab', { name: /Messages tab, 1 unread/ })).toBeVisible();

    // Ben writes again: the inbox follows without a reload.
    expect(await apiSendText(request, ben, conversationId, 'I have the Emberfang Fox.')).toBe(201);
    await expect(messages.getByTestId(`conversation-preview-${ben.handle}`)).toHaveText(
      'I have the Emberfang Fox.',
      { timeout: 30_000 }
    );
    await expect(messages.getByTestId(`unread-badge-${ben.handle}`)).toHaveText('2');

    // The thread: both messages, read by Ada (Ben sees his messages as read).
    await row.click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByTestId('conversation-profile')).toContainText(ben.displayName, {
      timeout: 30_000,
    });
    await expect(thread.getByText('Hi Ada, still trading?')).toBeVisible();
    await expect(thread.getByText('I have the Emberfang Fox.')).toBeVisible();
    await expect
      .poll(async () =>
        (await apiMessages(request, ben, conversationId)).every((m) => m.readByOther)
      )
      .toBe(true);

    // Ada answers.
    const reply = `Great, Saturday at the café? ${suffix()}`;
    await thread.getByLabel('Message', { exact: true }).fill(reply);
    await thread.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByText(reply)).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByTestId('receipt-sent')).toHaveText('Sent');
    await expect
      .poll(async () => (await apiMessages(request, ben, conversationId)).map((m) => m.body))
      .toContain(reply);

    // Ben reads it: "Seen" arrives live. Then his answer appears in the open thread.
    const adaMessage = (await apiMessages(request, ben, conversationId)).find(
      (message) => message.body === reply
    );
    await apiMarkRead(request, ben, conversationId, adaMessage!.id);
    await expect(thread.getByTestId('receipt-seen')).toHaveText('Seen', { timeout: 30_000 });
    expect(await apiSendText(request, ben, conversationId, 'Deal, see you there!')).toBe(201);
    await expect(thread.getByText('Deal, see you there!')).toBeVisible({ timeout: 30_000 });

    // A photo from the library: uploaded first, then sent as an IMAGE message.
    await thread.getByRole('button', { name: 'Attach a card, binder or photo' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('composer-attach-photo').click();
    await (await chooser).setFiles({ name: 'card.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(thread.getByTestId('composer-attachment')).toContainText('card.png');
    await thread.getByLabel('Message', { exact: true }).fill('The card');
    await thread.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByTestId('message-photo')).toBeVisible({ timeout: 30_000 });
    const photo = (await apiMessages(request, ben, conversationId)).find(
      (message) => message.kind === 'IMAGE'
    );
    expect(photo?.body).toBe('The card');
    expect(photo?.payload?.image?.url).toContain('/api/v1/public/media/');
  });

  test('a card link, mute, then a block that stops messages both ways', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const ada = await createOnboardedCollector(request, 'msgc', `Ada Blocker ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'msgd', `Ben Blocked ${suffix()}`);
    const conversationId = await apiStartConversation(request, ben, ada.id);
    expect(await apiSendText(request, ben, conversationId, 'Hello!')).toBe(201);

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByText('Hello!')).toBeVisible({ timeout: 30_000 });

    // Share a card of the catalog: it arrives as a link card.
    await thread.getByRole('button', { name: 'Attach a card, binder or photo' }).click();
    await page.getByTestId('composer-share-card').click();
    await thread.getByLabel('Card name or printing code').fill('Emberfang');
    await thread
      .getByRole('button', { name: /^Emberfang Fox VMAX/ })
      .first()
      .click();
    await expect(thread.getByTestId('composer-attachment')).toContainText('Emberfang Fox VMAX');
    await thread.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByTestId('shared-card-link')).toContainText('Emberfang Fox VMAX', {
      timeout: 30_000,
    });
    await expect
      .poll(async () =>
        (await apiMessages(request, ben, conversationId)).map((m) => m.payload?.card?.name)
      )
      .toContain('Emberfang Fox VMAX');

    // Mute.
    await page.getByTestId('conversation-menu').click(); // in the navigation header
    await page.getByTestId('conversation-mute').click();
    await expect(snackbar(page)).toHaveText('Conversation muted.');
    await expect(thread.getByTestId('conversation-status')).toContainText('Muted');

    // Block, after a confirmation: the composer closes, Ben cannot write any more.
    await page.getByTestId('conversation-menu').click(); // in the navigation header
    await page.getByTestId('conversation-block').click();
    const dialog = page.getByTestId('block-dialog');
    await expect(dialog).toContainText(`Block ${ben.displayName}?`);
    await dialog.getByRole('button', { name: 'Block' }).click();
    await expect(thread.getByTestId('conversation-blocked-banner')).toContainText(
      `You blocked ${ben.displayName}`
    );
    await expect(thread.getByLabel('Message', { exact: true })).not.toBeEditable();
    expect(await apiSendText(request, ben, conversationId, 'Are you there?')).toBe(403);

    // Unblock from the banner.
    await thread.getByTestId('conversation-banner-unblock').click();
    await expect(thread.getByTestId('conversation-blocked-banner')).toBeHidden();
    await expect(snackbar(page)).toHaveText(`${ben.displayName} is unblocked.`);
    expect(await apiSendText(request, ben, conversationId, 'Back again')).toBe(201);
    await expect(thread.getByText('Back again')).toBeVisible({ timeout: 30_000 });
  });
});
