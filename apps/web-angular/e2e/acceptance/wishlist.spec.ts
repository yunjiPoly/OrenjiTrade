import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import {
  dialogReady,
  escapeRegExp,
  expect,
  expectRealtime,
  signIn,
  test,
} from './support/fixtures';
import { cityToken, placeOf } from './support/places';

/**
 * Acceptance — wishlist (spec § 50, ADR 0017): collector A wants a card (added to the wishlist from
 * the card page; no radius exists); collector B, of the same platform region, publishes a binder
 * holding that card from the inventory page in another browser; the matcher finds the match and A
 * is notified live (the bell badge rises over STOMP without a reload) and sees B, by state and
 * country, in the matches drawer. Both live in Lisbon (Europe), where no other spec lists cards.
 */

const CARD = 'Galecrest Owl';
const CODE = 'SVX-049';

test.describe('acceptance: wishlist', () => {
  requireStack();

  test('A wants a card, B of the same region publishes it, the match notifies A', async ({
    page,
    api,
    actors,
  }) => {
    test.setTimeout(180_000);
    const place = placeOf('wishlist');
    const a = await api.collector('acc-wisha', {
      place,
      discoverable: true,
      displayName: `Wren Wanter ${suffix()}`,
    });
    const b = await api.collector('acc-wishb', {
      place: placeOf('wishlist', cityToken()),
      discoverable: true,
      displayName: `Hal Holder ${suffix()}`,
    });
    const binder = await api.binder(b, {
      name: `Acceptance wish binder ${suffix()}`,
      kind: 'TRADE',
      description: 'Fictional binder for the acceptance suite.',
    });
    await api.item(b, CODE, {
      binderId: binder.id,
      visibility: 'PUBLIC',
      availability: 'TRADE_OR_SALE',
      askingPrice: 20,
      acceptsOffers: true,
    });
    const cardId = await api.cardId(a.idToken, CARD);

    // --- A wants the card ------------------------------------------------------------------------
    await signIn(page, a);
    await page.goto(`/cards/${cardId}`);
    await expect(page.getByRole('heading', { level: 1, name: CARD })).toBeVisible();
    await page.getByRole('button', { name: 'Add to wishlist' }).click();
    const dialog = await dialogReady(page.getByRole('dialog', { name: 'Add to wishlist' }));
    await expect(dialog.getByTestId('wish-card')).toContainText(CARD);
    await expect(dialog.getByRole('slider')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Add to wishlist' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`${CARD} is on your wishlist`)).toBeVisible();

    await page.goto('/wishlist');
    const wish = page.locator('[data-wish]').filter({ hasText: CARD });
    await expect(wish).toHaveCount(1);
    await expect(wish.getByTestId('wish-matches')).toHaveText(/No matches yet/);
    await expectRealtime(page);
    await page.evaluate(() => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true));

    // --- B publishes the binder holding the card ------------------------------------------------
    const pageB = await actors.open(b);
    await pageB.goto(`/inventory?binder=${binder.id}`);
    await pageB.getByRole('button', { name: `Publish ${binder.name}` }).click();
    await pageB.getByRole('menuitem', { name: 'Public until disabled' }).click();
    await expect(
      pageB.getByText(`“${binder.name}” is public until you make it private.`),
    ).toBeVisible();
    api.trackPublished(b, binder.id);

    // --- A is notified live and finds B in the matches -------------------------------------------
    await expect(page.getByTestId('notification-badge')).toBeVisible({ timeout: 30_000 });
    await expect(wish.getByTestId('wish-matches')).toHaveText(/1 match/, { timeout: 15_000 });
    expect(
      await page.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
    ).toBe(true);
    await page.getByTestId('notification-bell').click();
    const entry = page
      .getByRole('menu', { name: 'Notifications' })
      .getByRole('menuitem', { name: new RegExp(`Wishlist match: ${escapeRegExp(CARD)}`) });
    await expect(entry).toContainText(
      `${CARD} ${CODE} was listed by @${b.handle} in ${place.label}`,
    );
    await entry.click();
    await expect(page).toHaveURL(/\/wishlist\/[0-9a-f-]{36}$/);
    const sheet = page.getByRole('dialog', { name: `Matches for ${CARD}` });
    const match = sheet.locator('[data-match]').filter({ hasText: b.displayName });
    await expect(match).toHaveCount(1);
    await expect(match.getByTestId('match-place')).toHaveText(place.label);
    await expect(match).not.toContainText(/\bkm\b/);
    await expect(match.getByTestId('match-price')).toHaveText('$20.00');
    await expect(match.getByRole('link', { name: 'View binder' })).toHaveAttribute(
      'href',
      `/binders/${binder.id}`,
    );

    // The notification is in A's notification centre as well.
    const types = (await api.notifications(a)).map((notification) => notification.type);
    expect(types).toContain('WISHLIST_MATCH');
  });
});
