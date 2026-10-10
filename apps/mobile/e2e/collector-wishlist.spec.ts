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
 * "Looking for" on a collector's profile (stage M7, the web's `app-collector-wishlist` on
 * `GET /collectors/{handle}/wishlist`): the public wishlist of a collector who enabled "Let others
 * see what you want" (card, which copy, public note, Near Mint only and price term; never radii
 * or notes); nothing for a collector who keeps it private (404).
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
    const section = profile.getByTestId('collector-wishlist');
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section).toContainText('1 card Open Wisher is looking for');
    const wish = section.getByTestId(`collector-wish-${cardId}`);
    await expect(wish).toContainText(cardName);
    await expect(wish).toContainText('Any printing');
    await expect(wish).toContainText('Sleeved copies welcome.');
    await expect(wish).toContainText('Near Mint only');
    await expect(wish).toContainText('90% TCG');
    await expect(section).not.toContainText('km');

    // The wish opens the card.
    await wish.click();
    await expect(screen(page, 'card').getByTestId('card-name')).toHaveText(cardName, {
      timeout: 30_000,
    });
    await page.goBack();

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
    await expect(other.getByTestId('collector-about')).toBeVisible();
    await expect(other.getByTestId('collector-wishlist')).toHaveCount(0);
  });
});
