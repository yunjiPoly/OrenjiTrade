import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiListCopy,
  apiPublicBinder,
  createOnboardedCollector,
  openTab,
  PLACE_LABELS,
  PLACES,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Mobile wishlist and wishlist alerts (stage S2 of the 2026-10-08 product change) against the
 * real, isolated stack with two fresh fictional collectors of Americas (South) (no other mobile
 * spec uses that region, so listings of parallel specs never alert, ADR 0017): Wren adds "Emberfang
 * Fox" through the app (public note, Near Mint only, a price term, one printing chosen in "Which
 * copy"; nothing else); Hal lists the card publicly through the API. Wren gets one wishlist alert
 * over the realtime channel (the bell's badge rises without a reload); the alert names Hal's state
 * (never a city, a distance or a position) and opens the card page.
 */

const WISHED_CARD = 'Emberfang Fox';
const WISHED_PRINTING = 'PFT-002';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile wishlist and notifications', () => {
  requireStack();

  test('a wish with the new fields, a listing in the region: one live alert that opens the card', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const wren = await createOnboardedCollector(request, 'wish', `Wren Wisher ${suffix()}`, {
      location: PLACES.montevideo,
      discoverable: true,
    });
    const hal = await createOnboardedCollector(request, 'hold', `Hal Holder ${suffix()}`, {
      location: { ...PLACES.montevideo, city: 'Zqhalcity' },
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
    // With a location: alerts can arrive, no prompt. The visibility switch is explained.
    await expect(wishlist.getByTestId('wishlist-location-prompt')).toHaveCount(0);
    await expect(wishlist.getByTestId('wishlist-visible')).toContainText(
      'Let others see what you want'
    );
    await wishlist.getByRole('button', { name: 'Add a card' }).click();

    // The wish: card autocomplete, then the note, Near Mint only, a term and one printing.
    const editor = screen(page, 'wish-new');
    await editor.getByLabel('Card name or printing code').fill('Emberfang');
    await editor.getByTestId(`suggestion-CARD-${WISHED_PRINTING}`).click();
    await expect(editor.getByTestId('wish-card')).toContainText(WISHED_CARD, { timeout: 30_000 });
    await expect(editor.getByTestId('wish-copy')).toContainText('Any printing');
    // Nothing of the old form.
    for (const removed of [
      'wish-max-price',
      'wish-trade',
      'wish-notes',
      'wish-active',
      'wish-radius',
    ]) {
      await expect(editor.getByTestId(removed)).toHaveCount(0);
    }
    await editor.getByLabel('Public note (optional)').fill('Fictional mobile E2E wish.');
    await editor.getByTestId('wish-near-mint').click();
    await editor.getByTestId('wish-copy').click();
    await page.getByTestId(`wish-copy-option-${printingId}`).click();
    await expect(editor.getByTestId('wish-term-85')).toContainText(/85% TCG ≈ 0\.\d\d CAD/);
    await editor.getByTestId('wish-term-85').click();
    await editor.getByRole('button', { name: 'Add to wishlist' }).click();
    await expect(snackbar(page)).toContainText(`${WISHED_CARD} is on your wishlist`);

    const wishes = await request.get(`${API_URL}/api/v1/wishlist`, {
      headers: { Authorization: `Bearer ${wren.idToken}` },
    });
    const wish = ((await wishes.json()) as Record<string, unknown>[])[0] as {
      id: string;
      note: string;
      nearMintOnly: boolean;
      priceTerm: { label: string };
      printing: { id: string };
    };
    expect(wish).toMatchObject({
      note: 'Fictional mobile E2E wish.',
      nearMintOnly: true,
      priceTerm: { label: '85% TCG' },
      printing: { id: printingId },
    });
    for (const removed of [
      'maxPrice',
      'tradePreference',
      'notes',
      'active',
      'matchCount',
      'radiusKm',
    ]) {
      expect(wish).not.toHaveProperty(removed);
    }
    await expect(wishlist.getByTestId(`wish-${wish.id}`)).toBeVisible();
    await expect(wishlist.getByTestId(`wish-copy-${wish.id}`)).toContainText(
      `${WISHED_PRINTING} · Common`
    );
    await expect(wishlist.getByTestId(`wish-note-${wish.id}`)).toContainText(
      'Fictional mobile E2E wish.'
    );
    await expect(wishlist.getByTestId(`wish-chips-${wish.id}`)).toContainText('Near Mint only');
    await expect(wishlist.getByTestId(`wish-chips-${wish.id}`)).toContainText('85% TCG');
    await expect(wishlist.getByText(/match/i)).toHaveCount(0);
    const bell = page.getByTestId('notification-bell-wishlist');
    await expect(bell).toHaveAttribute('aria-label', 'Notifications');

    // Hal lists the card (Near Mint) in the region: one alert reaches Wren live.
    await apiListCopy(request, hal, binderId, printingId, 12);
    await expect(page.getByTestId('notification-bell-wishlist-badge')).toHaveText('1', {
      timeout: 60_000,
    });

    // The notification centre, then the card page.
    await bell.click();
    const centre = screen(page, 'notifications');
    const entry = centre.getByRole('link', { name: new RegExp(`Wishlist alert: ${WISHED_CARD}`) });
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await expect(entry).toContainText(
      `was just listed by @${hal.handle} in ${PLACE_LABELS.montevideo}.`
    );
    await expect(entry).not.toContainText('Zqhalcity');
    await expect(entry).not.toContainText(/\bkm\b/);
    await expect(centre.getByTestId('notification-unread-dot')).toHaveCount(1);
    await entry.click();
    await expect(screen(page, 'card').getByTestId('card-name')).toHaveText(WISHED_CARD, {
      timeout: 30_000,
    });
  });
});
