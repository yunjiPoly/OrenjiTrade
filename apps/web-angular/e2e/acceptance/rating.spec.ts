import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, expect, signIn, test } from './support/fixtures';

/**
 * Acceptance — rating (spec § 50): without an interaction the profile offers no rating; once the
 * two collectors had an eligible interaction (a qualified conversation: three messages each),
 * rating becomes available and the rating is published on the profile; an unrelated collector
 * still cannot rate (no action in the UI, 403 RATING_NOT_ELIGIBLE from the API).
 */
test.describe('acceptance: rating', () => {
  requireStack();

  test('an eligible interaction makes rating available; an unrelated collector cannot rate', async ({
    page,
    api,
    actors,
  }) => {
    test.setTimeout(150_000);
    const rater = await api.collector('acc-rater', { displayName: `Rae Rater ${suffix()}` });
    const ratee = await api.collector('acc-ratee', { displayName: `Remi Ratee ${suffix()}` });
    const stranger = await api.collector('acc-rstranger', {
      displayName: `Stan Stranger ${suffix()}`,
    });

    // Before any interaction: no rating action.
    await signIn(page, rater);
    await page.goto(`/collectors/${ratee.handle}`);
    const section = page.getByRole('region', { name: 'Ratings & references' });
    await expect(section).toContainText('No ratings yet');
    await expect(section.getByTestId('rating-hint')).toContainText(
      `You can rate ${ratee.displayName} after a completed trade`,
    );
    await expect(section.getByRole('button', { name: 'Rate this collector' })).toHaveCount(0);

    // The eligible interaction: a qualified conversation.
    await api.qualifiedConversation(rater, ratee);
    const interaction = (await api.ratingEligibility(rater, ratee)).interactions[0];
    expect(interaction.kind).toBe('CONVERSATION_QUALIFIED');

    // Rating is now available and published.
    await page.reload();
    await section.getByRole('button', { name: 'Rate this collector' }).click();
    const dialog = await dialogReady(
      page.getByRole('dialog', { name: `Rate ${ratee.displayName}` }),
    );
    await expect(dialog).toContainText('Conversation');
    await dialog.getByRole('button', { name: 'Submit rating' }).click();
    await expect(dialog.getByText('Choose an overall score from 1 to 5 stars.')).toBeVisible();
    await dialog
      .getByRole('radiogroup', { name: 'Overall' })
      .getByRole('radio', { name: '5 stars, Excellent' })
      .click();
    const comment = `Friendly and on time (${suffix()}).`;
    await dialog.getByRole('textbox', { name: 'Comment (optional)' }).fill(comment);
    await dialog.getByRole('button', { name: 'Submit rating' }).click();
    await expect(
      page.getByText(`Thanks! Your rating of ${ratee.displayName} is published.`),
    ).toBeVisible();
    await expect(section.getByTestId('rating-average')).toHaveText('5.0');
    await expect(section.getByTestId('rating-count')).toHaveText('1 rating');
    await expect(
      section
        .getByRole('list', { name: 'Ratings' })
        .getByRole('article', { name: `Rating by ${rater.displayName}` }),
    ).toContainText(comment);

    // An unrelated collector sees the rating but cannot rate.
    const other = await actors.open(stranger);
    await other.goto(`/collectors/${ratee.handle}`);
    const theirs = other.getByRole('region', { name: 'Ratings & references' });
    await expect(theirs.getByTestId('rating-average')).toHaveText('5.0');
    await expect(theirs.getByRole('button', { name: 'Rate this collector' })).toHaveCount(0);
    const refused = await api.call<{ errorCode: string }>('POST', '/api/v1/ratings', {
      token: stranger.idToken,
      data: { interactionId: interaction.id, overall: 1 },
    });
    expect(refused.status).toBe(403);
    expect(refused.body.errorCode).toBe('RATING_NOT_ELIGIBLE');
    expect((await api.ratingEligibility(stranger, ratee)).eligible).toBe(false);
  });
});
