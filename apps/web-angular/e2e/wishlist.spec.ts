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
 * alerts and the limit dialog on the 21st. No JSON response carries a coordinate.
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
      await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your wishlist is empty' })).toBeVisible();
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
      await page.getByRole('button', { name: 'Add a card' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add to wishlist' });
      await dialog.getByRole('combobox', { name: 'Card name or printing code' }).fill('Emberfang');
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
      await expect(dialog.getByRole('radio', { name: /^Any printing/ })).toBeChecked();
      await dialog
        .getByRole('textbox', { name: 'Public note (optional)' })
        .fill('Fictional E2E wish.');
      await dialog.getByRole('checkbox', { name: 'Near Mint only' }).check();
      // With "Any printing" a term shows no amount; with one printing it does.
      await expect(dialog.getByTestId('wish-term-85% TCG')).not.toContainText('≈');
      await dialog.getByTestId(`printing-option-${printingId}`).getByRole('radio').check();
      await expect(dialog.getByTestId('wish-term-85% TCG')).toContainText(/≈ 0\.\d\d CAD/);
      await dialog.getByTestId('wish-term-85% TCG').getByRole('checkbox').check();
      await dialog.getByTestId('wish-term-90% TCG').getByRole('checkbox').check();
      await expect(dialog.getByTestId('wish-term-85% TCG').getByRole('checkbox')).not.toBeChecked();
      await dialog.getByTestId('wish-term-85% TCG').getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${WISHED_CARD} is on your wishlist`)).toBeVisible();

      const wish = page.locator('[data-wish]').filter({ hasText: WISHED_CARD });
      await expect(wish).toHaveCount(1);
      await expect(wish.getByTestId('wish-copy')).toContainText(`${WISHED_PRINTING} · Common`);
      await expect(wish.getByTestId('wish-note-text')).toContainText('Fictional E2E wish.');
      const chips = wish.getByRole('list', { name: `What you want for ${WISHED_CARD}` });
      await expect(chips).toContainText('Near Mint only');
      await expect(chips).toContainText(/85% TCG ≈ 0\.\d\d CAD/);
      await expect(chips).not.toContainText(/\bkm\b|Up to|Trade or buy/);
      await expect(wish).not.toContainText(/match/i);

      // From the card page: a second wish (any printing), then the same selection is refused
      // inline (409).
      await page.goto(`/cards/${otherCardId}`);
      await expect(page.getByRole('heading', { level: 1, name: OTHER_CARD })).toBeVisible();
      await page.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-card')).toContainText(OTHER_CARD);
      await expect(dialog.getByRole('radio', { name: /^Any printing/ })).toBeChecked();
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${OTHER_CARD} is on your wishlist`)).toBeVisible();
      await page.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-card')).toContainText(OTHER_CARD);
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-error')).toContainText(
        'already on your wishlist with the same printing or rarity',
      );
      // Next to the buttons, outside the scrolling content: in view whatever the scroll position.
      await expect(dialog.getByTestId('wish-error')).toBeInViewport();
      // Escape closes it and gives the focus back to the button that opened it.
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'Add to wishlist' })).toBeFocused();

      // Remove that second wish from the list (confirmation first).
      await page.goto('/wishlist');
      await expect(page.locator('[data-wish]')).toHaveCount(2);
      await page
        .getByRole('button', { name: `Remove ${OTHER_CARD} (Any printing) from your wishlist` })
        .click();
      const confirm = page.getByRole('dialog', { name: `Remove ${OTHER_CARD}?` });
      await expect(confirm).toContainText('The wish for Any printing is removed.');
      await confirm.getByRole('button', { name: 'Remove' }).click();
      await expect(
        page.getByText(`${OTHER_CARD} (Any printing) removed from your wishlist.`),
      ).toBeVisible();
      await expect(page.locator('[data-wish]')).toHaveCount(1);
      await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });
      // Marker to prove the page is never reloaded while the alert arrives.
      await page.evaluate(
        () => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true),
      );

      // B lists a Lightly Played copy (the wish wants Near Mint only), then a Near Mint one:
      // exactly one alert, live.
      await listCopy(request, b, binder.id, printingId, { condition: 'LIGHTLY_PLAYED', price: 18 });
      await listCopy(request, b, binder.id, printingId, { condition: 'NEAR_MINT', price: 20 });
      await expect(page.getByTestId('notification-badge')).toHaveText('1', { timeout: 20_000 });
      await expect(bell).toHaveAccessibleName('Notifications, 1 unread');
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

  test('a full FREE wishlist explains the plan limit when adding one more wish', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'wishfull', {
      displayName: `Fay Full ${suffix()}`,
    });
    // The FREE plan allows 20 wishes: fill it through the API with 20 different catalog cards.
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
    await page.goto('/wishlist');
    await expect(page.locator('[data-wish]')).toHaveCount(20);
    await expect(page.getByText('20 of 20 wishes')).toBeVisible();
    // Without a location no alert can arrive: the page says so and links to the setting.
    await expect(page.getByTestId('wishlist-location-prompt')).toContainText(
      'Set your country and state to get wishlist alerts',
    );
    await expect(
      page
        .getByTestId('wishlist-location-prompt')
        .getByRole('link', { name: 'Choose my location' }),
    ).toHaveAttribute('href', '/settings/location');
    await expect(page.getByRole('link', { name: 'Need more room? See Premium' })).toBeVisible();
    // No per-wish alert switch and no filters any more.
    await expect(page.getByRole('switch', { name: /alerts for/i })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add a card' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add to wishlist' });
    await dialog.getByRole('combobox', { name: 'Card name or printing code' }).fill('Emberfang');
    await page.getByRole('option', { name: new RegExp(`^${WISHED_CARD} Pokémon`) }).click();
    await expect(dialog.getByTestId('wish-card')).toContainText(WISHED_CARD);
    await dialog.getByRole('button', { name: 'Add to wishlist' }).click();

    // 429 LIMIT_REACHED: the limit dialog explains it, and the wish dialog says why inline.
    const limit = page.getByRole('alertdialog', { name: 'You reached a plan limit' });
    await expect(limit).toBeVisible();
    await expect(limit).toContainText('wishlist.items.max');
    await expect(limit).toContainText('you used 20 of 20');
    await limit.getByRole('button', { name: 'Not now' }).click();
    await expect(limit).toBeHidden();
    await expect(dialog.getByTestId('wish-error')).toContainText(
      'Your wishlist is full: your plan allows 20 wishes',
    );
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-wish]')).toHaveCount(20);

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });
});
