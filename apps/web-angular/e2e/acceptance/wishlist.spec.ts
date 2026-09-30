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
import { besides, randomCentre } from './support/places';

/**
 * Acceptance — wishlist (spec § 50): collector A wants a card (added to the wishlist from the card
 * page with a 10 km radius); collector B, nearby, publishes a binder holding that card from the
 * inventory page in another browser; the matcher finds the match and A is notified live (the bell
 * badge rises over STOMP without a reload) and sees B in the matches drawer.
 */

const CARD = 'Galecrest Owl';
const CODE = 'SVX-049';

test.describe('acceptance: wishlist', () => {
  requireStack();

  test('A wants a card, B publishes it nearby, the match notifies A', async ({
    page,
    api,
    actors,
  }) => {
    test.setTimeout(180_000);
    const area = randomCentre('wishlist');
    const a = await api.collector('acc-wisha', {
      area,
      radiusKm: 5,
      discoverable: true,
      displayName: `Wren Wanter ${suffix()}`,
    });
    const b = await api.collector('acc-wishb', {
      area: besides(area),
      radiusKm: 5,
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
    const slider = dialog.getByRole('slider', { name: 'Distance in kilometres' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(dialog.getByTestId('wish-radius-value')).toHaveText('25 km');
    for (let step = 0; step < 15; step++) {
      await page.keyboard.press('ArrowLeft');
    }
    await expect(dialog.getByTestId('wish-radius-value')).toHaveText('10 km');
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
    await expect(entry).toContainText(`${CARD} ${CODE} was listed`);
    await entry.click();
    await expect(page).toHaveURL(/\/wishlist\/[0-9a-f-]{36}$/);
    const sheet = page.getByRole('dialog', { name: `Matches for ${CARD}` });
    const match = sheet.locator('[data-match]').filter({ hasText: b.displayName });
    await expect(match).toHaveCount(1);
    await expect(match.getByTestId('match-distance')).toHaveText(/km away/);
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
