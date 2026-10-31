import { expect, test } from './support/fixtures';
import {
  apiMyBlocks,
  apiSendText,
  apiStartConversation,
  createOnboardedCollector,
  openInApp,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** The tip of a chat without a pinned card (spec 2026-10-14, section 10; stage R1). */
const TIP_NONE =
  'Agree on the price and shipping here. Check ratings before you send an e-Transfer.';

/**
 * Trading safety on mobile: the small safety tip at the start of a chat (stage R1 of the phone
 * redesign, ADR 0018: deals ship by mail, payment stays outside the app; it replaced the meetup
 * notice): the shipping wording, the "Trading safely" page from it, the composer never blocked,
 * Report and Block from the conversation menu, and the tip still there after a reload (it is not
 * dismissed); Block / Unblock on the collector profile next to Report.
 */
test.describe('mobile trading safety', () => {
  requireStack();

  test('the tip at the start of a chat: shipping wording, the guide, Report and Block, after a reload', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const ada = await createOnboardedCollector(request, 'safa', `Ada Careful ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'safb', `Ben Stranger ${suffix()}`);
    const conversationId = await apiStartConversation(request, ben, ada.id);
    expect(await apiSendText(request, ben, conversationId, 'Hi Ada, still selling?')).toBe(201);

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByText('Hi Ada, still selling?')).toBeVisible({ timeout: 30_000 });
    const tip = thread.getByTestId('chat-safety-tip');
    await expect(tip).toBeVisible();
    await expect(thread.getByTestId('chat-safety-tip-text')).toHaveText(TIP_NONE);
    // The meetup notice is gone with its wording.
    await expect(thread.getByTestId('safety-notice')).toHaveCount(0);
    await expect(thread.getByText(/public place|daylight|Meetup details/)).toHaveCount(0);

    // The composer is never blocked by the tip.
    const reply = `How much with shipping? ${suffix()}`;
    await thread.getByLabel('Message', { exact: true }).fill(reply);
    await thread.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(thread.getByText(reply)).toBeVisible({ timeout: 30_000 });
    await expect(tip).toBeVisible();

    // The guide, in-app.
    await tip.click();
    const guide = screen(page, 'legal-document');
    await expect(guide.getByTestId('legal-document-title')).toHaveText('Trading safely', {
      timeout: 30_000,
    });
    await expect(guide.getByTestId('legal-draft-banner')).toBeVisible();
    await page.goBack();
    await expect(tip).toBeVisible({ timeout: 30_000 });

    // Report and Block live in the conversation menu.
    await page.getByTestId('conversation-menu').click();
    await page.getByTestId('conversation-report').click();
    const report = screen(page, 'report');
    await expect(report.getByTestId('report-target')).toHaveText(ben.displayName, {
      timeout: 30_000,
    });
    await page.goBack();
    await expect(tip).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('conversation-menu').click();
    await page.getByTestId('conversation-block').click();
    const dialog = page.getByTestId('block-dialog');
    await expect(dialog).toContainText(`Block ${ben.handle}?`);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await apiMyBlocks(request, ada)).toEqual([]);

    // Not dismissed: still at the start of the chat after a reload. (Reload on Search, `/search`:
    // the static export serves no page for `/messages` or a thread.)
    await page.goBack();
    await expect(screen(page, 'messages')).toBeVisible({ timeout: 30_000 });
    await openTab(page, 'Search');
    await expect(page).toHaveURL(/\/search$/);
    await page.reload();
    await openTab(page, 'Messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    await expect(screen(page, 'conversation').getByText(reply)).toBeVisible({ timeout: 30_000 });
    await expect(screen(page, 'conversation').getByTestId('chat-safety-tip-text')).toHaveText(
      TIP_NONE
    );
  });

  test('Block and Unblock on the collector profile, in its "⋯" sheet with Report', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const ada = await createOnboardedCollector(request, 'blka', `Ada Blocker ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'blkb', `Ben Blockee ${suffix()}`);
    await signInThroughUi(page, ada.email, ada.password);
    await openInApp(page, `/collectors/${ben.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(ben.displayName, {
      timeout: 30_000,
    });

    // The "⋯" sheet (stage R6): Share profile, Report and Block.
    await page.getByRole('button', { name: `More for ${ben.handle}` }).click();
    await expect(page.getByTestId('collector-report')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('collector-share')).toBeVisible();
    await page.getByTestId('collector-block').click();
    const dialog = page.getByTestId('block-dialog');
    await expect(dialog).toContainText(`Block ${ben.handle}?`, { timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Block' }).click();
    await expect(snackbar(page)).toHaveText(`${ben.handle} is blocked.`, { timeout: 30_000 });
    expect((await apiMyBlocks(request, ada)).map((user) => user.handle)).toEqual([ben.handle]);
    // The profile reloads as blocked: the header and Unblock, no Message.
    await expect(profile.getByTestId('collector-blocked')).toContainText(
      `You blocked ${ben.handle}.`,
      { timeout: 30_000 }
    );
    await expect(profile.getByTestId('collector-message')).toHaveCount(0);

    await profile.getByRole('button', { name: `Unblock ${ben.handle}` }).click();
    await expect(snackbar(page)).toHaveText(`${ben.handle} is unblocked.`, {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-message')).toBeVisible({ timeout: 30_000 });
    expect(await apiMyBlocks(request, ada)).toEqual([]);
  });
});
