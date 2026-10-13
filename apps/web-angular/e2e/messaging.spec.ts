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
  requireStack,
  signInThroughUi,
  stubCardImages,
  forbidMapProviders,
} from './support/stack';

/**
 * Private messaging (Phase 5) against the real local stack, with two browser contexts: collector A
 * finds collector B's binder on the region map (B's state), opens B's profile and messages B
 * (text + a shared card); B,
 * signed in elsewhere, sees the conversation arrive over STOMP without reloading, with its unread
 * badge; B opening it sends a read receipt that A sees as "Seen"; the typing indicator and B's
 * answer reach A live; A blocks B, after which B cannot send anything, and A unblocks B from
 * Settings → Blocked users. A second test starts a conversation from a collector profile on the
 * full-page `/messages` and sends a photo (type validation first).
 *
 * B lives in Wyoming and A in Quebec (both Americas (North)); B's binder has a unique name, so what
 * other specs or earlier runs left in the region does not matter. No JSON response carries a
 * coordinate (ADR 0017).
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A 48×48 PNG (fictional test picture). */
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAT0lEQVR42u3WsQ0AIAgEQMZxJmdyZ11ASmPxl1CScNXztee4z2rm8X4BAQHlgT4d7vaBgIACQZIaCAhIH/I6gID0IUkNBASkD3kdQEDJoAMWbGrTipIFrAAAAABJRU5ErkJggg==',
  'base64',
);

/** Two collectors of the same region; B is discoverable with a public binder in Wyoming. */
async function createPair(
  api: APIRequestContext,
): Promise<{ a: OnboardedCollector; b: OnboardedCollector; binderName: string }> {
  const b = await createOnboardedCollector(api, 'msgb', {
    location: { countryCode: 'US', subdivisionCode: 'US-WY' },
    displayName: `Bea Receiver ${suffix()}`,
  });
  await apiUpdatePrivacy(api, b.idToken, { discoverable: true });
  const binderName = `E2E messaging binder ${suffix()}`;
  const binder = await apiCreateBinder(api, b.idToken, {
    name: binderName,
    kind: 'TRADE',
    description: 'Fictional binder for the messaging E2E suite.',
  });
  await apiCreateItem(api, b.idToken, {
    printingId: await printingIdOf(api, b.idToken, 'AZR-EN001'),
    binderId: binder.id,
    condition: 'NEAR_MINT',
    availability: 'TRADE',
  });
  await apiPublishBinder(api, b.idToken, binder.id, 'UNTIL_DISABLED');
  const a = await createOnboardedCollector(api, 'msga', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-QC' },
    displayName: `Ari Sender ${suffix()}`,
  });
  return { a, b, binderName };
}

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubCardImages(page);
  await forbidMapProviders(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

/** Waits until the page's STOMP connection is established. */
async function expectLive(page: Page): Promise<void> {
  await expect(page.getByTestId('realtime-status').first()).toHaveAttribute(
    'data-state',
    'connected',
    { timeout: 20_000 },
  );
}

test.describe('private messaging', () => {
  requireStack();

  test('A finds B through the map and messages B; B gets it live, A sees the receipt, blocking stops messages', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { a, b, binderName } = await createPair(request);

    // B waits on the Messages page (a second browser context).
    const pageB = await openSignedIn(browser, b);
    const watchB = watchCoordinates(pageB);
    await pageB.goto('/messages');
    await expect(pageB.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
    await expect(pageB.getByRole('heading', { name: 'No conversations yet' })).toBeVisible();
    await expectLive(pageB);
    // Marker to prove B's page is never reloaded.
    await pageB.evaluate(
      () => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true),
    );

    // A finds B's binder in Wyoming on the region map, opens B's profile and presses Message.
    const pageA = await openSignedIn(browser, a);
    const watchA = watchCoordinates(pageA);
    await pageA.goto('/map?region=americas-north&subdivision=US-WY');
    const statePanel = pageA.getByTestId('subdivision-panel');
    await expect(statePanel.getByRole('heading', { name: 'Wyoming, United States' })).toBeVisible();
    const binderCard = statePanel.getByRole('listitem').filter({ hasText: binderName });
    await expect(binderCard).toBeVisible({ timeout: 20_000 });
    await binderCard.getByRole('link', { name: new RegExp(escape(b.displayName)) }).click();
    await expect(pageA).toHaveURL(new RegExp(`/collectors/${b.handle}$`));
    await pageA.getByRole('button', { name: `Message ${b.displayName}` }).click();

    // The conversation opens full page.
    await expect(pageA).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const threadA = pageA.getByRole('region', { name: `Conversation with ${b.displayName}` });
    await expect(threadA).toBeVisible();
    await expect(
      threadA.getByRole('heading', { name: `Say hello to ${b.displayName}` }),
    ).toBeVisible();
    await expectLive(pageA);

    const hello = `Hi! Is your binder still up to date? ${suffix()}`;
    const composerA = threadA.getByRole('textbox', { name: 'Message' });
    await composerA.fill(hello);
    await composerA.press('Enter');
    const logA = threadA.getByRole('log', { name: `Messages with ${b.displayName}` });
    await expect(logA).toContainText(hello);
    await expect(composerA).toHaveValue('');

    // Share a card through the autocomplete, with a caption.
    await threadA.getByRole('button', { name: 'Attach a card, binder, offer or photo' }).click();
    await pageA.getByRole('menuitem', { name: 'Share a card' }).click();
    const cardField = threadA.getByRole('combobox', { name: 'Card to share' });
    await expect(cardField).toBeFocused();
    await cardField.fill('AZR-EN001');
    await pageA
      .getByRole('option', { name: /Azure-Eyes Sky Dragon/ })
      .first()
      .click();
    await expect(threadA.getByTestId('composer-attachment')).toContainText('Azure-Eyes Sky Dragon');
    await composerA.fill('This one for trade?');
    await threadA.getByRole('button', { name: 'Send message' }).click();
    await expect(logA.getByRole('link', { name: /^Card: Azure-Eyes Sky Dragon/ })).toBeVisible();
    await expect(logA).toContainText('This one for trade?');
    await expect(logA.getByTestId('receipt-sent')).toBeVisible();

    // B: the conversation arrives without a reload, with two unread messages.
    const rowB = pageB.locator(`[data-conversation="${a.handle}"]`);
    await expect(rowB).toBeVisible({ timeout: 20_000 });
    await expect(rowB.getByTestId('unread-badge')).toHaveText('2');
    await expect(rowB).toContainText('Card: Azure-Eyes Sky Dragon');
    expect(
      await pageB.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
    ).toBe(true);

    // B opens it: both messages, the shared card links to the catalog; A sees "Seen".
    await rowB.click();
    await expect(pageB).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const threadB = pageB.getByRole('region', { name: `Conversation with ${a.displayName}` });
    const logB = threadB.getByRole('log', { name: `Messages with ${a.displayName}` });
    await expect(logB).toContainText(hello);
    await expect(
      logB.getByRole('link', { name: /^Card: Azure-Eyes Sky Dragon, AZR-EN001/ }),
    ).toHaveAttribute('href', /\/cards\/[0-9a-f-]{36}\?printing=[0-9a-f-]{36}$/);
    await expect(rowB.getByTestId('unread-badge')).toHaveCount(0);
    await expect(logA.getByTestId('receipt-seen')).toBeVisible({ timeout: 20_000 });

    // B types: A sees the typing indicator, then B's answer live.
    const composerB = threadB.getByRole('textbox', { name: 'Message' });
    await composerB.pressSequentially('Yes, it is', { delay: 40 });
    await expect(threadA.getByTestId('typing-indicator')).toBeVisible({ timeout: 15_000 });
    const answer = ` for trade. Meet at the library? ${suffix()}`;
    await composerB.pressSequentially(answer);
    await composerB.press('Enter');
    await expect(logA).toContainText(`Yes, it is${answer}`, { timeout: 15_000 });
    await expect(threadA.getByTestId('typing-indicator')).toBeHidden();
    // The push can reach A before B's own send settles; the composer resets only then.
    await expect(composerB).toHaveValue('');

    // B sends a photo: it reaches A live and loads from the API.
    await threadB
      .locator('input[type="file"]')
      .setInputFiles({ name: 'library.png', mimeType: 'image/png', buffer: TEST_PNG });
    await threadB.getByRole('button', { name: 'Send message' }).click();
    const livePhoto = logA.getByRole('img', { name: 'Photo sent in the conversation' });
    await expect(livePhoto).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => livePhoto.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    // A blocks B from the conversation menu (which also offers "Report collector" since Phase 7).
    await threadA
      .getByRole('button', { name: `Conversation options for ${b.displayName}` })
      .click();
    await expect(pageA.getByRole('menuitem', { name: 'Report collector' })).toBeEnabled();
    await pageA.getByRole('menuitem', { name: `Block ${b.displayName}` }).click();
    const confirm = pageA.getByRole('dialog', { name: `Block ${b.displayName}?` });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Block' }).click();
    await expect(pageA.getByText(`${b.displayName} is blocked.`)).toBeVisible();
    await expect(threadA.getByRole('status').filter({ hasText: 'You blocked' })).toBeVisible();
    await expect(threadA.getByRole('button', { name: 'Send message' })).toBeDisabled();

    // B can no longer send anything, nor start a new conversation.
    await composerB.fill('Hello?');
    await composerB.press('Enter');
    await expect(threadB.getByTestId('send-error')).toContainText(
      'You cannot message this collector',
    );
    await expect(threadB.getByText(`You can no longer message ${a.displayName}`)).toBeVisible();
    await expect(logA).not.toContainText('Hello?');
    const refused = await request.post(`${API_URL}/api/v1/conversations`, {
      headers: authHeader(b.idToken),
      data: { recipientId: a.id },
    });
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { errorCode: string }).errorCode).toBe('MESSAGING_BLOCKED');

    // A unblocks B from Settings → Blocked users.
    await pageA.goto('/settings/blocked');
    const blockedList = pageA.getByRole('list', { name: 'Blocked users' });
    await expect(blockedList).toContainText(b.displayName);
    await blockedList.getByRole('button', { name: `Unblock ${b.displayName}` }).click();
    await expect(pageA.getByText(`${b.displayName} is unblocked.`)).toBeVisible();
    await expect(pageA.getByRole('heading', { name: 'You have not blocked anyone' })).toBeVisible();

    for (const watcher of [watchA, watchB]) {
      await watcher.settle();
      expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
    }
    await pageA.context().close();
    await pageB.context().close();
  });

  test('a conversation started from a profile opens full page and sends a photo', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const { a, b } = await createPair(request);
    await stubCardImages(page);
    await signInThroughUi(page, a.email, a.password);
    const watcher = watchCoordinates(page);

    await page.goto(`/collectors/${b.handle}`);
    await expect(page.getByRole('heading', { level: 1, name: b.displayName })).toBeVisible();
    await page.getByRole('button', { name: `Message ${b.displayName}` }).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const thread = page.getByRole('region', { name: `Conversation with ${b.displayName}` });
    await expect(thread).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Conversations' })
        .locator(`[data-conversation="${b.handle}"]`),
    ).toHaveAttribute('aria-current', 'true');

    // Only photos are accepted, checked before anything is uploaded.
    const fileInput = thread.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a picture'),
    });
    await expect(thread.getByRole('alert')).toContainText('Use a JPEG, PNG or WebP photo.');
    await fileInput.setInputFiles({
      name: 'binder-page.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    });
    const attachment = thread.getByTestId('composer-attachment');
    await expect(attachment).toContainText('binder-page.png');
    await expect(attachment.getByRole('img', { name: 'Photo to send' })).toBeVisible();
    await thread.getByRole('textbox', { name: 'Message' }).fill('The page I mentioned');
    await thread.getByRole('button', { name: 'Send message' }).click();

    const log = thread.getByRole('log', { name: `Messages with ${b.displayName}` });
    const photo = log.getByRole('img', { name: 'Photo sent in the conversation' });
    await expect(photo).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(log).toContainText('The page I mentioned');
    await expect(attachment).toHaveCount(0);

    // Text the moderation rules refuse is not sent, with a generic reason (422 MESSAGE_BLOCKED).
    const composer = thread.getByRole('textbox', { name: 'Message' });
    await composer.fill('zorblax special offer');
    await composer.press('Enter');
    await expect(thread.getByTestId('send-error')).toContainText(
      'This message breaks the community guidelines',
    );
    await expect(log).not.toContainText('zorblax');
    await expect(composer).toHaveValue('zorblax special offer');

    // Back to the list (keyboard): the conversation shows the photo preview.
    await page.goto('/messages');
    const row = page.locator(`[data-conversation="${b.handle}"]`);
    await expect(row).toContainText('You: Photo: The page I mentioned');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });
});
