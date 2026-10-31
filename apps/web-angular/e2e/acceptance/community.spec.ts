import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { expect, test } from './support/fixtures';

/**
 * Acceptance — Messages › Community (web stage WF, spec 10.7, board W22): collector A opens the
 * community from the primary navigation, lands in the Yu-Gi-Oh! room of their region and posts
 * with one of their cards shared; collector B, in another browser, reads the post with the card
 * (no reply threads: the "⋯" offers Message, Report this post and Block); A finally deletes it.
 */

const ROOM = 'americas-north-yugioh';
const ROOM_NAME = 'Yu-Gi-Oh!';

test.describe('acceptance: community rooms', () => {
  requireStack();

  test('a post with a shared card, read by another collector, then deleted', async ({
    api,
    actors,
  }) => {
    test.setTimeout(150_000);
    const a = await api.collector('acc-poster', { displayName: `Poppy Poster ${suffix()}` });
    const b = await api.collector('acc-reader', { displayName: `Remy Reader ${suffix()}` });
    await api.item(a, 'SHV-EN003', { visibility: 'PUBLIC' });

    // --- A posts with a shared card ---------------------------------------------------------------
    const pageA = await actors.open(a);
    await pageA
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /^Messages/ })
      .click();
    await pageA
      .getByRole('navigation', { name: 'Messages' })
      .getByRole('link', { name: 'Community' })
      .click();
    await expect(pageA).toHaveURL(new RegExp(`/messages/community/${ROOM}$`));
    const roomA = pageA.getByRole('region', { name: ROOM_NAME });
    const text = `Looking to trade my Mirrorblade Knight by mail ${suffix()}`;
    await roomA.getByRole('button', { name: 'Add to your post' }).click();
    await pageA.getByRole('menuitem', { name: 'Share a card' }).click();
    await pageA
      .getByRole('dialog', { name: 'Share a card' })
      .getByRole('button', { name: /^Mirrorblade Knight/ })
      .click();
    const field = roomA.getByRole('textbox', { name: `Write to the ${ROOM_NAME} room` });
    await field.fill(text);
    await roomA.getByRole('button', { name: `Post to the ${ROOM_NAME} room` }).click();
    const postId = await roomA
      .getByRole('article')
      .filter({ hasText: text })
      .getAttribute('data-post-id');
    const postA = pageA.locator(`article[data-post-id="${postId}"]`);
    await expect(
      postA.getByRole('link', { name: 'View Mirrorblade Knight, who has this card' }),
    ).toBeVisible();

    // --- B reads it with the card; no reply threads ------------------------------------------------
    const pageB = await actors.open(b);
    await pageB.goto(`/messages/community/${ROOM}`);
    const postB = pageB.locator(`article[data-post-id="${postId}"]`);
    await expect(postB).toContainText(text);
    await expect(postB).toContainText(a.handle);
    await expect(postB.getByRole('link', { name: /Mirrorblade Knight/ })).toBeVisible();
    await expect(postB.getByRole('button', { name: /reply/i })).toHaveCount(0);
    await postB.hover();
    await postB.getByRole('button', { name: `More for the post by ${a.handle}` }).click();
    await expect(pageB.getByRole('menuitem', { name: `Message ${a.handle}` })).toBeVisible();
    await pageB.keyboard.press('Escape');

    // --- A deletes the post ----------------------------------------------------------------------------
    await postA.hover();
    await postA.getByRole('button', { name: `More for the post by ${a.handle}` }).click();
    await pageA.getByRole('menuitem', { name: 'Delete' }).click();
    await pageA
      .getByRole('dialog', { name: 'Delete this post?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(pageA.getByText('Post deleted.')).toBeVisible();
    await expect(postA).toHaveCount(0);
  });
});
