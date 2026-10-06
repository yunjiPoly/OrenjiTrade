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

/**
 * Trading safety on mobile (launch readiness): the dismissible "Trade safely" notice in a first
 * conversation (link to the "Trading safely" page, Report, Block, Dismiss; the composer keeps
 * working), hidden after a reload once dismissed (stored on the device per collector), and Block
 * / Unblock on the collector profile next to Report.
 */
test.describe('mobile trading safety', () => {
  requireStack();

  test('the notice in a first conversation: guide, Report, Block, Dismiss, gone after a reload', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const ada = await createOnboardedCollector(request, 'safa', `Ada Careful ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'safb', `Ben Stranger ${suffix()}`);
    const conversationId = await apiStartConversation(request, ben, ada.id);
    expect(await apiSendText(request, ben, conversationId, 'Hi Ada, want to meet?')).toBe(201);

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByText('Hi Ada, want to meet?')).toBeVisible({ timeout: 30_000 });
    const notice = thread.getByTestId('safety-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Trade safely');
    await expect(notice).toContainText('Meet in a busy public place in daylight');

    // The composer is never blocked by the notice.
    const reply = `Sure, at the library? ${suffix()}`;
    await thread.getByLabel('Message', { exact: true }).fill(reply);
    await thread.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByText(reply)).toBeVisible({ timeout: 30_000 });
    await expect(notice).toBeVisible();

    // The guide, in-app.
    await notice.getByRole('link', { name: 'Read our trading safety advice' }).click();
    const guide = screen(page, 'legal-document');
    await expect(guide.getByRole('heading', { name: 'Trading safely' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(guide.getByTestId('legal-draft-banner')).toBeVisible();
    await page.goBack();
    await expect(notice).toBeVisible({ timeout: 30_000 });

    // Report opens the report screen for Ben, from the conversation.
    await notice.getByRole('button', { name: `Report ${ben.displayName}` }).click();
    const report = screen(page, 'report');
    await expect(report.getByTestId('report-target')).toHaveText(ben.displayName, {
      timeout: 30_000,
    });
    await page.goBack();
    await expect(notice).toBeVisible({ timeout: 30_000 });

    // Block asks for a confirmation; cancelling keeps everything.
    await notice.getByRole('button', { name: `Block ${ben.displayName}` }).click();
    const dialog = page.getByTestId('block-dialog');
    await expect(dialog).toContainText(`Block ${ben.displayName}?`);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(notice).toBeVisible();
    expect(await apiMyBlocks(request, ada)).toEqual([]);

    // Dismiss: gone now, and still gone after a reload (the dismissal lives on the device).
    await notice.getByRole('button', { name: 'Dismiss the safety notice' }).click();
    await expect(notice).toBeHidden();
    await expect(thread.getByLabel('Message', { exact: true })).toBeVisible();
    // Reload on the Map tab (`/`): the static export serves no page for `/messages` or a thread.
    await page.goBack();
    await expect(screen(page, 'messages')).toBeVisible({ timeout: 30_000 });
    await openTab(page, 'Map');
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await openTab(page, 'Messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    await expect(screen(page, 'conversation').getByText('Hi Ada, want to meet?')).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen(page, 'conversation').getByTestId('safety-notice')).toHaveCount(0);
  });

  test('Block and Unblock on the collector profile, next to Report', async ({ page, request }) => {
    test.setTimeout(150_000);
    const ada = await createOnboardedCollector(request, 'blka', `Ada Blocker ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'blkb', `Ben Blockee ${suffix()}`);
    await signInThroughUi(page, ada.email, ada.password);
    await openInApp(page, `/collectors/${ben.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(ben.displayName, {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-report')).toBeVisible();

    await profile.getByRole('button', { name: `Block ${ben.displayName}` }).click();
    const dialog = page.getByTestId('block-dialog');
    await expect(dialog).toContainText(`Block ${ben.displayName}?`);
    await dialog.getByRole('button', { name: 'Block' }).click();
    await expect(snackbar(page)).toHaveText(`${ben.displayName} is blocked.`, { timeout: 30_000 });
    expect((await apiMyBlocks(request, ada)).map((user) => user.handle)).toEqual([ben.handle]);
    // The profile reloads as blocked: Message unavailable, Unblock in place of Block.
    await expect(profile.getByRole('button', { name: `Unblock ${ben.displayName}` })).toBeVisible({
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-message')).toHaveAttribute('aria-disabled', 'true');

    await profile.getByRole('button', { name: `Unblock ${ben.displayName}` }).click();
    await expect(snackbar(page)).toHaveText(`${ben.displayName} is unblocked.`, {
      timeout: 30_000,
    });
    await expect(profile.getByRole('button', { name: `Block ${ben.displayName}` })).toBeVisible({
      timeout: 30_000,
    });
    expect(await apiMyBlocks(request, ada)).toEqual([]);
  });
});
