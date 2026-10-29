import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
  forbidMapProviders,
} from './support/stack';

/**
 * Wishlist and wishlist alerts (stage S2 of the 2026-10-08 product change) against the real local
 * stack, with two collectors: A adds "Emberfang Fox" through the dialog (card autocomplete, public
 * note first, "Near Mint only", one price term with its approximate amount, which copy chosen in
 * the printing picker; nothing else: no price, trade preference, distance or private note), turns
 * "Let others see what you want" on, and checks that the same selection twice is refused inline
 * (409) and that a wish can be removed. B, of the same platform region, lists a Lightly Played
 * copy (no alert: Near Mint only) then a Near Mint one: A gets one wishlist alert live over STOMP
 * that opens the card page with the wish's printing. The public wishlist shows the note and
 * chips. A second test fills a FREE wishlist (20 wishes), shows the prompt to set a location for
 * alerts and the limit dialog on the 21st. A third one covers the two places where a printing
 * could be picked for the collector (review fix 3): a typed printing code that a 1st Edition and
 * an Unlimited printing share starts the wish on "Any printing" (a code only one printing has
 * still preselects it), and the alert for an "Any printing" wish opens the card page on "Any
 * printing" (`?printing=any`: no selected printing, no highlighted row, no price). No JSON
 * response carries a coordinate.
 *
 * A and B live in Uruguay (Americas (South), which no other spec lists cards in), and B's listing
 * is unpublished at the end so later runs never alert about it.
 */

/** Montevideo, Uruguay: Americas (South). */
const SOUTH = { countryCode: 'UY', subdivisionCode: 'UY-MO' };

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

const WISHED_CARD = 'Emberfang Fox';
const WISHED_PRINTING = 'PFT-002';
const OTHER_CARD = 'Ember Wyrmling';
/** A card whose printing code is shared by a 1st Edition and an Unlimited printing. */
const SHARED_CODE_CARD = 'Mirrorblade Knight';
const SHARED_CODE = 'SHV-EN003';
/** A printing code only one printing has. */
const SINGLE_CODE_CARD = 'Azure-Eyes Sky Dragon';
const SINGLE_CODE = 'AZR-EN001';

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubCardImages(page);
  await forbidMapProviders(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

/** Card id of a seed catalog card, by exact name (`GET /cards/suggest`). */
async function cardIdOf(api: APIRequestContext, token: string, name: string): Promise<string> {
  const response = await api.get(`${API_URL}/api/v1/cards/suggest`, {
    headers: authHeader(token),
    params: { q: name, limit: 10 },
  });
  expect(response.ok(), `suggest ${name}`).toBeTruthy();
  const suggestions = (await response.json()) as { kind: string; id: string; name: string }[];
  const card = suggestions.find((entry) => entry.kind === 'CARD' && entry.name === name);
  expect(card, `${name} in the seed catalog`).toBeTruthy();
  return card!.id;
}

interface CatalogPrinting {
  id: string;
  printingCode: string;
  edition: string;
}

/** The printings of a seed catalog card (`GET /cards/{id}`). */
async function printingsOf(
  api: APIRequestContext,
  token: string,
  cardId: string,
): Promise<CatalogPrinting[]> {
  const response = await api.get(`${API_URL}/api/v1/cards/${cardId}`, {
    headers: authHeader(token),
  });
  expect(response.ok(), `GET /cards/${cardId}`).toBeTruthy();
  return ((await response.json()) as { printings: CatalogPrinting[] }).printings;
}

/** B lists one copy of the wished printing in their public binder (publication → alert). */
async function listCopy(
  api: APIRequestContext,
  holder: OnboardedCollector,
  binderId: string,
  printingId: string,
  copy: { condition: string; price: number },
): Promise<void> {
  await apiCreateItem(api, holder.idToken, {
    printingId,
    binderId,
    condition: copy.condition,
    availability: 'TRADE_OR_SALE',
    askingPrice: copy.price,
    currency: 'CAD',
    acceptsOffers: false,
    publicNotes: 'Fictional listing for the wishlist E2E suite.',
  });
}

test.describe('wishlist and notifications', () => {
  requireStack();

  test('A wishes a card with the printing picker, B of the same region lists it: A gets one wishlist alert live', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const a = await createOnboardedCollector(request, 'wisha', {
      location: SOUTH,
      displayName: `Wren Wisher ${suffix()}`,
    });
    const b = await createOnboardedCollector(request, 'wishb', {
      location: SOUTH,
      displayName: `Hal Holder ${suffix()}`,
    });
    expect(b.placeLabel).toBe('Montevideo, Uruguay');
    // Alerts come from listings of discoverable collectors of the same platform region
    // (ADR 0017): B opts in to the map.
    await apiUpdatePrivacy(request, b.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, b.idToken, {
      name: `E2E wish binder ${suffix()}`,
      kind: 'TRADE',
      description: 'Fictional binder for the wishlist E2E suite.',
    });
    await apiPublishBinder(request, b.idToken, binder.id, 'UNTIL_DISABLED');
    const printingId = await printingIdOf(request, b.idToken, WISHED_PRINTING);
    const wishedCardId = await cardIdOf(request, a.idToken, WISHED_CARD);
    const otherCardId = await cardIdOf(request, a.idToken, OTHER_CARD);

    try {
      const page = await openSignedIn(browser, a);
      const watcher = watchCoordinates(page);
      await page.goto('/wishlist');
      // Search › Wishlist (the old /wishlist redirects there; web stage WD): one game at a time,
      // so A browses Pokémon, the game of the wished card.
      await expect(page).toHaveURL(/\/search\?tab=wishlist/);
      await page.goto('/search?tab=wishlist&game=pokemon');
      await expect(page.getByTestId('game-pill')).toContainText('Pokémon');
      await expect(page.getByText('No wishes yet')).toBeVisible();
      // A has a location: no prompt to set one.
      await expect(page.getByTestId('wishlist-location-prompt')).toHaveCount(0);
      const bell = page.getByTestId('notification-bell');
      await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });
      await expect(page.getByTestId('notification-badge')).toHaveCount(0);

      // "Let others see what you want" (privacy setting wishlistVisible, default off).
      const visible = page.getByRole('switch', { name: 'Let others see what you want' });
      await expect(visible).toHaveAttribute('aria-checked', 'false');
      await visible.click();
      await expect(
        page.getByText('Others can now see what you want on your profile.'),
      ).toBeVisible();
      await expect(visible).toHaveAttribute('aria-checked', 'true');

      // Add the wish: autocomplete, then note, Near Mint only, a price term and one printing.
      await page.getByTestId('add-wish').click();
      const dialog = page.getByRole('dialog', { name: 'Add a wish' });
      await dialog.getByRole('combobox', { name: 'Find the card you want' }).fill('Emberfang');
      await page.getByRole('option', { name: new RegExp(`^${WISHED_CARD} Pokémon`) }).click();
      await expect(dialog.getByTestId('wish-card')).toContainText(WISHED_CARD);
      // The autocomplete is gone: the chosen card's name has the focus, not the page.
      await expect(dialog.getByRole('heading', { level: 3, name: WISHED_CARD })).toBeFocused();
      // Nothing of the old form, and "Any printing" checked by default.
      await expect(dialog.getByRole('slider')).toHaveCount(0);
      await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
      await expect(dialog).not.toContainText(
        /Maximum price|I want to|Private notes|Minimum condition/,
      );
      // The 520 dialog of spec 6.6: "Which copy: Any printing", the price chips "No price" first.
      const copy = dialog.getByRole('combobox', { name: 'Which copy' });
      await expect(copy).toContainText('Any printing');
      await expect(dialog.getByRole('radio', { name: 'No price' })).toBeChecked();
      expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(520);
      await dialog
        .getByRole('textbox', { name: 'Public note (optional)' })
        .fill('Fictional E2E wish.');
      await dialog.getByRole('checkbox', { name: 'Near Mint only' }).check();
      // One printing; never an amount or a market price (decision 10).
      await copy.click();
      await page.getByTestId(`printing-option-${printingId}`).click();
      await expect(copy).toContainText(WISHED_PRINTING);
      await expect(dialog).not.toContainText(/≈|\d+\.\d\d (CAD|USD)/);
      await dialog.getByRole('radio', { name: '85% TCG' }).check();
      await dialog.getByRole('radio', { name: '90% TCG' }).check();
      await expect(dialog.getByRole('radio', { name: '85% TCG' })).not.toBeChecked();
      await dialog.getByRole('radio', { name: '85% TCG' }).check();
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${WISHED_CARD} is on your wishlist`)).toBeVisible();

      // The wish's row: its terms on one line (spec 6.6), "None yet" for the region, no count.
      const wish = page.getByTestId('wish-row').filter({ hasText: WISHED_CARD });
      await expect(wish).toHaveCount(1);
      await expect(wish).toContainText(`${WISHED_PRINTING} · NM only · 85% TCG`);
      await expect(wish).toContainText('None yet');
      await expect(wish).not.toContainText(/\bkm\b|Up to|Trade or buy|match/i);
      // Chosen, its holders show in the map's pane ("Pick a wish …" until then).
      await wish.click();
      await expect(page).toHaveURL(/wish=[0-9a-f-]{36}/);
      await expect(page.getByRole('heading', { level: 2, name: WISHED_CARD })).toBeVisible();
      await expect(page.getByText(`Nobody in Americas (South) lists this card yet.`)).toBeVisible();

      // From the card page: "Add to wishlist" adds an "Any printing" wish at once; then the same
      // selection from the dialog is refused inline (409).
      await page.goto(`/cards/${otherCardId}`);
      await expect(page.getByRole('heading', { level: 1, name: OTHER_CARD })).toBeVisible();
      await page.getByTestId('card-wish-toggle').click();
      await expect(page.getByTestId('card-wish-toggle')).toHaveText(/On your wishlist/);
      await expect(page.getByText('On your wishlist').last()).toBeVisible();
      // The same card from the dialog (OTHER_CARD is a Yu-Gi-Oh! card: one game at a time, its
      // wish shows under Yu-Gi-Oh!), then on a phone-sized screen, where the printing picker makes
      // the dialog scroll.
      await page.goto('/search?tab=wishlist&game=yugioh');
      await expect(page.getByTestId('wish-row')).toHaveCount(1);
      await page.getByTestId('add-wish').click();
      await dialog.getByRole('combobox', { name: 'Find the card you want' }).fill(OTHER_CARD);
      await page
        .getByRole('option', { name: new RegExp(`^${OTHER_CARD}`) })
        .first()
        .click();
      await expect(dialog.getByTestId('wish-card')).toContainText(OTHER_CARD);
      await page.setViewportSize({ width: 375, height: 812 });
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-error')).toContainText(
        'already on your wishlist with the same printing or rarity',
      );
      // Next to the buttons, outside the scrolling content: in view whatever the scroll position.
      await expect(dialog.getByTestId('wish-error')).toBeInViewport();
      // The keyboard focus stays in the dialog, on the button that was refused (it used to drop
      // to the page behind while the button was disabled for the save).
      await expect(dialog.getByRole('button', { name: 'Add to wishlist' })).toBeFocused();
      // Escape closes it and gives the focus back to the button that opened it.
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId('add-wish')).toBeFocused();
      await page.setViewportSize({ width: 1280, height: 720 });

      // Remove that second wish: Select, its box, [Remove from wishlist], confirmed (spec 6.6).
      await page.goto('/search?tab=wishlist&game=yugioh');
      await expect(page.getByTestId('wish-row')).toHaveCount(1);
      await page.getByRole('button', { name: 'Select' }).click();
      await page.getByRole('checkbox', { name: `Select ${OTHER_CARD}` }).check();
      await page.getByRole('button', { name: 'Remove from wishlist' }).click();
      const confirm = page.getByRole('dialog', { name: 'Remove this wish?' });
      await expect(confirm).toContainText('You stop getting alerts for it.');
      await confirm.getByRole('button', { name: 'Remove from wishlist' }).click();
      await expect(page.getByText('Removed from your wishlist')).toBeVisible();
      await expect(page.getByTestId('wish-row')).toHaveCount(0);
      // The Pokémon wish is still there, under its own game.
      await expect(page.getByText('No Yu-Gi-Oh! wishes yet')).toBeVisible();
      await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });
      // Marker to prove the page is never reloaded while the alert arrives.
      await page.evaluate(
        () => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true),
      );

      // B lists a Lightly Played copy (the wish wants Near Mint only), then a Near Mint one:
      // exactly one alert, live.
      await listCopy(request, b, binder.id, printingId, { condition: 'LIGHTLY_PLAYED', price: 18 });
      await listCopy(request, b, binder.id, printingId, { condition: 'NEAR_MINT', price: 20 });
      await expect(page.getByTestId('notification-badge')).toBeVisible({ timeout: 20_000 });
      await expect(bell).toHaveAccessibleName('Notifications, 1 new');
      expect(
        await page.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
      ).toBe(true);

      // The bell menu shows the alert; opening it marks it read and opens the card page with the
      // wish's printing.
      await bell.click();
      const menu = page.getByRole('menu', { name: 'Notifications' });
      const entry = menu.getByRole('menuitem', {
        name: new RegExp(`Wishlist alert: ${WISHED_CARD}`),
      });
      await expect(entry).toContainText(
        `${WISHED_CARD} ${WISHED_PRINTING} Common was just listed by @${b.handle} in Montevideo, Uruguay.`,
      );
      await expect(entry).not.toContainText(/\bkm\b|CAD/);
      await entry.click();
      await expect(page).toHaveURL(new RegExp(`/cards/${wishedCardId}\\?printing=${printingId}$`));
      await expect(page.getByRole('heading', { level: 1, name: WISHED_CARD })).toBeVisible();
      await expect(page.getByTestId('notification-badge')).toHaveCount(0);

      // `/notifications`: one alert only (the Lightly Played copy did not fit).
      await page.goto('/notifications');
      await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
      const today = page.getByRole('list', { name: 'Today notifications' });
      await expect(today.getByRole('listitem')).toHaveCount(1);
      await expect(today).toContainText(`Wishlist alert: ${WISHED_CARD}`);

      // One switch in the notification settings turns wishlist alerts off.
      await page.goto('/settings/notifications');
      await expect(page.getByRole('switch', { name: 'Wishlist alerts' })).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // The public wishlist on the profile: which copy, the note and the chips.
      await page.goto(`/collectors/${a.handle}`);
      const lookingFor = page.getByRole('list', { name: 'Cards you are looking for' });
      await expect(lookingFor).toContainText(WISHED_CARD);
      await expect(lookingFor).toContainText(`${WISHED_PRINTING} · Common`);
      await expect(lookingFor).toContainText('Fictional E2E wish.');
      await expect(lookingFor).toContainText('Near Mint only');
      await expect(lookingFor).toContainText('85% TCG');
      // The profile never scrolls sideways on a phone-sized screen.
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(lookingFor).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        'horizontal overflow of the profile at 375 px',
      ).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1280, height: 720 });

      await watcher.settle();
      expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
      await page.context().close();
    } finally {
      // Later runs must never be alerted about B's listing.
      await request.post(`${API_URL}/api/v1/binders/${binder.id}/unpublish`, {
        headers: authHeader(b.idToken),
      });
    }
  });

  test('a typed printing code and an "Any printing" alert never pick a printing nobody chose', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const a = await createOnboardedCollector(request, 'wishany', {
      location: SOUTH,
      displayName: `Ana Anyprint ${suffix()}`,
    });
    const b = await createOnboardedCollector(request, 'wishunl', {
      location: SOUTH,
      displayName: `Uli Unlimited ${suffix()}`,
    });
    await apiUpdatePrivacy(request, b.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, b.idToken, {
      name: `E2E any-printing binder ${suffix()}`,
      kind: 'TRADE',
      description: 'Fictional binder for the wishlist E2E suite.',
    });
    await apiPublishBinder(request, b.idToken, binder.id, 'UNTIL_DISABLED');
    const cardId = await cardIdOf(request, a.idToken, SHARED_CODE_CARD);
    const printings = await printingsOf(request, a.idToken, cardId);
    const sharing = printings.filter((printing) => printing.printingCode === SHARED_CODE);
    expect(sharing.map((printing) => printing.edition).sort()).toEqual([
      'FIRST_EDITION',
      'UNLIMITED',
    ]);
    const firstEdition = sharing.find((printing) => printing.edition === 'FIRST_EDITION')!;
    const unlimited = sharing.find((printing) => printing.edition === 'UNLIMITED')!;
    const singlePrintingId = await printingIdOf(request, a.idToken, SINGLE_CODE);

    try {
      const page = await openSignedIn(browser, a);
      const watcher = watchCoordinates(page);
      await page.goto('/search?tab=wishlist&game=yugioh');
      await expect(page.getByText('No wishes yet')).toBeVisible();
      const bell = page.getByTestId('notification-bell');
      await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });

      // A typed code that two printings share: one suggestion for the code, and the wish starts
      // on "Any printing" with the picker pointing at the code. Neither printing is picked.
      await page.getByTestId('add-wish').click();
      const dialog = page.getByRole('dialog', { name: 'Add a wish' });
      const search = dialog.getByRole('combobox', { name: 'Find the card you want' });
      await search.fill(SHARED_CODE);
      const codeOption = page.getByRole('option', {
        name: new RegExp(`^${SHARED_CODE_CARD} .*${SHARED_CODE}`),
      });
      await expect(codeOption).toHaveCount(1);
      await expect(codeOption).toContainText('Printing code');
      await codeOption.click();
      await expect(dialog.getByTestId('wish-card')).toContainText(SHARED_CODE_CARD);
      const copy = dialog.getByRole('combobox', { name: 'Which copy' });
      await expect(copy).toContainText('Any printing');
      await expect(dialog).toContainText(
        `Any printing of the card. 2 printings share the code ${SHARED_CODE}: choose one in Which copy for that copy only.`,
      );
      // "Which copy" names the edition of the two printings of the code.
      await copy.click();
      await expect(page.getByTestId(`printing-option-${firstEdition.id}`)).toContainText(
        '1st Edition',
      );
      await expect(page.getByTestId(`printing-option-${unlimited.id}`)).toContainText('Unlimited');
      await page.keyboard.press('Escape');
      await expect(copy).toContainText('Any printing');
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog).toBeHidden();
      const wish = page.getByTestId('wish-row').filter({ hasText: SHARED_CODE_CARD });
      await expect(wish).toContainText('Any printing');

      // A code only one printing has still preselects that printing.
      await page.getByTestId('add-wish').click();
      await search.fill(SINGLE_CODE);
      await page
        .getByRole('option', { name: new RegExp(`^${SINGLE_CODE_CARD} .*${SINGLE_CODE}`) })
        .click();
      await expect(dialog.getByTestId('wish-card')).toContainText(SINGLE_CODE_CARD);
      await expect(dialog.getByRole('combobox', { name: 'Which copy' })).toContainText(SINGLE_CODE);
      // A click outside the dialog does not discard a typed note; Cancel still closes.
      await dialog.getByRole('textbox', { name: 'Public note (optional)' }).fill('Typed, unsaved.');
      await page.mouse.click(8, 8);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: 'Public note (optional)' })).toHaveValue(
        'Typed, unsaved.',
      );
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();

      // B lists the Unlimited copy: A's alert, for an "Any printing" wish, is shown in full in
      // the bell menu (the place is never cut off), on a wide and on a phone-sized screen.
      await listCopy(request, b, binder.id, unlimited.id, { condition: 'NEAR_MINT', price: 12.5 });
      await expect(page.getByTestId('notification-badge')).toBeVisible({ timeout: 20_000 });
      const menu = page.getByRole('menu', { name: 'Notifications' });
      const entry = menu.getByRole('menuitem', {
        name: new RegExp(`Wishlist alert: ${SHARED_CODE_CARD}`),
      });
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        await bell.click();
        await expect(entry).toContainText(
          `${SHARED_CODE_CARD} ${SHARED_CODE} Super Rare was just listed by @${b.handle} in Montevideo, Uruguay.`,
        );
        const cut = await entry
          .locator('.ne__body')
          .evaluate((body) => body.scrollHeight > body.clientHeight + 1);
        expect(cut, `alert text cut off at ${viewport.width} px`).toBe(false);
        if (viewport.width > 375) {
          await page.keyboard.press('Escape');
          await expect(menu).toBeHidden();
        }
      }

      // The alert opens the card page on "Any printing": no printing is chosen for A (the listed
      // copy is the Unlimited one; the catalog's first printing is the 1st Edition).
      await entry.click();
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page).toHaveURL(new RegExp(`/cards/${cardId}\\?printing=any$`));
      await expect(page.getByRole('heading', { level: 1, name: SHARED_CODE_CARD })).toBeVisible();
      const pill = page.getByTestId('printing-pill');
      await expect(pill).toHaveText(/Any printing/);
      await expect(page.getByText('Every printing.', { exact: false })).toBeVisible();
      await expect(page.getByTestId('holder-row').filter({ hasText: b.handle })).toBeVisible();

      // Choosing a printing replaces "any": the picker tells the two printings of one code apart.
      await pill.click();
      const picker = page.getByRole('dialog', { name: 'Which printing' });
      await expect(picker.getByRole('option', { selected: true })).toHaveText(/Any printing/);
      await picker
        .getByRole('option', { name: new RegExp(`^${SHARED_CODE} .*1st Edition`) })
        .click();
      await expect(page).toHaveURL(new RegExp(`/cards/${cardId}\\?printing=${firstEdition.id}$`));
      await expect(pill).toHaveText(new RegExp(SHARED_CODE));
      // B's copy is the Unlimited one: not a holder of the 1st Edition.
      await expect(page.getByTestId('holder-row').filter({ hasText: b.handle })).toHaveCount(0);

      // The wish's own link in Search › Wishlist says "any printing" too.
      await page.goto('/search?tab=wishlist&game=yugioh');
      await page.getByTestId('wish-row').filter({ hasText: SHARED_CODE_CARD }).click();
      await page.getByRole('link', { name: 'Open card page' }).click();
      await expect(page).toHaveURL(new RegExp(`/cards/${cardId}\\?printing=any$`));
      await expect(pill).toHaveText(/Any printing/);

      await watcher.settle();
      expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
      await page.context().close();
    } finally {
      // Later runs must never be alerted about B's listing.
      await request.post(`${API_URL}/api/v1/binders/${binder.id}/unpublish`, {
        headers: authHeader(b.idToken),
      });
    }
  });

  test('a full wishlist explains the limit when adding one more wish', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'wishfull', {
      displayName: `Fay Full ${suffix()}`,
    });
    // Every collector can have 20 wishes: fill them through the API with 20 different catalog cards.
    const catalog = await request.get(`${API_URL}/api/v1/cards`, {
      headers: authHeader(collector.idToken),
      params: { size: 30 },
    });
    expect(catalog.ok(), 'GET /cards').toBeTruthy();
    const cards = ((await catalog.json()) as { items: { id: string; name: string }[] }).items
      .filter((card) => card.name !== WISHED_CARD)
      .slice(0, 20);
    expect(cards).toHaveLength(20);
    for (const card of cards) {
      const response = await request.post(`${API_URL}/api/v1/wishlist`, {
        headers: authHeader(collector.idToken),
        // A removed member of the old model is ignored (never stored).
        data: { cardId: card.id, tradePreference: 'TRADE' },
      });
      expect(response.status(), `wish for ${card.name}`).toBe(201);
    }

    await stubCardImages(page);
    await signInThroughUi(page, collector.email, collector.password);
    const watcher = watchCoordinates(page);
    await page.goto('/search?tab=wishlist');
    // The cap, plainly, the same for everyone (spec 6.6; ADR 0019).
    await expect(
      page.getByText(
        'You have 20 wishes, the most each collector can have. Every collector has the same limits.',
      ),
    ).toBeVisible();
    // Without a location no alert can arrive: the pane says so and links to the setting.
    await expect(page.getByTestId('wishlist-location-prompt')).toContainText(
      'Choose your state or province',
    );
    await expect(
      page
        .getByTestId('wishlist-location-prompt')
        .getByRole('link', { name: 'Settings › Location' }),
    ).toHaveAttribute('href', '/settings/location');
    await expect(page.getByRole('link', { name: /Premium/ })).toHaveCount(0);
    // No per-wish alert switch and no filters any more.
    await expect(page.getByRole('switch', { name: /alerts for/i })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);

    await page.getByTestId('add-wish').click();
    const dialog = page.getByRole('dialog', { name: 'Add a wish' });
    await dialog.getByRole('combobox', { name: 'Find the card you want' }).fill('Emberfang');
    await page.getByRole('option', { name: new RegExp(`^${WISHED_CARD} Pokémon`) }).click();
    await expect(dialog.getByTestId('wish-card')).toContainText(WISHED_CARD);
    await dialog.getByRole('button', { name: 'Add to wishlist' }).click();

    // 429 LIMIT_REACHED: the limit dialog explains it, and the wish dialog says why inline.
    const limit = page.getByRole('alertdialog', { name: 'You reached a limit' });
    await expect(limit).toBeVisible();
    await expect(limit).toContainText('you used 20 of 20');
    // The technical limit key is not shown to collectors.
    await expect(limit).not.toContainText('wishlist.items.max');
    await expect(limit).not.toContainText(/premium|plan/i);
    await limit.getByRole('button', { name: 'OK' }).click();
    await expect(limit).toBeHidden();
    await expect(dialog.getByTestId('wish-error')).toContainText(
      'Your wishlist is full: it holds up to 20 wishes',
    );
    // Back in the wish dialog, the focus is on its save button, not on the page behind.
    await expect(dialog.getByRole('button', { name: 'Add to wishlist' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('You have 20 wishes', { exact: false })).toBeVisible();

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });
});
