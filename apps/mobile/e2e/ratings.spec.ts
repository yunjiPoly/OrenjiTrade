import { expect, test } from './support/fixtures';
import {
  apiCanRate,
  apiCollectorRatings,
  apiSendText,
  apiStartConversation,
  createOnboardedCollector,
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
 * Rating a collector after a real conversation (Phase 7; stage R1 of the phone redesign): once
 * both sides sent 3 messages, Ada rates Ben from the conversation menu. The form asks Overall,
 * Communication, Card condition and Shipping, never "Meetup reliability" (ADR 0018: collectors
 * don't meet, deals ship by mail); the API holds what she chose.
 */
test.describe('mobile ratings', () => {
  requireStack();

  test('rates a collector after a conversation, without meetup reliability', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const ada = await createOnboardedCollector(request, 'rata', `Ada Rater ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'ratb', `Ben Rated ${suffix()}`);
    const conversationId = await apiStartConversation(request, ben, ada.id);
    for (const [index, line] of [
      ['Still have the Emberfang Fox?', 'Yes, 12 dollars.'],
      ['With shipping?', '15 with tracking.'],
      ['Deal, e-Transfer sent.', 'Shipped, thanks!'],
    ].entries()) {
      expect(await apiSendText(request, ben, conversationId, `${line[0]} ${index}`)).toBe(201);
      expect(await apiSendText(request, ada, conversationId, `${line[1]} ${index}`)).toBe(201);
    }
    // The conversation qualifies after commit (the ratings module listens to the messages).
    await expect.poll(() => apiCanRate(request, ada, ben.id), { timeout: 30_000 }).toBe(true);

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    await screen(page, 'messages').getByTestId(`conversation-row-${ben.handle}`).click();
    await expect(screen(page, 'conversation').getByText('Shipped, thanks! 2')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId('conversation-menu').click();
    await page.getByTestId('conversation-rate').click();

    const form = screen(page, 'rate');
    await expect(form.getByTestId('rating-form')).toBeVisible({ timeout: 30_000 });
    for (const label of ['Overall score', 'Communication', 'Card condition', 'Shipping']) {
      await expect(form.getByRole('radiogroup', { name: label })).toBeVisible();
    }
    // Stage R14 (mockup v50 screen 61): the deal under the collector, "Publish rating" at the
    // bottom, grey until the overall score.
    await expect(form.getByTestId('rate-person-line')).toContainText('Conversation · ');
    await expect(form.getByRole('button', { name: 'Publish rating' })).toBeDisabled();
    await expect(form.getByText(/Meetup reliability|agreed place/)).toHaveCount(0);
    await form.getByTestId('rate-overall-5').click();
    await form.getByTestId('rate-shipping-4').click();
    await form.getByTestId('rate-comment').fill('Well packed.');
    await form.getByTestId('rate-submit').click();
    await expect(snackbar(page)).toHaveText(
      `Thanks! Your rating of ${ben.displayName} is published.`,
      {
        timeout: 30_000,
      }
    );

    const ratings = await apiCollectorRatings(request, ada, ben.handle);
    const mine = ratings.items.find((rating) => rating.rater.handle === ada.handle);
    expect(mine?.overall).toBe(5);
    expect(mine?.comment).toBe('Well packed.');
    expect(mine?.breakdown?.['shipping']).toBe(4);
    expect(mine?.breakdown?.['meetupReliability'] ?? null).toBeNull();
  });
});
