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

/** The state of the run's collectors (UY-MO), as a wishlist alert's row names it (stage R9). */
const PROVINCE = 'Montevideo';

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
    // Search › Wishlist (the old Wishlist tab, stage R5).
    await openTab(page, 'Search');
    const wishlist = screen(page, 'search');
    await wishlist.getByRole('tab', { name: /^Wishlist/ }).click({ timeout: 30_000 });
    await expect(wishlist.getByTestId('wishlist-empty')).toContainText('No wishes yet', {
      timeout: 30_000,
    });
    // With a location: alerts can arrive, no prompt; the alert switch is on (the default).
    await expect(wishlist.getByTestId('wishlist-location-prompt')).toHaveCount(0);
    await expect(wishlist.getByRole('switch', { name: 'Wishlist alerts' })).toBeChecked({
      timeout: 30_000,
    });
    // "Let others see what you want" lives in Settings › Privacy since stage R5.
    await expect(wishlist.getByText('Let others see what you want')).toHaveCount(0);
    await wishlist.getByRole('button', { name: 'Add a wish' }).click();

    // The wish (stage R14): "Add a wish" opens Search's card search; the card picked opens the
    // form, then the note, Near Mint only, a price chip and one printing.
    const finder = screen(page, 'wish-search');
    await expect(finder.getByText('Which card are you looking for?', { exact: false })).toBeVisible(
      {
        timeout: 30_000,
      }
    );
    await finder.getByTestId('search-input').fill('Emberfang');
    const wished = await cardOfPrinting(request, wren.idToken, WISHED_PRINTING);
    await finder.getByTestId(`search-result-${wished.cardId}`).click({ timeout: 30_000 });
    const editor = screen(page, 'wish-new');
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
    await expect(wishlist.getByTestId(`wish-${wish.id}-terms`)).toHaveText(
      `${WISHED_PRINTING} · NM only · 85% TCG`
    );
    // ("None yet" or "Available": other specs list the same seed card in this region.)
    await expect(wishlist.getByText(/match/i)).toHaveCount(0);
    await expect(wishlist.getByRole('tab', { name: 'Wishlist, 1' })).toBeVisible();
    const bell = page.getByTestId('notification-bell-search');
    await expect(bell).toHaveAttribute('aria-label', 'Notifications');

    // Hal lists the card (Near Mint) in the region: one alert reaches Wren live, and the wish
    // reads "Available" (it opens Who has this card on the wished printing).
    await apiListCopy(request, hal, binderId, printingId, 12);
    // Stage R9: an orange dot, and the bell says how many are new.
    await expect(page.getByTestId('notification-bell-search-dot')).toBeVisible({
      timeout: 60_000,
    });
    await expect(bell).toHaveAttribute('aria-label', 'Notifications, 1 new');
    const available = wishlist.getByTestId(`wish-${wish.id}-available`);
    await expect(available).toHaveText('Available', { timeout: 30_000 });
    await available.click();
    await expect(page).toHaveURL(new RegExp(`/cards/[\\w-]+\\?printing=${printingId}`), {
      timeout: 30_000,
    });
    await expect(
      screen(page, 'card').getByTestId(`holders-group-${PLACES.montevideo.subdivisionCode}`)
    ).toHaveText('Montevideo · your province', { timeout: 30_000 });
    await page.goBack();

    // Notifications (stage R9): the alert under New names the province and the lister, then
    // opens the card page.
    await bell.click();
    const centre = screen(page, 'notifications');
    await expect(centre.getByRole('heading', { name: 'New' })).toBeVisible({ timeout: 30_000 });
    const entry = centre.getByRole('link', {
      name: new RegExp(`^${WISHED_CARD} from your wishlist was listed in ${PROVINCE}\\.`),
    });
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await expect(entry).toContainText(`from your wishlist was listed in ${PROVINCE}`);
    await expect(entry).toContainText(hal.handle);
    await expect(entry).not.toContainText(PLACE_LABELS.montevideo);
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
    // The shared code is a Yu-Gi-Oh! card: a binder holds the cards of one game (stage G).
    const binderId = await apiPublicBinder(
      request,
      hal,
      `Mobile any-printing binder ${suffix()}`,
      'yugioh'
    );
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
    await openTab(page, 'Search');
    const wishlist = screen(page, 'search');
    await wishlist.getByRole('tab', { name: /^Wishlist/ }).click({ timeout: 30_000 });
    await expect(wishlist.getByTestId('wishlist-empty')).toContainText('No wishes yet', {
      timeout: 30_000,
    });
    // Stage G: Ana browses Pokémon (her profile game); the codes are Yu-Gi-Oh! cards, and "Add a
    // wish" offers the browsed game's cards only (review fix 1, U1): she switches to Yu-Gi-Oh!.
    await wishlist.getByRole('button', { name: 'Game: Pokémon. Change game' }).click();
    await page.getByRole('radio', { name: 'Yu-Gi-Oh!' }).click();
    await expect(
      wishlist.getByRole('button', { name: 'Game: Yu-Gi-Oh!. Change game' })
    ).toBeVisible();
    await wishlist.getByRole('button', { name: 'Add a wish' }).click();

    // A code only one printing has preselects that printing (written out in full).
    const finder = screen(page, 'wish-search');
    const search = finder.getByTestId('search-input');
    await search.fill(SINGLE_CODE);
    const single = await cardOfPrinting(request, wren.idToken, SINGLE_CODE);
    await finder.getByTestId(`search-result-${single.cardId}`).click({ timeout: 30_000 });
    const editor = screen(page, 'wish-new');
    await expect(editor.getByTestId('wish-card')).toContainText(SINGLE_CODE_CARD, {
      timeout: 30_000,
    });
    await expect(editor.getByTestId('wish-copy')).toContainText(SINGLE_CODE);
    await expect(editor.getByTestId('wish-copy-hint')).toContainText(
      `Only ${SINGLE_CODE} · Ultra Rare · Azure Dawn · 1st Edition · English`
    );
    // "Change" goes back to the card search, which kept the text.
    await editor.getByTestId('wish-change-card').click();
    await expect(search).toHaveValue(SINGLE_CODE, { timeout: 30_000 });

    // A typed code that two printings share: one card for the code, and the wish starts on
    // "Any printing". Neither printing is picked; "Which copy" names both in full.
    await search.fill(SHARED_CODE);
    const found = finder.getByTestId(`search-result-${cardId}`);
    await expect(found).toHaveCount(1, { timeout: 30_000 });
    await found.click();
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
    // On Yu-Gi-Oh!, the game she browses now, the Wishlist shows it.
    await expect(wishlist.getByTestId(`wish-${wish!.id}-terms`)).toHaveText('Any printing', {
      timeout: 30_000,
    });

    // Hal lists the Unlimited copy: the alert for the "Any printing" wish opens the card screen
    // on "Any printing". No printing is selected for Wren, none is checked, no price is shown
    // (the catalog's first printing is the 1st Edition, which nobody listed).
    await apiListCopy(request, hal, binderId, unlimited.id, 12.5);
    await expect(page.getByTestId('notification-bell-search-dot')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId('notification-bell-search').click();
    const centre = screen(page, 'notifications');
    const entry = centre.getByRole('link', {
      name: new RegExp(`^${SHARED_CODE_CARD} from your wishlist was listed in ${PROVINCE}\\.`),
    });
    await expect(entry).toContainText(`${hal.handle} · $12.50`, { timeout: 30_000 });
    await entry.click();
    const cardScreen = screen(page, 'card');
    await expect(cardScreen.getByTestId('card-name')).toHaveText(SHARED_CODE_CARD, {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/[?&]printing=any(&|$)/);
    // Who has this card on "Any printing": no printing is picked for Wren; the Unlimited copy is
    // one of the rows, and the sheet lets her choose one printing.
    await expect(cardScreen.getByTestId('card-printing')).toContainText('Any printing');
    await expect(cardScreen.getByTestId('holders-group-UY-MO')).toBeVisible({ timeout: 30_000 });
    await cardScreen.getByTestId('card-printing').click();
    await page.getByTestId(`card-printing-${unlimited.id}`).click();
    await expect(cardScreen.getByTestId('card-printing')).toContainText(SHARED_CODE);
  });
});
