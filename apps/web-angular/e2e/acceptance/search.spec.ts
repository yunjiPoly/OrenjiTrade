import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { escapeRegExp, expect, mapMarker, signIn, test } from './support/fixtures';
import { besides, randomCentre } from './support/places';
import { Point } from './support/privacy';

/**
 * Acceptance — search (spec § 50): a collector searches a card from the top bar, opens it and asks
 * "Who has this near me": the nearby holder appears in the map's holders list and on the map, in
 * the card-holders view with its price, and in the unified search by printing code. Exact
 * coordinates are never exposed: every holder's point is its derived public point (the privacy
 * scanner also checks every response for > 3 decimals and stored centres).
 */

const CARD = 'Tidecaller Mermaid';
const CODE = 'SHV-EN013';

interface HoldersPage {
  items: { collector?: { handle?: string; publicPoint?: Point } }[];
}

test.describe('acceptance: search', () => {
  requireStack();

  test('card search finds the nearby collector without exposing exact coordinates', async ({
    page,
    api,
    privacy,
  }) => {
    test.setTimeout(150_000);
    const area = randomCentre('search');
    const { collector: holder, binder } = await api.seller(
      'acc-holder',
      area,
      [{ code: CODE, extra: { availability: 'SALE', askingPrice: 17.5 } }],
      { displayName: `Hana Holder ${suffix()}` },
    );
    const searcher = await api.collector('acc-searcher', {
      area: besides(area, 2, 17),
      radiusKm: 10,
    });

    const holdersAnswers: HoldersPage[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/search/card-holders') && response.ok()) {
        response
          .json()
          .then((body: HoldersPage) => holdersAnswers.push(body))
          .catch(() => undefined);
      }
    });
    await signIn(page, searcher);

    // Top-bar card search → card detail.
    const search = page.getByRole('banner').getByRole('combobox', { name: 'Search cards' });
    await search.fill('Tidecaller');
    await page
      .getByRole('option', { name: new RegExp(CARD) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1, name: CARD })).toBeVisible();

    // "Who has this near me" → the map's holders list and the holder's marker.
    await page.getByRole('link', { name: 'Who has this near me' }).click();
    await expect(page).toHaveURL(/\/map\?card=[0-9a-f-]{36}&view=list$/);
    const holders = page.getByRole('list', { name: `Holders of ${CARD}` });
    await expect(
      holders.getByRole('button', { name: holder.displayName, exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    const listing = holders.getByRole('list', { name: `Listings of ${holder.displayName}` });
    await expect(listing).toContainText(CODE);
    await expect(listing).toContainText('$17.50');
    await expect(mapMarker(page, holder.displayName)).toBeVisible();

    // The card-holders view with every filter.
    await page.getByRole('link', { name: 'All filters' }).click();
    await expect(page).toHaveURL(/\/search\?card=[0-9a-f-]{36}$/);
    const row = page
      .getByRole('list', { name: 'Card holders near you' })
      .getByRole('article', { name: new RegExp(`^${escapeRegExp(holder.displayName)}`) });
    await expect(row).toContainText('$17.50');
    await expect(row).toContainText(/km/);
    await expect(row.getByRole('link', { name: 'View binder' })).toHaveAttribute(
      'href',
      `/binders/${binder.id}`,
    );

    // Unified search by printing code resolves the card and lists the nearby holder.
    await page.goto(`/search?q=${CODE}`);
    await expect(page.getByRole('heading', { name: new RegExp(`Who has ${CARD}`) })).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Nearby holders' })
        .getByRole('link', { name: holder.displayName }),
    ).toBeVisible();

    // The holder was located by the derived public point only.
    const seen = holdersAnswers
      .flatMap((answer) => answer.items)
      .map((item) => item.collector)
      .filter((collector) => collector?.handle === holder.handle);
    expect(seen.length, 'the card-holders answer listed the holder').toBeGreaterThan(0);
    for (const collector of seen) {
      if (collector?.publicPoint) {
        expect(collector.publicPoint).not.toEqual(area);
      }
    }
    await privacy.settle();
    expect(privacy.checkedCoordinates, 'the search delivered coordinates to check').toBeGreaterThan(
      0,
    );
  });
});
