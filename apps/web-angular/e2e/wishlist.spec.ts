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
 * Wishlist, matching and notifications (Phase 6) against the real local stack, with two
 * collectors: A adds "Emberfang Fox" to their wishlist through the dialog (card autocomplete,
 * minimum condition, maximum price; no radius, ADR 0017) and checks that an identical wish is
 * refused inline (409) and that a wish can be removed. B, of the same platform region, publishes
 * the card: the matcher notifies A, whose bell badge rises over STOMP without a reload; the
 * notification opens `/wishlist/<id>` with the matches drawer (B's state and country, price); a
 * second copy arrives live in the open drawer and is dismissed; A messages B from the drawer;
 * `/notifications` filters unread ones and marks all read. A second test fills a FREE wishlist
 * (20 wishes) and checks the limit dialog on the 21st. No JSON response carries a coordinate.
 *
 * A and B live in Uruguay (Americas (South), which no other spec lists cards in), and B's listing
 * is unpublished at the end so later runs never match it.
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

/** B lists one copy of the wished printing in their public binder (publication → matching). */
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

  test('A wishes a card, B of the same region lists it: A is notified live and messages B from the matches', async ({
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
    // Matching pairs a wish with listings of discoverable collectors of the same platform region
    // (ADR 0017): B opts in to the map. A also shows the wishlist on the profile.
    await apiUpdatePrivacy(request, a.idToken, { discoverable: true, wishlistVisible: true });
    await apiUpdatePrivacy(request, b.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, b.idToken, {
      name: `E2E wish binder ${suffix()}`,
      kind: 'TRADE',
      description: 'Fictional binder for the wishlist E2E suite.',
    });
    await apiPublishBinder(request, b.idToken, binder.id, 'UNTIL_DISABLED');
    const printingId = await printingIdOf(request, b.idToken, WISHED_PRINTING);
    const otherCardId = await cardIdOf(request, a.idToken, OTHER_CARD);

    try {
      const page = await openSignedIn(browser, a);
      const watcher = watchCoordinates(page);
      await page.goto('/wishlist');
      await expect(page.getByRole('heading', { level: 1, name: 'Wishlist' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your wishlist is empty' })).toBeVisible();
      await expect(page.getByTestId('match-readiness')).toHaveCount(0);
      const bell = page.getByTestId('notification-bell');
      await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });
      await expect(page.getByTestId('notification-badge')).toHaveCount(0);

      // Add the wish through the dialog: autocomplete → any printing → criteria.
      await page.getByRole('button', { name: 'Add a card' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add to wishlist' });
      await dialog.getByRole('combobox', { name: 'Card name or printing code' }).fill('Emberfang');
      await page.getByRole('option', { name: new RegExp(`^${WISHED_CARD} Pokémon`) }).click();
      await expect(dialog.getByTestId('wish-card')).toContainText(WISHED_CARD);
      await expect(dialog.getByRole('combobox', { name: 'Printing' })).toContainText(
        'Any printing',
      );
      await dialog.getByRole('combobox', { name: 'Minimum condition' }).click();
      await page.getByRole('option', { name: 'Lightly Played or better' }).click();
      await dialog.getByRole('spinbutton', { name: 'Maximum price' }).fill('25');
      // No distance slider any more: wishes match collectors of the same region.
      await expect(dialog.getByRole('slider')).toHaveCount(0);
      await dialog.getByRole('textbox', { name: 'Private notes' }).fill('Fictional E2E wish.');
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${WISHED_CARD} is on your wishlist`)).toBeVisible();

      const wish = page.locator('[data-wish]').filter({ hasText: WISHED_CARD });
      await expect(wish).toHaveCount(1);
      const criteria = wish.getByRole('list', { name: `What you want for ${WISHED_CARD}` });
      await expect(criteria).toContainText('Lightly Played or better');
      await expect(criteria).toContainText('Up to $25.00');
      await expect(criteria).not.toContainText(/\bkm\b/);
      await expect(criteria).toContainText('Trade or buy');
      await expect(wish).toContainText('Any printing');
      await expect(wish.getByTestId('wish-matches')).toHaveText(/No matches yet/);

      // From the card page: a second wish, then the identical one is refused inline (409).
      await page.goto(`/cards/${otherCardId}`);
      await expect(page.getByRole('heading', { level: 1, name: OTHER_CARD })).toBeVisible();
      await page.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-card')).toContainText(OTHER_CARD);
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${OTHER_CARD} is on your wishlist`)).toBeVisible();
      await page.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-card')).toContainText(OTHER_CARD);
      await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
      await expect(dialog.getByTestId('wish-error')).toContainText(
        'already on your wishlist with the same filters',
      );
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();

      // Remove that second wish from the list (confirmation first).
      await page.goto('/wishlist');
      await expect(page.locator('[data-wish]')).toHaveCount(2);
      await page.getByRole('button', { name: `Options for ${OTHER_CARD}` }).click();
      await page.getByRole('menuitem', { name: 'Remove from wishlist' }).click();
      const confirm = page.getByRole('dialog', { name: `Remove ${OTHER_CARD}?` });
      await confirm.getByRole('button', { name: 'Remove' }).click();
      await expect(page.getByText(`${OTHER_CARD} removed from your wishlist.`)).toBeVisible();
      await expect(page.locator('[data-wish]')).toHaveCount(1);
      await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });
      // Marker to prove the page is never reloaded while the notifications arrive.
      await page.evaluate(
        () => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true),
      );

      // B lists a Near Mint copy for 20 CAD in the region: A's badge and match count rise live.
      await listCopy(request, b, binder.id, printingId, { condition: 'NEAR_MINT', price: 20 });
      await expect(page.getByTestId('notification-badge')).toHaveText('1', { timeout: 20_000 });
      await expect(bell).toHaveAccessibleName('Notifications, 1 unread');
      await expect(wish.getByTestId('wish-matches')).toHaveText(/1 match/, { timeout: 15_000 });

      // The bell menu shows the match; opening it marks it read and opens the matches drawer.
      await bell.click();
      const menu = page.getByRole('menu', { name: 'Notifications' });
      const entry = menu.getByRole('menuitem', {
        name: new RegExp(`Wishlist match: ${WISHED_CARD}`),
      });
      await expect(entry).toContainText(`${WISHED_CARD} ${WISHED_PRINTING} was listed`);
      await expect(entry).toContainText(`by @${b.handle} in Montevideo, Uruguay`);
      await expect(entry).toContainText('20.00 CAD');
      await entry.click();
      await expect(page).toHaveURL(/\/wishlist\/[0-9a-f-]{36}$/);
      const sheet = page.getByRole('dialog', { name: `Matches for ${WISHED_CARD}` });
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId('notification-badge')).toHaveCount(0);
      const matches = sheet.locator('[data-match]');
      await expect(matches).toHaveCount(1);
      const first = matches.first();
      await expect(first).toContainText(b.displayName);
      await expect(first.getByTestId('match-place')).toHaveText('Montevideo, Uruguay');
      await expect(first).not.toContainText(/\bkm\b/);
      await expect(first.getByTestId('match-price')).toHaveText('$20.00');
      await expect(first.getByLabel('Condition: Near Mint')).toBeVisible();
      await expect(first.getByRole('link', { name: 'View binder' })).toHaveAttribute(
        'href',
        `/binders/${binder.id}`,
      );

      // A second, cheaper copy arrives live in the open drawer; A dismisses it.
      await listCopy(request, b, binder.id, printingId, { condition: 'LIGHTLY_PLAYED', price: 18 });
      await expect(page.getByTestId('notification-badge')).toHaveText('1', { timeout: 20_000 });
      await expect(matches).toHaveCount(2, { timeout: 15_000 });
      await expect(matches.first().getByTestId('match-price')).toHaveText('$18.00');
      await matches
        .first()
        .getByRole('button', { name: `Dismiss the match from ${b.displayName}` })
        .click();
      await expect(page.getByText(`Match from ${b.displayName} dismissed.`)).toBeVisible();
      await expect(matches).toHaveCount(1);
      await expect(matches.first().getByTestId('match-price')).toHaveText('$20.00');
      expect(
        await page.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
      ).toBe(true);

      // Message B from the match: the conversation opens on the Messages page.
      await matches
        .first()
        .getByRole('button', { name: `Message ${b.displayName}` })
        .click();
      await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
      await expect(sheet).toBeHidden();
      await expect(
        page.getByRole('region', { name: `Conversation with ${b.displayName}` }),
      ).toBeVisible();

      // `/notifications`: the unread filter shows the second match; mark all read empties it.
      await page.goto('/notifications');
      await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
      const today = page.getByRole('list', { name: 'Today notifications' });
      await expect(today.getByRole('listitem')).toHaveCount(2);
      await page.getByRole('radio', { name: /Unread/ }).click();
      await expect(page).toHaveURL(/\/notifications\?unread=1$/);
      await expect(today.getByRole('listitem')).toHaveCount(1);
      await expect(today).toContainText(`Wishlist match: ${WISHED_CARD}`);
      await expect(today).toContainText('18.00 CAD');
      await page.getByRole('button', { name: 'Mark all as read' }).click();
      await expect(page.getByText('1 notification marked as read.')).toBeVisible();
      await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
      await expect(page.getByTestId('notification-badge')).toHaveCount(0);

      // Back on the wishlist, the dismissed copy no longer counts.
      await page.goto('/wishlist');
      await expect(wish.getByTestId('wish-matches')).toHaveText(/1 match/);
      await expect(page.getByTestId('wishlist-total-matches')).toHaveText('1');

      // The public wishlist on the profile: card and minimum condition, never price or radius.
      await page.goto(`/collectors/${a.handle}`);
      const lookingFor = page.getByRole('list', { name: 'Cards you are looking for' });
      await expect(lookingFor).toContainText(WISHED_CARD);
      await expect(lookingFor).toContainText('Any printing');
      await expect(lookingFor).toContainText('Lightly Played or better');
      await expect(lookingFor).not.toContainText('25.00');

      await watcher.settle();
      expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
      await page.context().close();
    } finally {
      // Later runs must never match B's listing.
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
        data: { cardId: card.id, tradePreference: 'TRADE' },
      });
      expect(response.status(), `wish for ${card.name}`).toBe(201);
    }
    const pausedCard = cards[0].name;

    await stubCardImages(page);
    await signInThroughUi(page, collector.email, collector.password);
    const watcher = watchCoordinates(page);
    await page.goto('/wishlist');
    await expect(page.locator('[data-wish]')).toHaveCount(20);
    await expect(page.getByText('20 of 20 wishes')).toBeVisible();
    // Without a location no match can arrive: the page says so and links to the setting.
    await expect(page.getByTestId('match-readiness')).toContainText(
      'Choose your location to get matches',
    );
    await expect(
      page.getByTestId('match-readiness').getByRole('link', { name: 'Choose my location' }),
    ).toHaveAttribute('href', '/settings/location');
    await expect(page.getByRole('link', { name: 'Need more room? See Premium' })).toBeVisible();

    // Alerts can be paused from the list (PATCH active) and the filter finds the paused wish.
    await page.getByRole('switch', { name: `Match alerts for ${pausedCard}` }).click();
    await expect(page.getByText(`Alerts paused for ${pausedCard}.`)).toBeVisible();
    await page.getByRole('radio', { name: 'Paused (1)' }).click();
    await expect(page.locator('[data-wish]')).toHaveCount(1);
    await page.getByRole('radio', { name: 'All (20)' }).click();

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
