import { expect, test } from './support/fixtures';
import {
  apiAddWish,
  apiUpdatePrivacy,
  cardOfPrinting,
  createOnboardedCollector,
  openInApp,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/**
 * "Looking for" on a collector's profile (stage M7, redrawn by stage R6 on
 * `GET /collectors/{handle}/wishlist`): the public wishes of a collector who enabled "Let others
 * see what you want" (picture, name, terms, "I have it"; never radii or notes); "No public wishes."
 * for a collector who keeps them private (404), as for one who has none.
 */
test.describe('mobile collector wishlist', () => {
  requireStack();

  test('a profile shows the public wishlist of a collector who enabled it, and nothing otherwise', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const open = await createOnboardedCollector(request, 'wopen', 'Open Wisher');
    const closed = await createOnboardedCollector(request, 'wclosed', 'Closed Wisher');
    const viewer = await createOnboardedCollector(request, 'wview', 'Mobile Viewer');
    const { cardId, cardName } = await cardOfPrinting(request, open.idToken, 'PFT-002');
    await apiAddWish(request, open, cardId, {
      note: 'Sleeved copies welcome.',
      priceTerm: '90% TCG',
      // A member of the old model: ignored, never stored.
      maxPrice: 30,
    });
    await apiAddWish(request, closed, cardId);
    await apiUpdatePrivacy(request, open.idToken, { wishlistVisible: true });
    await signInThroughUi(page, viewer.email, viewer.password);

    // The open profile: "Looking for" with the card, the public note and the chips.
    const shown = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/collectors/${open.handle}/wishlist`) &&
        response.status() === 200
    );
    await openInApp(page, `/collectors/${open.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText('Open Wisher', {
      timeout: 30_000,
    });
    // The public entry carries the card, which copy, the note and the chips; never a price
    // limit (removed in stage S2) or a radius (ADR 0017).
    const body = (await (await shown).json()) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]).not.toHaveProperty('maxPrice');
    expect(body[0]).not.toHaveProperty('radiusKm');
    // Looking for (stage R6): the picture, the name and the terms, with "I have it".
    const section = profile.getByTestId('profile-wishes');
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section).toContainText(cardName);
    await expect(section).toContainText('Any printing · NM only · 90% TCG');
    await expect(section).not.toContainText('km');
    await expect(profile.getByTestId(`profile-have-${cardId}`)).toBeVisible();

    // The closed profile: the API answers 404 and no section appears.
    const hidden = page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/collectors/${closed.handle}/wishlist`)
    );
    await openInApp(page, `/collectors/${closed.handle}`);
    const other = screen(page, 'collector');
    await expect(other.getByTestId('collector-name')).toHaveText('Closed Wisher', {
      timeout: 30_000,
    });
    expect((await hidden).status()).toBe(404);
    // A hidden wishlist reads like an empty one: nothing says why.
    await expect(other.getByTestId('profile-wishes-empty')).toHaveText('No public wishes.');
    await expect(other.getByTestId(`profile-have-${cardId}`)).toHaveCount(0);
  });
});
