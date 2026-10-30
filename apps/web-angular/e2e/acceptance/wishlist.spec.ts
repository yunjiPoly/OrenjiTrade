import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { escapeRegExp, expect, expectRealtime, signIn, test } from './support/fixtures';
import { cityToken, placeOf } from './support/places';

/**
 * Acceptance — wishlist (spec § 50, ADR 0017, stage S2): collector A wants a card (added to the
 * wishlist from the card page, "Any printing" by default in the printing picker; no radius, no
 * matches); collector B, of the same platform region, publishes a binder holding that card from
 * the inventory page in another browser; A gets one wishlist alert live (the bell badge rises over
 * STOMP without a reload) naming B's state and country, and the alert opens the card page. Both
 * live in Lisbon (Europe), where no other spec lists cards.
 */

const CARD = 'Galecrest Owl';
const CODE = 'SVX-049';

test.describe('acceptance: wishlist', () => {
  requireStack();

  test('A wants a card, B of the same region publishes it, a wishlist alert reaches A', async ({
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
    // Who has this card's wishlist toggle adds an "Any printing" wish at once (spec 7.2).
    const toggle = page.getByTestId('card-wish-toggle');
    await toggle.click();
    await expect(toggle).toHaveText(/On your wishlist/);

    await page.goto('/search?tab=wishlist');
    const wish = page.getByTestId('wish-row').filter({ hasText: CARD });
    await expect(wish).toHaveCount(1);
    await expect(wish).toContainText('Any printing');
    await expectRealtime(page);
    await page.evaluate(() => ((window as unknown as { e2eNoReload: boolean }).e2eNoReload = true));

    // --- B publishes the binder holding the card ------------------------------------------------
    const pageB = await actors.open(b);
    await pageB.goto(`/inventory?binder=${binder.id}`);
    // Web WB: the binder strip's [Private | Public].
    await pageB.getByTestId('binder-strip').getByRole('radio', { name: 'Public' }).click();
    await expect(
      pageB.getByTestId('toast').filter({ hasText: `${binder.name} is public` }),
    ).toBeVisible();
    api.trackPublished(b, binder.id);

    // --- A gets the wishlist alert live; it opens the card page --------------------------------
    await expect(page.getByTestId('notification-badge')).toBeVisible({ timeout: 30_000 });
    expect(
      await page.evaluate(() => (window as unknown as { e2eNoReload?: boolean }).e2eNoReload),
    ).toBe(true);
    await page.getByTestId('notification-bell').click();
    const entry = page
      .getByRole('menu', { name: 'Notifications' })
      .getByRole('menuitem', { name: new RegExp(`Wishlist alert: ${escapeRegExp(CARD)}`) });
    await expect(entry).toContainText(
      `${CARD} ${CODE} Rare was just listed by @${b.handle} in ${place.label}.`,
    );
    await expect(entry).not.toContainText(/\bkm\b/);
    await entry.click();
    // The wish is for any printing: the link says so and the card page picks no printing.
    await expect(page).toHaveURL(new RegExp(`/cards/${cardId}\\?printing=any$`));
    await expect(page.getByRole('heading', { level: 1, name: CARD })).toBeVisible();
    await expect(page.getByTestId('printing-pill')).toHaveText(/Any printing/);

    // The notification is in A's notification centre as well, once.
    const types = (await api.notifications(a)).map((notification) => notification.type);
    expect(types.filter((type) => type === 'WISHLIST_ALERT')).toHaveLength(1);
    expect(types).not.toContain('WISHLIST_MATCH');
  });
});
