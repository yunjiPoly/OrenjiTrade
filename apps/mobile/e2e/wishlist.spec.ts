import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiListCopy,
  apiPublicBinder,
  createOnboardedCollector,
  nearArea,
  openTab,
  printingIdOf,
  randomRuralArea,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Mobile Phase 6 (wishlist, matching, notifications) against the real, isolated stack with two
 * fresh fictional collectors around a random rural point of Québec (no other spec uses it, so
 * listings of parallel specs never match): Wren adds "Emberfang Fox" to her wishlist through the
 * app; Hal, about 1.5 km away, lists the card publicly through the API. The matcher notifies
 * Wren over the realtime channel: the bell's badge and the wish's match count rise without a
 * reload; the notification opens the wish's matches (Hal's approximate place and distance
 * bucket, never a coordinate), and Message opens a conversation with Hal.
 */

const WISHED_CARD = 'Emberfang Fox';
const WISHED_PRINTING = 'PFT-002';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile wishlist and notifications', () => {
  requireStack();

  test('a wish, a listing nearby: live notification, deep link to the matches, message', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const area = randomRuralArea();
    const wren = await createOnboardedCollector(request, 'wish', `Wren Wisher ${suffix()}`, {
      area: { ...area, radiusKm: 5 },
      discoverable: true,
    });
    const hal = await createOnboardedCollector(request, 'hold', `Hal Holder ${suffix()}`, {
      area: { ...nearArea(area), radiusKm: 5 },
      discoverable: true,
    });
    const binderId = await apiPublicBinder(request, hal, `Mobile wish binder ${suffix()}`);
    const printingId = await printingIdOf(request, hal.idToken, WISHED_PRINTING);

    await signInThroughUi(page, wren.email, wren.password);
    await openTab(page, 'Wishlist');
    const wishlist = screen(page, 'wishlist');
    await expect(wishlist.getByTestId('wishlist-empty')).toContainText('Your wishlist is empty', {
      timeout: 30_000,
    });
    // Discoverable with a trading area: matches can arrive, no hint.
    await expect(wishlist.getByTestId('match-readiness')).toHaveCount(0);
    await wishlist.getByRole('button', { name: 'Add a card' }).click();

    // The wish: card autocomplete, then the criteria.
    const editor = screen(page, 'wish-new');
    await editor.getByLabel('Card name or printing code').fill('Emberfang');
    await editor.getByTestId(`suggestion-CARD-${WISHED_PRINTING}`).click();
    await expect(editor.getByTestId('wish-card')).toContainText(WISHED_CARD, { timeout: 30_000 });
    await expect(editor.getByTestId('wish-printing')).toContainText('Any printing');
    await editor.getByTestId('wish-condition').click();
    await page.getByTestId('wish-condition-option-LIGHTLY_PLAYED').click();
    await editor.getByLabel('Maximum price').fill('25');
    // The FREE plan caps the radius at 25 km; 10 km keeps the match local.
    await expect(editor.getByTestId('wish-radius-value')).toHaveText('25 km');
    await expect(editor.getByTestId('wish-radius-increase')).toBeDisabled();
    for (let step = 0; step < 3; step++) {
      await editor.getByTestId('wish-radius-decrease').click();
    }
    await expect(editor.getByTestId('wish-radius-value')).toHaveText('10 km');
    await editor.getByLabel('Private notes').fill('Fictional mobile E2E wish.');
    await editor.getByRole('button', { name: 'Add to wishlist' }).click();
    await expect(snackbar(page)).toContainText(`${WISHED_CARD} is on your wishlist`);

    const wishes = await request.get(`${API_URL}/api/v1/wishlist`, {
      headers: { Authorization: `Bearer ${wren.idToken}` },
    });
    const wish = ((await wishes.json()) as { id: string; radiusKm: number; maxPrice: number }[])[0];
    expect(wish?.radiusKm).toBe(10);
    expect(wish?.maxPrice).toBe(25);
    const card = wishlist.getByTestId(`wish-${wish!.id}`);
    await expect(card).toBeVisible();
    await expect(wishlist.getByTestId(`wish-criteria-${wish!.id}`)).toContainText(
      'Lightly Played or better'
    );
    await expect(wishlist.getByTestId(`wish-criteria-${wish!.id}`)).toContainText('Within 10 km');
    await expect(wishlist.getByTestId(`wish-match-count-${wish!.id}`)).toHaveText('No matches yet');
    const bell = page.getByTestId('notification-bell-wishlist');
    await expect(bell).toHaveAttribute('aria-label', 'Notifications');

    // Hal lists the card nearby: the matcher notifies Wren live.
    await apiListCopy(request, hal, binderId, printingId, 12);
    await expect(page.getByTestId('notification-bell-wishlist-badge')).toHaveText('1', {
      timeout: 60_000,
    });
    await expect(wishlist.getByTestId(`wish-match-count-${wish!.id}`)).toHaveText('1 match', {
      timeout: 30_000,
    });

    // The notification centre, then the deep link to the matches.
    await bell.click();
    const centre = screen(page, 'notifications');
    const entry = centre.getByRole('link', { name: new RegExp(`Wishlist match: ${WISHED_CARD}`) });
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await expect(centre.getByTestId('notification-unread-dot')).toHaveCount(1);
    await entry.click();
    const matches = screen(page, 'wish-matches');
    await expect(matches.getByTestId('wish-matches-head')).toContainText(
      `Matches for ${WISHED_CARD}`,
      { timeout: 30_000 }
    );
    await expect(matches.getByText(hal.displayName)).toBeVisible();
    await expect(matches.getByTestId('match-distance')).toHaveText(/km away$/);
    await expect(matches.getByTestId('match-price')).toHaveText(/12\.00/);
    for (const src of await matches
      .locator('img')
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src))) {
      expect(src.startsWith(`${API_URL}/api/v1/public/`), src).toBe(true);
    }

    // Message Hal from the match.
    await matches.getByRole('button', { name: 'Message' }).click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByTestId('conversation-profile')).toContainText(hal.displayName, {
      timeout: 30_000,
    });
  });
});
