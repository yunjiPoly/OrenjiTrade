import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { expect, test } from './support/fixtures';

/**
 * Acceptance — community chat: collector A opens the community from the primary navigation, moves
 * to the "Looking For" channel and posts with a shared card; collector B, in another browser,
 * reads the post and replies inline; A sees the reply and finally deletes the post.
 */

const CHANNEL = 'looking-for';
const CHANNEL_NAME = 'Looking For';

test.describe('acceptance: community chat', () => {
  requireStack();

  test('post with a card, a reply from another collector, delete', async ({ api, actors }) => {
    test.setTimeout(150_000);
    const a = await api.collector('acc-poster', { displayName: `Poppy Poster ${suffix()}` });
    const b = await api.collector('acc-replier', { displayName: `Remy Replier ${suffix()}` });

    // --- A posts with a shared card ---------------------------------------------------------------
    const pageA = await actors.open(a);
    await pageA
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Community' })
      .click();
    await expect(pageA).toHaveURL(/\/community\/[\w-]+$/);
    await pageA
      .getByRole('navigation', { name: 'Community channels' })
      .getByRole('link', { name: CHANNEL_NAME })
      .click();
    await expect(pageA).toHaveURL(new RegExp(`/community/${CHANNEL}$`));
    const text = `Looking for a Mirrorblade Knight near the library ${suffix()}`;
    const composer = pageA.getByRole('form', { name: `Post in ${CHANNEL_NAME}` });
    await composer.getByRole('textbox', { name: 'Post text' }).fill(text);
    await composer.getByRole('button', { name: 'Card' }).click();
    await composer.getByRole('combobox', { name: 'Card to share' }).fill('SHV-EN003');
    await pageA
      .getByRole('option', { name: /Mirrorblade Knight/ })
      .first()
      .click();
    await expect(composer.getByTestId('post-attachment')).toContainText('Mirrorblade Knight');
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(pageA.getByText('Posted.')).toBeVisible();
    const postId = await pageA
      .getByRole('article')
      .filter({ hasText: text })
      .getAttribute('data-post-id');
    const postA = pageA.locator(`article[data-post-id="${postId}"]`);
    await expect(postA.getByRole('link', { name: /^Card: Mirrorblade Knight/ })).toBeVisible();

    // --- B reads it and replies inline --------------------------------------------------------------
    const pageB = await actors.open(b);
    await pageB.goto(`/community/${CHANNEL}`);
    const postB = pageB.locator(`article[data-post-id="${postId}"]`);
    await expect(postB).toContainText(text);
    await expect(postB).toContainText(a.displayName);
    await postB.getByRole('button', { name: 'Reply' }).click();
    const replyBox = postB.getByRole('textbox', { name: `Reply to ${a.displayName}` });
    const reply = `I have one in near mint, message me! ${suffix()}`;
    await replyBox.fill(reply);
    await replyBox.press('Enter');
    await expect(postB.getByRole('list', { name: `Replies to ${a.displayName}` })).toContainText(
      reply,
    );

    // --- A sees the reply, then deletes the post ------------------------------------------------------
    await pageA.reload();
    await postA.getByRole('button', { name: '1 reply' }).click();
    await expect(postA.getByRole('list', { name: `Replies to ${a.displayName}` })).toContainText(
      reply,
    );
    await postA.getByRole('button', { name: /^Post options/ }).click();
    await pageA.getByRole('menuitem', { name: 'Delete post' }).click();
    await pageA
      .getByRole('dialog', { name: 'Delete this post?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(pageA.getByText('Post deleted.')).toBeVisible();
    await expect(postA).toHaveCount(0);
  });
});
