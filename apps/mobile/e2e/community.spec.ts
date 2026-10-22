import { expect, test } from './support/fixtures';
import {
  API_URL,
  PHOTO_PNG,
  authHeader,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Stage R11 (Messages › Community: one simple room per game) against the real, isolated stack: a
 * fresh fictional collector opens Messages › Community, sees the five rooms of Americas (North)
 * with the browsed game's room first (Pokémon, their profile game), opens the Yu-Gi-Oh! room, reads
 * its rules, posts text with a photo (a file chooser on the web build), is told when the same text
 * is posted twice, opens the "⋯" sheet of another collector's post (Message, Report, Block) and
 * reports it, then deletes their own post. Every account is fictional and fresh; posts carry
 * unique text so earlier runs never interfere.
 */

const ROOM = 'americas-north-yugioh';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile community rooms', () => {
  requireStack();

  test('the rooms of the region, then a room: rules, a photo post, a duplicate, report and delete', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const poster = await createOnboardedCollector(request, 'comm', `Cora Poster ${suffix()}`);
    const other = await createOnboardedCollector(request, 'comr', `Remi Other ${suffix()}`);
    const theirs = `Does anyone ship to Ontario? Looking for Nibiru ${suffix()}`;
    const posted = await request.post(`${API_URL}/api/v1/community/channels/${ROOM}/posts`, {
      headers: authHeader(other.idToken),
      data: { body: theirs },
    });
    expect(posted.status(), 'POST as the other collector').toBe(201);
    const theirId = ((await posted.json()) as { id: string }).id;

    await signInThroughUi(page, poster.email, poster.password);
    await openTab(page, 'Messages');
    const messages = screen(page, 'messages');
    await expect(messages.getByRole('tab', { name: /^Chats/ })).toBeVisible({ timeout: 30_000 });
    await messages.getByRole('tab', { name: 'Community' }).click();
    const rows = messages.getByTestId(/^room-americas-north-[a-z]+$/);
    await expect(rows).toHaveCount(5, { timeout: 30_000 });
    // The browsed game (Pokémon, the collector's profile game) first, then the games' order.
    await expect(rows.first()).toHaveAttribute('data-testid', 'room-americas-north-pokemon');
    await expect(messages.getByTestId('community-footnote')).toContainText(
      'Every collector in Americas (North) can read these rooms.'
    );
    const yugioh = messages.getByTestId(`room-${ROOM}`);
    await expect(messages.getByTestId(`room-preview-${ROOM}`)).toContainText(
      `${other.handle}: ${theirs}`
    );
    await expect(messages.getByTestId(`room-unread-${ROOM}`)).toBeVisible();
    await yugioh.click();

    const room = screen(page, 'community-room');
    await expect(room.getByTestId('room-head')).toContainText('Yu-Gi-Oh!', { timeout: 30_000 });
    await expect(room.getByTestId('room-subtitle')).toHaveText('Americas (North) · public room');
    await expect(room.getByTestId('room-banner')).toContainText(
      'Every collector can read this room. Keep deals and addresses in private chats.'
    );
    await expect(room.getByText(theirs)).toBeVisible({ timeout: 30_000 });

    // The rules.
    await room.getByRole('button', { name: 'Room rules' }).click();
    await expect(page.getByTestId('room-rate-rule')).toHaveText(
      'You can post up to 10 times an hour in each room.'
    );
    await page.getByTestId('room-rules-ok').click();
    await expect(page.getByTestId('room-rate-rule')).toBeHidden();

    // A post with a photo: the send button turns orange with text only.
    const send = room.getByTestId('room-send');
    await expect(send).toBeDisabled();
    await room.getByRole('button', { name: 'Send a photo, or share a card or a binder' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('room-attach-photo').click();
    await (
      await chooser
    ).setFiles({ name: 'binder.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(room.getByTestId('room-attachment-photo-0')).toBeVisible();
    await expect(send).toBeDisabled();
    const text = `My Yu-Gi-Oh! binder, ships tracked ${suffix()}`;
    await room.getByLabel('Write to the Yu-Gi-Oh! room').fill(text);
    await expect(send).toBeEnabled();
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/v1/uploads/images') &&
        response.url().includes('kind=COMMUNITY')
    );
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/v1/community/channels/${ROOM}/posts`)
    );
    await send.click();
    expect((await upload).status()).toBe(201);
    const answer = await created;
    expect(answer.status(), 'POST the post').toBe(201);
    const mine = (await answer.json()) as {
      id: string;
      body: string;
      payload: { photos?: unknown[] };
    };
    expect(mine.body).toBe(text);
    expect(mine.payload.photos ?? []).toHaveLength(1);
    await expect(room.getByTestId(`room-post-body-${mine.id}`)).toHaveText(text, {
      timeout: 30_000,
    });
    await expect(
      room.getByTestId(`room-post-${mine.id}`).getByTestId('room-photo-0')
    ).toBeVisible();
    await expect(room.getByLabel('Write to the Yu-Gi-Oh! room')).toHaveValue('');

    // The same text again: refused, and the text stays.
    await room.getByLabel('Write to the Yu-Gi-Oh! room').fill(text);
    await send.click();
    await expect(room.getByTestId('room-post-error')).toHaveText('You already posted this.');
    await expect(room.getByLabel('Write to the Yu-Gi-Oh! room')).toHaveValue(text);

    // The "⋯" of another collector's post: Message, Report, Block; report it.
    await room.getByTestId(`room-post-more-${theirId}`).click();
    const sheet = page.getByTestId('room-post-sheet');
    await expect(sheet.getByText(`Message ${other.handle}`)).toBeVisible();
    await expect(sheet.getByText(`Block ${other.handle}`)).toBeVisible();
    await sheet.getByText('Report this post').click();
    await expect(page).toHaveURL(/\/report\?/, { timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`postId=${theirId}`));
    await page.goBack();

    // Delete your own post.
    await expect(room.getByTestId(`room-post-${mine.id}`)).toBeVisible({ timeout: 30_000 });
    await room.getByTestId(`room-post-more-${mine.id}`).click();
    await page.getByTestId('room-post-delete').click();
    await page.getByTestId('room-delete-dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(snackbar(page)).toHaveText('Post deleted.');
    // (The message box still holds the refused duplicate: look for the post itself.)
    await expect(room.getByTestId(`room-post-${mine.id}`)).toHaveCount(0);
  });
});
