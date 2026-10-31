import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';
import {
  apiCreateItem,
  apiUpdatePrivacy,
  coordinateLeaks,
  printingIdOf,
  watchCoordinates,
} from './support/inventory';
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
 * Messages › Community on the web (stage WF, spec 10.7, board W22; the phone's R11 rooms: one
 * public room per platform region and game) against the real local stack: the five rooms of the
 * browsed region beside the open room, a post with text and a shared card (the "+" menu's "Share a
 * card"), the phone's refusals (the same text twice, the moderation rules, the room's limit of 10
 * an hour), editing and deleting one's own post; another collector's "⋯": Report this post, and
 * Block, after which the author's posts leave the room; a moderator's removal; Room rules as the
 * third pane, a drawer at md and one pane per route below 960. Every account is fictional and
 * fresh; posts carry unique text so earlier runs never interfere.
 */

const ROOM = 'americas-north-yugioh';
const ROOM_NAME = 'Yu-Gi-Oh!';
/** A quieter room for the posting limit (its ten posts are deleted afterwards). */
const LIMIT_ROOM = 'americas-north-riftbound';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

async function openSignedIn(
  browser: Browser,
  collector: OnboardedCollector,
  viewport = { width: 1280, height: 800 },
): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

async function apiPost(
  api: APIRequestContext,
  collector: OnboardedCollector,
  body: string,
  room = ROOM,
): Promise<string> {
  const response = await api.post(`${API_URL}/api/v1/community/channels/${room}/posts`, {
    headers: authHeader(collector.idToken),
    data: { body },
  });
  expect(response.status(), 'POST community post').toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function apiDeletePost(
  api: APIRequestContext,
  collector: OnboardedCollector,
  id: string,
): Promise<void> {
  await api.delete(`${API_URL}/api/v1/community/posts/${id}`, {
    headers: authHeader(collector.idToken),
  });
}

function postById(page: Page, id: string) {
  return page.locator(`article[data-post-id="${id}"]`);
}

test.describe('community rooms', () => {
  requireStack();

  test('the rooms of the region, a post with a shared card, refusals, edit and delete', async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const author = await createOnboardedCollector(request, 'poster', { location: true });
    await apiUpdatePrivacy(request, author.idToken, { discoverable: true });
    // A public card of the room's game, for "Share a card".
    await apiCreateItem(request, author.idToken, {
      printingId: await printingIdOf(request, author.idToken, 'AZR-EN001'),
      visibility: 'PUBLIC',
    });
    const reader = await createOnboardedCollector(request, 'reader');

    const page = await openSignedIn(browser, author);
    const watcher = watchCoordinates(page);
    // Messages › Community opens the browsed game's room of the browsed region (spec 10.7).
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /^Messages/ })
      .click();
    // From the keyboard: the swap of Chats | Community keeps the focus on the tab (WF review U8).
    const communityTab = page
      .getByRole('navigation', { name: 'Messages' })
      .getByRole('link', { name: 'Community' });
    await communityTab.focus();
    await communityTab.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/messages/community/${ROOM}$`));
    await expect(communityTab).toBeFocused();
    const rooms = page.getByRole('list', { name: 'Game rooms in Americas (North)' });
    await expect(rooms.getByRole('link')).toHaveCount(5);
    await expect(rooms.getByRole('link').first()).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: /^Region: Americas \(North\)/ })).toBeVisible();
    await expect(
      page.getByText(
        'Every collector in Americas (North) can read these rooms. Keep deals and addresses in private chats.',
      ),
    ).toBeVisible();
    const room = page.getByRole('region', { name: ROOM_NAME });
    await expect(room.getByRole('heading', { level: 2, name: ROOM_NAME })).toBeVisible();
    await expect(room).toContainText('Americas (North) · public room');
    await expect(room).toContainText(
      'Every collector can read this room. Keep deals and addresses in private chats.',
    );
    // Room rules, the third pane at 1280.
    const rules = page.getByRole('complementary', { name: 'Room rules' });
    await expect(rules).toContainText('You can post up to 10 times an hour in each room.');

    // A post with a shared card, from the "+" menu.
    const text = `Spare Azure-Eyes in near mint, shipped with tracking ${suffix()}`;
    await room.getByRole('button', { name: 'Add to your post' }).click();
    await page.getByRole('menuitem', { name: 'Share a card' }).click();
    const picker = page.getByRole('dialog', { name: 'Share a card' });
    await expect(picker).toContainText('Everyone in this room can see it and open it.');
    await picker.getByRole('button', { name: /^Azure-Eyes Sky Dragon/ }).click();
    const box = room.getByRole('form', { name: `Write to the ${ROOM_NAME} room` });
    await expect(box.getByRole('group', { name: 'Added to your post' })).toContainText(
      'Azure-Eyes Sky Dragon',
    );
    const field = box.getByRole('textbox', { name: `Write to the ${ROOM_NAME} room` });
    await field.fill(text);
    await field.press('Enter');
    const posted = room.getByRole('article').filter({ hasText: text });
    await expect(posted).toBeVisible();
    await expect(field).toHaveValue('');
    const postId = (await posted.getAttribute('data-post-id')) ?? '';
    const post = postById(page, postId);
    await expect(post).toContainText('You');
    await expect(post).toContainText('Quebec ·');
    await expect(
      post.getByRole('link', { name: 'View Azure-Eyes Sky Dragon, who has this card' }),
    ).toBeVisible();
    // The list's preview follows.
    await expect(rooms.getByRole('link').first()).toContainText(`You: ${text.slice(0, 20)}`);

    // The same text again is refused in the phone's words (409 DUPLICATE_POST), the text kept.
    await field.fill(text);
    await field.press('Enter');
    await expect(box.getByTestId('room-post-error')).toContainText('You already posted this.');
    await expect(field).toHaveValue(text);
    // Text the moderation rules refuse (422 POST_BLOCKED).
    await field.fill(`zorblax deals ${suffix()}`);
    await room.getByRole('button', { name: `Post to the ${ROOM_NAME} room` }).click();
    await expect(box.getByTestId('room-post-error')).toContainText('breaks the community rules');
    await expect(room.getByRole('article').filter({ hasText: 'zorblax' })).toHaveCount(0);
    await field.fill('');

    // "Share a card" also finds any card of the catalogue, one the poster does not own (WF
    // review F1): a "Looking for" post.
    const looking = `Looking for this printing in near mint ${suffix()}`;
    await room.getByRole('button', { name: 'Add to your post' }).click();
    await page.getByRole('menuitem', { name: 'Share a card' }).click();
    const search = page.getByRole('dialog', { name: 'Share a card' });
    await search.getByRole('searchbox').fill('Lantern');
    await expect(search).toContainText('None of your public Yu-Gi-Oh! cards match “Lantern”.');
    const all = search.getByRole('region', { name: 'All cards' });
    await all
      .getByRole('button', { name: /^Lantern Fox Spirit, Yu-Gi-Oh!/ })
      .first()
      .click();
    await expect(box.getByRole('group', { name: 'Added to your post' })).toContainText(
      'Lantern Fox Spirit',
    );
    await field.fill(looking);
    await field.press('Enter');
    const lookingPost = room.getByRole('article').filter({ hasText: looking });
    await expect(
      lookingPost.getByRole('link', { name: 'View Lantern Fox Spirit, who has this card' }),
    ).toBeVisible();
    const lookingId = (await lookingPost.getAttribute('data-post-id')) ?? '';

    // Another collector reads it: no "You", and the "⋯" of someone else's post.
    const other = await openSignedIn(browser, reader);
    await other.goto(`/messages/community/${ROOM}`);
    const theirs = postById(other, postId);
    await expect(theirs).toContainText(text);
    await expect(theirs).not.toContainText('You');
    await theirs.hover();
    await theirs.getByRole('button', { name: `More for the post by ${author.handle}` }).click();
    await expect(other.getByRole('menuitem')).toHaveText([
      `Message ${author.handle}`,
      'Report this post',
      `Block ${author.handle}`,
    ]);
    // "Message {h}" opens the chat in Messages with the focus in its message box (WF review A2).
    await other.getByRole('menuitem', { name: `Message ${author.handle}` }).click();
    await expect(other).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused();
    await other.context().close();
    await apiDeletePost(request, author, lookingId);

    // Edit in place, then delete.
    await post.hover();
    await post.getByRole('button', { name: `More for the post by ${author.handle}` }).click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const edited = `${text} (or lightly played)`;
    await post.getByRole('textbox', { name: 'Edit your post' }).fill(edited);
    await post.getByRole('button', { name: 'Save' }).click();
    await expect(post).toContainText('(or lightly played)');
    await expect(post).toContainText('edited');
    await post.hover();
    await post.getByRole('button', { name: `More for the post by ${author.handle}` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this post?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByText('Post deleted.')).toBeVisible();
    await expect(post).toHaveCount(0);

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples), 'lat/lng in a JSON answer').toEqual([]);
    await page.context().close();
  });

  test("Report this post, then Block: the author's posts leave the room", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const author = await createOnboardedCollector(request, 'loud');
    const viewer = await createOnboardedCollector(request, 'quiet');
    const text = `Selling a binder of Fiendsmith staples ${suffix()}`;
    const postId = await apiPost(request, author, text);
    try {
      // At 1440x900, as board W22 draws the report (WF review R1-4).
      const page = await openSignedIn(browser, viewer, { width: 1440, height: 900 });
      await page.goto(`/messages/community/${ROOM}`);
      const post = postById(page, postId);
      await expect(post).toContainText(text);

      // Report this post: the dialog shows the post; the report carries its context.
      await post.hover();
      await post.getByRole('button', { name: `More for the post by ${author.handle}` }).click();
      await page.getByRole('menuitem', { name: 'Report this post' }).click();
      const report = page.getByRole('dialog', { name: 'Report this post' });
      await expect(report.getByTestId('report-post-preview')).toContainText(text);
      await expect(report).toContainText('Why are you reporting it?');
      // Every reason, Details and the buttons show at once: the content does not scroll and the
      // dialog stays inside the window (WF review R1-4).
      await expect(report.getByRole('radio')).toHaveCount(7);
      const fit = await report.locator('mat-dialog-content').evaluate((content) => ({
        overflow: content.scrollHeight - content.clientHeight,
        bottom: content.closest('.mat-mdc-dialog-surface')!.getBoundingClientRect().bottom,
      }));
      expect(fit.overflow).toBeLessThanOrEqual(1);
      expect(fit.bottom).toBeLessThanOrEqual(900);
      await expect(report.getByRole('textbox', { name: 'Details (optional)' })).toBeInViewport();
      await expect(report.getByRole('button', { name: 'Send report' })).toBeInViewport();
      await report.getByRole('radio', { name: 'Spam' }).check();
      await report.getByRole('button', { name: 'Send report' }).click();
      const sent = page.getByRole('dialog', { name: 'Report sent' });
      await expect(sent).toContainText(`Our moderators will review this post by ${author.handle}`);
      await sent.getByRole('button', { name: 'Done' }).click();
      const mine = await request.get(`${API_URL}/api/v1/me/reports`, {
        headers: authHeader(viewer.idToken),
      });
      const reports = (await mine.json()) as { reason: string; reportedUser: { id: string } }[];
      expect(reports).toEqual([
        expect.objectContaining({
          reason: 'SPAM',
          reportedUser: expect.objectContaining({ id: author.id }),
        }),
      ]);
      // The focus came back to the post's "⋯".
      await expect(
        post.getByRole('button', { name: `More for the post by ${author.handle}` }),
      ).toBeFocused();

      // Block: a confirmation, then the posts leave at once, with Undo in the toast.
      await post.getByRole('button', { name: `More for the post by ${author.handle}` }).click();
      await page.getByRole('menuitem', { name: `Block ${author.handle}` }).click();
      const confirm = page.getByRole('dialog', { name: `Block ${author.handle}?` });
      await expect(confirm).toContainText('They are never told.');
      await confirm.getByRole('button', { name: 'Block' }).click();
      await expect(
        page.getByTestId('toast').filter({ hasText: `${author.handle} is blocked` }),
      ).toBeVisible();
      await expect(post).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'Room rules' })).toContainText(
        `You blocked ${author.handle}`,
      );
      // Hidden by the server too: a reload does not bring it back.
      await page.reload();
      await expect(page.getByRole('region', { name: ROOM_NAME })).toBeVisible();
      await expect(postById(page, postId)).toHaveCount(0);
      await page.context().close();
    } finally {
      await request.delete(`${API_URL}/api/v1/users/${author.id}/block`, {
        headers: authHeader(viewer.idToken),
      });
      await apiDeletePost(request, author, postId);
    }
  });

  test("the room's limit of 10 posts an hour reads in the phone's words", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const busy = await createOnboardedCollector(request, 'busy');
    const ids: string[] = [];
    try {
      for (let index = 0; index < 10; index++) {
        ids.push(await apiPost(request, busy, `Riftbound note ${index} ${suffix()}`, LIMIT_ROOM));
      }
      const page = await openSignedIn(browser, busy);
      await page.goto(`/messages/community/${LIMIT_ROOM}`);
      const room = page.getByRole('region', { name: 'Riftbound' });
      const field = room.getByRole('textbox', { name: 'Write to the Riftbound room' });
      await field.fill(`One more ${suffix()}`);
      await field.press('Enter');
      await expect(room.getByTestId('room-post-error')).toContainText(
        'You can post up to 10 times an hour in each room. Try again later.',
      );
      await expect(room.getByRole('button', { name: 'Try again' })).toHaveCount(0);
      await page.context().close();
    } finally {
      for (const id of ids) {
        await apiDeletePost(request, busy, id);
      }
    }
  });

  test('Room rules as a drawer at md; one pane per route below 960', async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const member = await createOnboardedCollector(request, 'narrow');
    const page = await openSignedIn(browser, member, { width: 1024, height: 768 });
    await page.goto(`/messages/community/${ROOM}`);
    const toggle = page.getByRole('button', { name: 'Room rules', exact: true });
    await expect(page.getByRole('dialog', { name: 'Room rules' })).toHaveCount(0);
    await toggle.click();
    const drawer = page.getByRole('dialog', { name: 'Room rules' });
    await expect(drawer).toContainText('You can post up to 10 times an hour in each room.');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(toggle).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/messages?tab=community');
    const rooms = page.getByRole('list', { name: 'Game rooms in Americas (North)' });
    await expect(rooms.getByRole('link')).toHaveCount(5);
    await expect(page).toHaveURL(/\/messages\?tab=community$/);
    await rooms.getByRole('link', { name: /^Pokémon room/ }).click();
    await expect(page).toHaveURL(/\/messages\/community\/americas-north-pokemon$/);
    await expect(rooms).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to Community' }).click();
    await expect(page).toHaveURL(/\/messages\?tab=community$/);
    await expect(page.getByRole('link', { name: /^Pokémon room/ })).toBeFocused();
    await page.context().close();
  });

  test('a moderator removes a post with a reason', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const member = await createOnboardedCollector(request, 'member');
    const text = `Selling everything cheap, write me ${suffix()}`;
    const postId = await apiPost(request, member, text);
    const moderator = await createStaffMember(request, 'moder', ['MODERATOR']);
    try {
      const page = await openSignedIn(browser, moderator);
      await page.goto(`/messages/community/${ROOM}`);
      const post = postById(page, postId);
      await expect(post).toBeVisible();
      await post.hover();
      await post.getByRole('button', { name: `More for the post by ${member.handle}` }).click();
      await expect(page.getByRole('menuitem', { name: 'Report this post' })).toBeEnabled();
      await page.getByRole('menuitem', { name: 'Remove (moderator)' }).click();
      const dialog = page.getByRole('dialog', { name: 'Remove this post?' });
      await expect(dialog).toBeVisible();
      // The reason is required.
      await dialog.getByRole('button', { name: 'Remove' }).click();
      await expect(dialog.getByText('Give a short reason for the audit log.')).toBeVisible();
      await dialog.getByRole('textbox', { name: 'Reason' }).fill('Spam (E2E check)');
      await dialog.getByRole('button', { name: 'Remove' }).click();
      await expect(page.getByText('Post removed. The action is in the audit log.')).toBeVisible();
      await expect(post).toHaveCount(0);

      // Gone for members too.
      const listed = await request.get(`${API_URL}/api/v1/community/channels/${ROOM}/posts`, {
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
      await expect(channelList.locator(`[data-channel="${ROOM}"]`)).toContainText(ROOM_NAME);
      // The channels before the rooms are archived, not deleted (V134).
      await expect(channelList.locator('[data-channel="looking-for"]')).toContainText('Archived');
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
      await apiDeletePost(request, member, flaggedId);
      await page.context().close();
    } finally {
      await moderator.demote();
    }
  });
});
