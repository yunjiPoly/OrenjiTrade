import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';
import { tooPrecise, watchCoordinates } from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  createStaffMember,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Public community channels (Phase 5) against the real local stack: a collector opens
 * `/community`, moves to "Montréal / Pokémon", posts with a shared card, is told inline that the
 * same text cannot be posted twice, edits the post; a second collector (another browser context)
 * replies inline; the author sees the reply and deletes the post. A moderator removes a post with
 * a reason. Every account is fictional and fresh; posts carry unique text so earlier runs never
 * interfere.
 */

const CHANNEL = 'montreal-pokemon';
const CHANNEL_NAME = 'Montréal / Pokémon';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

function postOf(page: Page, text: string) {
  return page.getByRole('article').filter({ hasText: text });
}

async function apiPost(
  api: APIRequestContext,
  collector: OnboardedCollector,
  body: string,
): Promise<string> {
  const response = await api.post(`${API_URL}/api/v1/community/channels/${CHANNEL}/posts`, {
    headers: authHeader(collector.idToken),
    data: { body },
  });
  expect(response.status(), 'POST community post').toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test.describe('community channels', () => {
  requireStack();

  test('post with a card, duplicate refused, edit, reply from another collector, delete', async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const author = await createOnboardedCollector(request, 'poster', {
      displayName: `Poppy Poster ${suffix()}`,
    });
    const replier = await createOnboardedCollector(request, 'replier', {
      displayName: `Remy Replier ${suffix()}`,
    });

    const page = await openSignedIn(browser, author);
    const watcher = watchCoordinates(page);
    // The primary navigation leads to the default (first regional) channel.
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Community' })
      .click();
    await expect(page).toHaveURL(/\/community\/montreal-yugioh$/);
    const channels = page.getByRole('navigation', { name: 'Community channels' });
    await expect(channels.getByRole('heading', { name: 'Montréal' })).toBeVisible();
    await expect(channels.getByRole('heading', { name: 'Topics' })).toBeVisible();
    await channels.getByRole('link', { name: CHANNEL_NAME }).click();
    await expect(page).toHaveURL(new RegExp(`/community/${CHANNEL}$`));
    await expect(channels.getByRole('link', { name: CHANNEL_NAME })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { level: 2, name: CHANNEL_NAME })).toBeVisible();

    // Post with a shared card.
    const text = `Looking for Azure-Eyes in near mint around the Plateau ${suffix()}`;
    const composer = page.getByRole('form', { name: `Post in ${CHANNEL_NAME}` });
    await composer.getByRole('textbox', { name: 'Post text' }).fill(text);
    await composer.getByRole('button', { name: 'Card' }).click();
    const cardField = composer.getByRole('combobox', { name: 'Card to share' });
    await expect(cardField).toBeFocused();
    await cardField.fill('AZR-EN001');
    await page
      .getByRole('option', { name: /Azure-Eyes Sky Dragon/ })
      .first()
      .click();
    await expect(composer.getByTestId('post-attachment')).toContainText('Azure-Eyes Sky Dragon');
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Posted.')).toBeVisible();
    await expect(postOf(page, text)).toBeVisible();
    // Stable handle on the post (its text changes while it is edited).
    const postId = await postOf(page, text).getAttribute('data-post-id');
    const post = page.locator(`article[data-post-id="${postId}"]`);
    await expect(post).toContainText('You');
    await expect(post.getByRole('link', { name: /^Card: Azure-Eyes Sky Dragon/ })).toBeVisible();
    await expect(composer.getByRole('textbox', { name: 'Post text' })).toHaveValue('');

    // The same text again within 24 hours is refused inline (409 DUPLICATE_POST).
    await composer.getByRole('textbox', { name: 'Post text' }).fill(text);
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(composer.getByTestId('post-error')).toContainText(
      'You already posted this text in the last 24 hours',
    );
    await expect(postOf(page, text)).toHaveCount(1);
    // Text the moderation rules refuse is explained without echoing the rule (422 POST_BLOCKED).
    await composer.getByRole('textbox', { name: 'Post text' }).fill(`zorblax deals ${suffix()}`);
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(composer.getByTestId('post-error')).toContainText(
      'This post breaks the community guidelines',
    );
    await expect(page.getByRole('article').filter({ hasText: 'zorblax' })).toHaveCount(0);
    await composer.getByRole('textbox', { name: 'Post text' }).fill('');

    // Edit in place.
    await post.getByRole('button', { name: /^Post options/ }).click();
    await page.getByRole('menuitem', { name: 'Edit post' }).click();
    const edited = `${text} (or lightly played)`;
    await post.getByRole('textbox', { name: 'Edit your post' }).fill(edited);
    await post.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Post updated.')).toBeVisible();
    await expect(post).toContainText('(or lightly played)');
    await expect(post).toContainText('edited');

    // Another collector replies inline.
    const other = await openSignedIn(browser, replier);
    await other.goto(`/community/${CHANNEL}`);
    const theirView = postOf(other, edited);
    await expect(theirView).toBeVisible();
    await expect(theirView).not.toContainText('You');
    await theirView.getByRole('button', { name: 'Reply' }).click();
    const replyBox = theirView.getByRole('textbox', { name: `Reply to ${author.displayName}` });
    await expect(replyBox).toBeFocused();
    const reply = `I have one, send me a message! ${suffix()}`;
    await replyBox.fill(reply);
    await replyBox.press('Enter');
    const theirReplies = theirView.getByRole('list', { name: `Replies to ${author.displayName}` });
    await expect(theirReplies).toContainText(reply);
    await expect(theirView.getByRole('button', { name: '1 reply' })).toBeVisible();
    await expect(replyBox).toHaveValue('');

    // The author sees the reply after reloading the channel, then deletes the post.
    await page.reload();
    const reloaded = postOf(page, edited);
    await reloaded.getByRole('button', { name: '1 reply' }).click();
    await expect(
      reloaded.getByRole('list', { name: `Replies to ${author.displayName}` }),
    ).toContainText(reply);
    await reloaded.getByRole('button', { name: /^Post options/ }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete this post?' });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Post deleted.')).toBeVisible();
    await expect(postOf(page, edited)).toHaveCount(0);

    await watcher.settle();
    expect(tooPrecise(watcher.samples), 'lat/lng with more than 3 decimals').toEqual([]);
    await page.context().close();
    await other.context().close();
  });

  test('a moderator removes a post with a reason', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const member = await createOnboardedCollector(request, 'member', {
      displayName: `Mo Member ${suffix()}`,
    });
    const text = `Selling everything cheap, write me ${suffix()}`;
    await apiPost(request, member, text);
    const moderator = await createStaffMember(request, 'moder', ['MODERATOR']);
    try {
      const page = await openSignedIn(browser, moderator);
      await page.goto(`/community/${CHANNEL}`);
      const post = postOf(page, text);
      await expect(post).toBeVisible();
      await post.getByRole('button', { name: /^Post options/ }).click();
      await expect(page.getByRole('menuitem', { name: 'Report collector' })).toBeEnabled();
      await page.getByRole('menuitem', { name: 'Remove (moderator)' }).click();
      const dialog = page.getByRole('dialog', { name: 'Remove this post?' });
      await expect(dialog).toBeVisible();
      // The reason is required.
      await dialog.getByRole('button', { name: 'Remove' }).click();
      await expect(dialog.getByText('Give a short reason for the audit log.')).toBeVisible();
      await dialog.getByRole('textbox', { name: 'Reason' }).fill('Spam (E2E check)');
      await dialog.getByRole('button', { name: 'Remove' }).click();
      await expect(page.getByText('Post removed. The action is in the audit log.')).toBeVisible();
      await expect(postOf(page, text)).toHaveCount(0);

      // Gone for members too.
      const listed = await request.get(`${API_URL}/api/v1/community/channels/${CHANNEL}/posts`, {
        headers: authHeader(member.idToken),
        params: { limit: 50 },
      });
      expect(listed.ok()).toBeTruthy();
      const bodies = ((await listed.json()) as { items: { body: string }[] }).items.map(
        (item) => item.body,
      );
      expect(bodies).not.toContain(text);

      // A post the rules flag (banned term with a FLAG action) reaches the console's flag list.
      const flaggedId = await apiPost(request, member, `Great fnordpromo bundle here ${suffix()}`);
      await page.goto('/admin/community');
      const channelList = page.getByRole('list', { name: 'Community channels' });
      await expect(channelList.locator('[data-channel="montreal-pokemon"]')).toContainText(
        CHANNEL_NAME,
      );
      await page.getByRole('tab', { name: 'Moderation flags' }).click();
      await expect(page).toHaveURL(/\/admin\/community\?tab=flags$/);
      const flag = page
        .getByRole('list', { name: 'Moderation flags' })
        .getByRole('listitem')
        .filter({ hasText: `@${member.handle}` });
      await expect(flag).toContainText('Banned term');
      await expect(flag).toContainText('Community post');
      await flag.getByRole('button', { name: /^Resolve flag/ }).click();
      const resolveDialog = page.getByRole('dialog', { name: 'Resolve this flag?' });
      await resolveDialog.getByRole('textbox', { name: 'Note (optional)' }).fill('Checked (E2E)');
      await resolveDialog.getByRole('button', { name: 'Resolve' }).click();
      await expect(page.getByText('Flag resolved. The action is in the audit log.')).toBeVisible();
      await expect(flag).toHaveCount(0);
      await page.getByRole('button', { name: 'Resolved', exact: true }).click();
      await expect(
        page
          .getByRole('list', { name: 'Moderation flags' })
          .getByRole('listitem')
          .filter({ hasText: `@${member.handle}` }),
      ).toContainText('Checked (E2E)');
      // Leave the seeded channel as it was.
      const cleanup = await request.delete(`${API_URL}/api/v1/community/posts/${flaggedId}`, {
        headers: authHeader(member.idToken),
      });
      expect(cleanup.ok(), 'delete the flagged post').toBeTruthy();
      await page.context().close();
    } finally {
      await moderator.demote();
    }
  });
});
