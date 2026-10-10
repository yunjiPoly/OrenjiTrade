import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiListCopy,
  apiPublicBinder,
  cardOfPrinting,
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
 * (never a city, a distance or a position) and opens the card page. A second test covers the two
 * places where a printing could be picked for the collector (review fix 3): a typed printing code
 * shared by a 1st Edition and an Unlimited printing starts the wish on "Any printing" (a code only
 * one printing has still preselects it), and the alert for an "Any printing" wish opens the card
 * screen on "Any printing" (`?printing=any`: no selected printing, no price, nothing checked).
 */

const WISHED_CARD = 'Emberfang Fox';
const WISHED_PRINTING = 'PFT-002';
/** A card whose printing code is shared by a 1st Edition and an Unlimited printing. */
const SHARED_CODE_CARD = 'Mirrorblade Knight';
const SHARED_CODE = 'SHV-EN003';
/** A printing code only one printing has. */
const SINGLE_CODE_CARD = 'Azure-Eyes Sky Dragon';
const SINGLE_CODE = 'AZR-EN001';

interface CatalogPrinting {
  id: string;
  printingCode: string;
  edition: string;
}

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
  test('a typed printing code and an "Any printing" alert never pick a printing nobody chose', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const wren = await createOnboardedCollector(request, 'wishany', `Ana Anyprint ${suffix()}`, {
      location: PLACES.montevideo,
      discoverable: true,
    });
    const hal = await createOnboardedCollector(request, 'holdunl', `Uli Unlimited ${suffix()}`, {
      location: PLACES.montevideo,
      discoverable: true,
    });
    const binderId = await apiPublicBinder(request, hal, `Mobile any-printing binder ${suffix()}`);
    // The two printings that share the code: the catalog lists the 1st Edition first.
    const { cardId } = await cardOfPrinting(request, hal.idToken, SHARED_CODE);
    const card = await request.get(`${API_URL}/api/v1/cards/${cardId}`, {
      headers: { Authorization: `Bearer ${hal.idToken}` },
    });
    const sharing = ((await card.json()) as { printings: CatalogPrinting[] }).printings.filter(
      (printing) => printing.printingCode === SHARED_CODE
    );
    expect(sharing.map((printing) => printing.edition).sort()).toEqual([
      'FIRST_EDITION',
      'UNLIMITED',
    ]);
    const unlimited = sharing.find((printing) => printing.edition === 'UNLIMITED')!;

    await signInThroughUi(page, wren.email, wren.password);
    await openTab(page, 'Wishlist');
    const wishlist = screen(page, 'wishlist');
    await expect(wishlist.getByTestId('wishlist-empty')).toContainText('Your wishlist is empty', {
      timeout: 30_000,
    });
    await wishlist.getByRole('button', { name: 'Add a card' }).click();

    // A code only one printing has preselects that printing (written out in full).
    const editor = screen(page, 'wish-new');
    const search = editor.getByLabel('Card name or printing code');
    await search.fill(SINGLE_CODE);
    await editor.getByTestId(`suggestion-PRINTING-${SINGLE_CODE}`).click();
    await expect(editor.getByTestId('wish-card')).toContainText(SINGLE_CODE_CARD, {
      timeout: 30_000,
    });
    await expect(editor.getByTestId('wish-copy')).toContainText(SINGLE_CODE);
    await expect(editor.getByTestId('wish-copy-hint')).toContainText(
      `Only ${SINGLE_CODE} · Ultra Rare · Azure Dawn · 1st Edition · English`
    );
    await editor.getByTestId('wish-change-card').click();

    // A typed code that two printings share: one suggestion for the code, and the wish starts on
    // "Any printing". Neither printing is picked; "Which copy" names both in full.
    await search.fill(SHARED_CODE);
    const suggestion = editor.getByTestId(`suggestion-PRINTING-${SHARED_CODE}`);
    await expect(suggestion).toHaveCount(1);
    await suggestion.click();
    await expect(editor.getByTestId('wish-card')).toContainText(SHARED_CODE_CARD, {
      timeout: 30_000,
    });
    await expect(editor.getByTestId('wish-copy')).toContainText('Any printing');
    await expect(editor.getByTestId('wish-copy')).not.toContainText(SHARED_CODE);
    await expect(editor.getByTestId('wish-copy-hint')).toHaveText(
      `Any printing of the card. 2 printings share the code ${SHARED_CODE}: choose one in “Which copy” for that copy only.`
    );
    await editor.getByTestId('wish-copy').click();
    for (const printing of sharing) {
      await expect(page.getByTestId(`wish-copy-option-${printing.id}`)).toContainText(
        printing.edition === 'UNLIMITED' ? 'Unlimited' : '1st Edition'
      );
    }
    await page.getByTestId('wish-copy-option-').click();
    await editor.getByRole('button', { name: 'Add to wishlist' }).click();
    await expect(snackbar(page)).toContainText(`${SHARED_CODE_CARD} is on your wishlist`);
    const wishes = await request.get(`${API_URL}/api/v1/wishlist`, {
      headers: { Authorization: `Bearer ${wren.idToken}` },
    });
    const wish = (
      (await wishes.json()) as { id: string; printing?: unknown; rarity?: unknown }[]
    )[0];
    expect(wish?.printing ?? null, 'the wish is for any printing').toBeNull();
    expect(wish?.rarity ?? null).toBeNull();
    await expect(wishlist.getByTestId(`wish-copy-${wish!.id}`)).toHaveText('Any printing');

    // Hal lists the Unlimited copy: the alert for the "Any printing" wish opens the card screen
    // on "Any printing". No printing is selected for Wren, none is checked, no price is shown
    // (the catalog's first printing is the 1st Edition, which nobody listed).
    await apiListCopy(request, hal, binderId, unlimited.id, 12.5);
    await expect(page.getByTestId('notification-bell-wishlist-badge')).toHaveText('1', {
      timeout: 60_000,
    });
    await page.getByTestId('notification-bell-wishlist').click();
    const centre = screen(page, 'notifications');
    const entry = centre.getByRole('link', {
      name: new RegExp(`Wishlist alert: ${SHARED_CODE_CARD}`),
    });
    await expect(entry).toContainText(
      `${SHARED_CODE_CARD} ${SHARED_CODE} Super Rare was just listed by @${hal.handle} in ${PLACE_LABELS.montevideo}.`,
      { timeout: 30_000 }
    );
    await entry.click();
    const cardScreen = screen(page, 'card');
    await expect(cardScreen.getByTestId('card-name')).toHaveText(SHARED_CODE_CARD, {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/[?&]printing=any(&|$)/);
    await expect(cardScreen.getByTestId('card-selected-any')).toContainText('Any printing');
    await expect(cardScreen.getByTestId('card-selected-any')).toContainText(
      '2 printings of this card: any of them fits.'
    );
    await expect(cardScreen.getByTestId('card-selected-printing')).toHaveCount(0);
    await expect(cardScreen.getByTestId('card-price')).toHaveCount(0);
    for (const printing of sharing) {
      await expect(cardScreen.getByTestId(`printing-${printing.id}`)).toHaveAttribute(
        'aria-checked',
        'false'
      );
    }
    // Choosing a printing replaces "any": that printing, and only then, is selected.
    await cardScreen.getByTestId(`printing-${unlimited.id}`).click();
    await expect(cardScreen.getByTestId('card-selected-printing')).toBeVisible();
    await expect(cardScreen.getByTestId('card-selected-any')).toHaveCount(0);
    await expect(cardScreen.getByTestId(`printing-${unlimited.id}`)).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
