import { Page } from '@playwright/test';
import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { expect, test } from './support/fixtures';
import { placeOf } from './support/places';

/**
 * Acceptance — messaging (spec § 50): collector B waits on the Messages page in one browser;
 * collector A opens B's profile in another browser and sends a message; B receives it in realtime
 * (STOMP, no reload) with an unread badge, opens it (A sees the "Seen" receipt) and answers, and
 * the answer reaches A live.
 */

async function expectLive(page: Page): Promise<void> {
  await expect(page.getByTestId('realtime-status').first()).toHaveAttribute(
    'data-state',
    'connected',
    { timeout: 20_000 },
  );
}

test.describe('acceptance: messaging', () => {
  requireStack();

  test('A messages B, B receives it in realtime and answers', async ({ api, actors }) => {
    test.setTimeout(150_000);
    const a = await api.collector('acc-msga', {
      place: placeOf('messaging'),
      displayName: `Ari Sender ${suffix()}`,
    });
    const b = await api.collector('acc-msgb', {
      place: placeOf('messaging'),
      discoverable: true,
      displayName: `Bea Receiver ${suffix()}`,
    });

    // B waits on the Messages page, connected over STOMP.
    const pageB = await actors.open(b);
    await pageB.goto('/messages');
    await expect(pageB.getByRole('heading', { name: 'No conversations yet' })).toBeVisible();
    await expectLive(pageB);
    await pageB.evaluate(
      () => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true),
    );

    // A messages B from B's profile.
    const pageA = await actors.open(a);
    await pageA.goto(`/collectors/${b.handle}`);
    await expect(pageA.getByRole('heading', { level: 1, name: b.displayName })).toBeVisible();
    await pageA.getByRole('button', { name: `Message ${b.displayName}` }).click();
    await expect(pageA).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const threadA = pageA.getByRole('region', { name: `Conversation with ${b.displayName}` });
    await expectLive(pageA);
    const hello = `Hi Bea, is your Galecrest Owl still for trade? ${suffix()}`;
    const composerA = threadA.getByRole('textbox', { name: 'Message' });
    await composerA.fill(hello);
    await composerA.press('Enter');
    const logA = threadA.getByRole('log', { name: `Messages with ${b.displayName}` });
    await expect(logA).toContainText(hello);
    await expect(logA.getByTestId('receipt-sent')).toBeVisible();

    // B receives it in realtime: the conversation appears with its unread badge, no reload.
    const row = pageB.locator(`[data-conversation="${a.handle}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId('unread-badge')).toHaveText('1');
    await expect(row).toContainText(hello);
    expect(
      await pageB.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
    ).toBe(true);

    // B opens it; A sees "Seen"; B answers and A receives it live.
    await row.click();
    const threadB = pageB.getByRole('region', { name: `Conversation with ${a.displayName}` });
    await expect(
      threadB.getByRole('log', { name: `Messages with ${a.displayName}` }),
    ).toContainText(hello);
    await expect(logA.getByTestId('receipt-seen')).toBeVisible({ timeout: 20_000 });
    const answer = `Yes! Meet at the library on Saturday? ${suffix()}`;
    const composerB = threadB.getByRole('textbox', { name: 'Message' });
    await composerB.fill(answer);
    await composerB.press('Enter');
    await expect(logA).toContainText(answer, { timeout: 15_000 });
  });
});
