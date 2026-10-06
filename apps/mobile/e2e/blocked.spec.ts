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

/**
 * Settings → Blocked users (stage M7, the web's blocked users section on `GET /me/blocks` and
 * `DELETE /users/{id}/block`): a block from a conversation, the blocked collector's profile
 * pointing at the list, the list itself and the unblock, checked on the API and on what the
 * other collector can do.
 */
test.describe('mobile blocked users', () => {
  requireStack();

  test('block from a conversation, find the collector under Blocked users, unblock', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const suffix = Math.random().toString(36).slice(2, 6);
    const ada = await createOnboardedCollector(request, 'bada', `Ada Blocks ${suffix}`);
    const ben = await createOnboardedCollector(request, 'bben', `Ben Blocked ${suffix}`);
    const conversationId = await apiStartConversation(request, ben, ada.id);
    expect(await apiSendText(request, ben, conversationId, 'Hello Ada!')).toBe(201);
    await signInThroughUi(page, ada.email, ada.password);

    // Nobody blocked yet.
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings').getByTestId('settings-link-blocked').click();
    const blocked = screen(page, 'settings-blocked');
    await expect(blocked.getByTestId('blocked-empty')).toBeVisible({ timeout: 30_000 });
    await expect(blocked.getByText('You have not blocked anyone')).toBeVisible();

    // Block Ben from the conversation (the tabs sit under the settings screens: navigate in-app).
    await openInApp(page, '/messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByText('Hello Ada!')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('conversation-menu').click();
    await page.getByTestId('conversation-block').click();
    const dialog = page.getByTestId('block-dialog');
    await expect(dialog).toContainText(`Block ${ben.displayName}?`);
    await expect(dialog).toContainText('Settings → Blocked users');
    await dialog.getByRole('button', { name: 'Block' }).click();
    await expect(thread.getByTestId('conversation-blocked-banner')).toContainText(
      `You blocked ${ben.displayName}`,
      { timeout: 30_000 }
    );
    expect((await apiMyBlocks(request, ada)).map((user) => user.handle)).toEqual([ben.handle]);
    expect(await apiSendText(request, ben, conversationId, 'Still there?')).toBe(403);

    // Ben's profile: Message is unavailable because of the block, with a link to the list.
    await openInApp(page, `/collectors/${ben.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(ben.displayName, {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-message')).toHaveAttribute('aria-disabled', 'true');
    await expect(profile.getByTestId('collector-message-reason')).toHaveText(
      'Messaging is unavailable because of a block. Manage blocks in Settings.'
    );
    await profile.getByTestId('collector-message-blocked-users').click();

    // Blocked users: Ben, when he was blocked, Unblock.
    const list = screen(page, 'settings-blocked');
    const row = list.getByTestId(`blocked-${ben.handle}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(ben.displayName);
    await expect(row).toContainText(`@${ben.handle} · blocked`);
    const unblocked = page.waitForRequest(
      (candidate) =>
        candidate.method() === 'DELETE' && candidate.url().endsWith(`/api/v1/users/${ben.id}/block`)
    );
    await row.getByRole('button', { name: `Unblock ${ben.displayName}` }).click();
    await unblocked;
    await expect(snackbar(page)).toHaveText(`${ben.displayName} is unblocked.`, {
      timeout: 30_000,
    });
    await expect(list.getByTestId('blocked-empty')).toBeVisible({ timeout: 30_000 });
    expect(await apiMyBlocks(request, ada)).toEqual([]);
    expect(await apiSendText(request, ben, conversationId, 'Back again')).toBe(201);

    // Ben's profile offers Message again.
    await page.goBack();
    await expect(screen(page, 'collector').getByTestId('collector-message')).not.toHaveAttribute(
      'aria-disabled',
      'true',
      { timeout: 30_000 }
    );
  });
});
