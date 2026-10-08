import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Mobile Phase 5 (public community) against the real, isolated stack: a fresh fictional
 * collector opens the channels from the Messages tab (Inbox | Community), posts in "General",
 * edits the post, replies to it, sees a reply of another collector, and deletes the post.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile community', () => {
  requireStack();

  test('channels with their activity, then post, edit, reply and delete in a channel', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const poster = await createOnboardedCollector(request, 'comm', `Cora Poster ${suffix()}`);
    const other = await createOnboardedCollector(request, 'comr', `Rémi Replier ${suffix()}`);

    await signInThroughUi(page, poster.email, poster.password);
    await openTab(page, 'Messages');
    const messages = screen(page, 'messages');
    await messages.getByRole('tab', { name: 'Community' }).click();
    const general = messages.getByTestId('channel-general');
    await expect(general).toContainText('General', { timeout: 30_000 });
    await expect(messages.getByText('Topics')).toBeVisible();
    await general.click();

    const channel = screen(page, 'community-channel');
    await expect(channel.getByTestId('channel-head')).toContainText('General', {
      timeout: 30_000,
    });
    const before = (await channel.getByTestId('channel-activity').textContent()) ?? '';
    const count = Number(/(\d+) posts? today/.exec(before)?.[1] ?? '0');

    // Post.
    const text = `Looking for an Emberfang Fox around the Plateau ${suffix()}`;
    await channel.getByLabel('Post text').fill(text);
    await channel.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(snackbar(page)).toHaveText('Posted.');
    await expect(channel.getByText(text)).toBeVisible();
    await expect(channel.getByTestId('channel-activity')).toContainText(
      `${count + 1} ${count + 1 === 1 ? 'post' : 'posts'} today`
    );

    // Edit it in place.
    const posts = await request.get(`${API_URL}/api/v1/community/channels/general/posts?limit=20`, {
      headers: authHeader(poster.idToken),
    });
    const post = ((await posts.json()) as { items: { id: string; body: string }[] }).items.find(
      (item) => item.body === text
    );
    expect(post, 'the new post').toBeTruthy();
    await channel.getByTestId(`post-menu-${post!.id}`).click();
    await page.getByTestId('post-edit').click();
    const edited = `${text} (edited)`;
    await channel.getByLabel('Edit your post').fill(edited);
    await channel.getByTestId('post-edit-save').click();
    await expect(channel.getByTestId(`post-${post!.id}`)).toContainText('edited');
    await expect(channel.getByText(edited)).toBeVisible();

    // Another collector replies (through the API): the thread shows it when opened; then a reply.
    const reply = await request.post(`${API_URL}/api/v1/community/posts/${post!.id}/replies`, {
      headers: authHeader(other.idToken),
      data: { body: 'I have one in my binder!' },
    });
    expect(reply.status(), 'reply as the other collector').toBe(201);
    const reopened = channel;
    await reopened.getByTestId(`post-replies-toggle-${post!.id}`).click();
    await expect(reopened.getByText('I have one in my binder!')).toBeVisible({ timeout: 30_000 });
    await reopened.getByLabel(`Reply to ${poster.displayName}`).fill('Great, messaging you now.');
    await reopened.getByTestId(`reply-submit-${post!.id}`).click();
    await expect(reopened.getByText('Great, messaging you now.')).toBeVisible();
    await expect(reopened.getByTestId(`post-replies-${post!.id}`)).toContainText(
      'I have one in my binder!'
    );

    // Delete it, after a confirmation.
    await reopened.getByTestId(`post-menu-${post!.id}`).click();
    await page.getByTestId('post-delete').click();
    await page.getByTestId('post-delete-dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(reopened.getByText(edited)).toBeHidden();
    await expect(snackbar(page)).toHaveText('Post deleted.');
  });
});
