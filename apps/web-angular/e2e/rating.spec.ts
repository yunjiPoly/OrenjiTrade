import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';
import { coordinateLeaks, watchCoordinates } from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Ratings and references (Phase 7) against the real local stack. Two fresh collectors exchange
 * three messages each, which qualifies their conversation; the first rates the second from the
 * profile (overall + a criterion + comment), the summary updates, the rating is edited within its
 * window, and a reference is written. An unrelated collector sees no rate action and the API
 * refuses their rating (403 RATING_NOT_ELIGIBLE). Every account is fictional and fresh.
 */

interface Eligibility {
  eligible: boolean;
  interactions: { id: string; kind: string; alreadyRated: boolean }[];
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

async function send(
  api: APIRequestContext,
  from: OnboardedCollector,
  conversationId: string,
  body: string,
): Promise<void> {
  const response = await api.post(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
    headers: authHeader(from.idToken),
    data: { kind: 'TEXT', body },
  });
  expect(response.ok(), `message from ${from.handle}`).toBeTruthy();
}

async function eligibility(
  api: APIRequestContext,
  from: OnboardedCollector,
  to: OnboardedCollector,
): Promise<Eligibility> {
  const response = await api.get(`${API_URL}/api/v1/ratings/eligibility`, {
    headers: authHeader(from.idToken),
    params: { userId: to.id },
  });
  expect(response.ok(), 'GET /ratings/eligibility').toBeTruthy();
  return response.json();
}

/** A conversation where both collectors sent three messages (CONVERSATION_QUALIFIED). */
async function qualifiedConversation(
  api: APIRequestContext,
  a: OnboardedCollector,
  b: OnboardedCollector,
): Promise<string> {
  const started = await api.post(`${API_URL}/api/v1/conversations`, {
    headers: authHeader(a.idToken),
    data: { recipientId: b.id },
  });
  expect(started.ok(), 'POST /conversations').toBeTruthy();
  const id = ((await started.json()) as { id: string }).id;
  const lines = [
    [a, 'Hi! Is the Azure-Eyes still available?'],
    [b, 'Yes, near mint, 20 CAD.'],
    [a, 'Great, could we meet near Place des Arts?'],
    [b, 'Saturday afternoon works for me.'],
    [a, 'Perfect, see you at 2 pm.'],
    [b, 'Deal, bring a sleeve!'],
  ] as const;
  for (const [from, text] of lines) {
    await send(api, from, id, `${text} (${suffix()})`);
  }
  // The qualification is recorded by an event listener after the commit.
  await expect
    .poll(async () => (await eligibility(api, a, b)).eligible, {
      message: 'the qualified conversation makes the pair eligible',
      timeout: 20_000,
    })
    .toBe(true);
  return id;
}

test.describe('ratings and references', () => {
  requireStack();

  test('an eligible collector rates, edits and writes a reference; an unrelated one cannot', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const rater = await createOnboardedCollector(request, 'rater', {
      displayName: `Rae Rater ${suffix()}`,
    });
    const ratee = await createOnboardedCollector(request, 'ratee', {
      displayName: `Remi Ratee ${suffix()}`,
    });
    const stranger = await createOnboardedCollector(request, 'stranger', {
      displayName: `Stan Stranger ${suffix()}`,
    });
    const conversationId = await qualifiedConversation(request, rater, ratee);
    const interaction = (await eligibility(request, rater, ratee)).interactions[0];
    expect(interaction).toMatchObject({ kind: 'CONVERSATION_QUALIFIED', alreadyRated: false });

    // --- The conversation menu offers "Rate" ----------------------------------------------
    const page = await openSignedIn(browser, rater);
    const watcher = watchCoordinates(page);
    await page.goto(`/messages/${conversationId}`);
    const thread = page.getByRole('region', { name: `Conversation with ${ratee.displayName}` });
    await thread
      .getByRole('button', { name: `Conversation options for ${ratee.displayName}` })
      .click();
    await expect(page.getByRole('menuitem', { name: `Rate ${ratee.displayName}` })).toBeVisible();
    await page.keyboard.press('Escape');

    // --- Rate from the profile -------------------------------------------------------------
    await page.goto(`/collectors/${ratee.handle}`);
    const section = page.getByRole('region', { name: 'Ratings & references' });
    await expect(section).toContainText('No ratings yet');
    await expect(page.getByTestId('profile-rating')).toHaveText('No ratings yet.');
    await section.getByRole('button', { name: 'Rate this collector' }).click();

    const dialog = page.getByRole('dialog', { name: `Rate ${ratee.displayName}` });
    await expect(dialog).toContainText('Conversation');
    await dialog.getByRole('button', { name: 'Submit rating' }).click();
    await expect(dialog.getByText('Choose an overall score from 1 to 5 stars.')).toBeVisible();
    const overall = dialog.getByRole('radiogroup', { name: 'Overall' });
    await overall.getByRole('radio', { name: '5 stars, Excellent' }).click();
    await expect(overall.getByRole('radio', { name: '5 stars, Excellent' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const communication = dialog.getByRole('radiogroup', { name: 'Communication' });
    await communication.getByRole('radio', { name: '3 stars, Good' }).click();
    // Keyboard: the right arrow raises the score to 4.
    await page.keyboard.press('ArrowRight');
    await expect(communication.getByRole('radio', { name: '4 stars, Great' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const comment = `Friendly, on time and the card was exactly as described (${suffix()}).`;
    await dialog.getByRole('textbox', { name: 'Comment (optional)' }).fill(comment);
    await dialog.getByRole('button', { name: 'Submit rating' }).click();
    await expect(
      page.getByText(`Thanks! Your rating of ${ratee.displayName} is published.`),
    ).toBeVisible();
    await expect(dialog).toBeHidden();

    await expect(section.getByTestId('rating-average')).toHaveText('5.0');
    await expect(section.getByTestId('rating-count')).toHaveText('1 rating');
    await expect(page.getByTestId('profile-rating')).toContainText('5.0');
    const ratings = section.getByRole('list', { name: 'Ratings' });
    const mine = ratings.getByRole('article', { name: `Rating by ${rater.displayName}` });
    await expect(mine).toContainText(comment);
    await expect(mine).toContainText('Communication 4');
    await expect(section.getByRole('button', { name: 'Rate this collector' })).toHaveCount(0);
    await expect(section.getByTestId('rating-hint')).toContainText(
      'You already rated your interactions',
    );

    // --- Edit within the 14-day window -----------------------------------------------------
    await mine.getByRole('button', { name: 'Edit your rating' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit your rating' });
    await expect(
      edit.getByRole('radiogroup', { name: 'Overall' }).getByRole('radio', { name: /^5 stars/ }),
    ).toHaveAttribute('aria-checked', 'true');
    await edit
      .getByRole('radiogroup', { name: 'Overall' })
      .getByRole('radio', { name: '4 stars, Great' })
      .click();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Your rating is updated.')).toBeVisible();
    await expect(section.getByTestId('rating-average')).toHaveText('4.0');
    await expect(page.getByTestId('profile-rating')).toContainText('4.0');

    // --- Write a reference -------------------------------------------------------------------
    await section.getByRole('button', { name: 'Write a reference' }).click();
    const reference = page.getByRole('dialog', {
      name: `Write a reference for ${ratee.displayName}`,
    });
    const referenceText = `Reliable trader, great binders (${suffix()}).`;
    await reference.getByRole('textbox', { name: 'Reference' }).fill(referenceText);
    await reference.getByRole('button', { name: 'Publish reference' }).click();
    await expect(
      page.getByText(`Your reference for ${ratee.displayName} is published.`),
    ).toBeVisible();
    await expect(section.getByRole('list', { name: 'References' })).toContainText(referenceText);
    await expect(section.getByRole('button', { name: 'Write a reference' })).toHaveCount(0);

    // The rated collector was notified (RATING_RECEIVED, never the comment).
    const notified = await request.get(`${API_URL}/api/v1/notifications`, {
      headers: authHeader(ratee.idToken),
      params: { limit: 20 },
    });
    const received = (
      (await notified.json()) as { items: { type: string; body: string }[] }
    ).items.filter((item) => item.type === 'RATING_RECEIVED');
    expect(received).toHaveLength(1);
    expect(received[0].body).not.toContain(comment);

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples), 'lat/lng in a JSON answer').toEqual([]);
    await page.context().close();

    // --- An unrelated collector --------------------------------------------------------------
    const other = await openSignedIn(browser, stranger);
    await other.goto(`/collectors/${ratee.handle}`);
    const theirSection = other.getByRole('region', { name: 'Ratings & references' });
    await expect(theirSection.getByTestId('rating-average')).toHaveText('4.0');
    await expect(theirSection.getByTestId('rating-hint')).toContainText(
      `You can rate ${ratee.displayName} after a completed trade`,
    );
    await expect(theirSection.getByRole('button', { name: 'Rate this collector' })).toHaveCount(0);
    await expect(theirSection.getByRole('button', { name: 'Write a reference' })).toHaveCount(0);
    await other.context().close();

    const refused = await request.post(`${API_URL}/api/v1/ratings`, {
      headers: authHeader(stranger.idToken),
      data: { interactionId: interaction.id, overall: 1 },
    });
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { errorCode: string }).errorCode).toBe('RATING_NOT_ELIGIBLE');
    expect((await eligibility(request, stranger, ratee)).eligible).toBe(false);
  });
});
