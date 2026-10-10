import { requireStack } from '../support/stack';
import { recordAnswers } from './support/answers';
import { suffix } from './support/api';
import { escapeRegExp, expect, signIn, test } from './support/fixtures';
import { cityToken, placeOf } from './support/places';

/**
 * Acceptance — search (spec § 50, ADR 0017): a collector searches a card from the top bar, opens
 * it and asks "Who has this in my region": the holder of the same platform region appears in the
 * card-holders view with its price and its state (never a city or a distance), and in the unified
 * search by printing code. Another region does not list it. The privacy scanner checks every
 * response for coordinates, distances and the holder's city.
 */

const CARD = 'Tidecaller Mermaid';
const CODE = 'SHV-EN013';

interface HoldersPage {
  items: { collector?: { handle?: string; place?: { label?: string } } }[];
}

test.describe('acceptance: search', () => {
  requireStack();

  test('card search finds the holder of the region by state, never a city or a distance', async ({
    page,
    api,
    privacy,
  }) => {
    test.setTimeout(150_000);
    const place = placeOf('search', cityToken());
    const { collector: holder, binder } = await api.seller(
      'acc-holder',
      place,
      [{ code: CODE, extra: { availability: 'SALE', askingPrice: 17.5 } }],
      { displayName: `Hana Holder ${suffix()}` },
    );
    const searcher = await api.collector('acc-searcher', { place: placeOf('registration') });

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

    // "Who has this in my region" → the card-holders view with every filter. Its answers are
    // recorded in a route before the page gets them (support/answers.ts): read back from the
    // browser, a body Chromium no longer kept could fail the test under the load of a full run.
    const holdersAnswers = await recordAnswers<HoldersPage>(
      page,
      /\/api\/v1\/search\/card-holders(\?|$)/,
    );
    await page.getByRole('link', { name: 'Who has this in my region' }).click();
    await expect(page).toHaveURL(/\/search\?card=[0-9a-f-]{36}$/);
    const row = page
      .getByRole('list', { name: 'Card holders in your region' })
      .getByRole('article', { name: new RegExp(`^${escapeRegExp(holder.displayName)}`) });
    await expect(row).toContainText('$17.50', { timeout: 20_000 });
    await holdersAnswers.stop();
    await expect(row).toContainText(place.label);
    await expect(row).not.toContainText(/\bkm\b/);
    await expect(row).not.toContainText(place.city ?? '');
    await expect(row.getByRole('link', { name: 'View binder' })).toHaveAttribute(
      'href',
      `/binders/${binder.id}`,
    );

    // Another region does not list the holder.
    await page.getByTestId('region-switcher').click();
    await page.getByRole('menuitemradio', { name: 'Europe' }).click();
    await expect(page.getByText('Collectors in Europe, freshest listings first.')).toBeVisible();
    await expect(row).toBeHidden();

    // Unified search by printing code (back in the home region) lists the holder.
    await page.getByTestId('region-switcher').click();
    await page.getByRole('menuitemradio', { name: /Americas \(North\)/ }).click();
    await page.goto(`/search?q=${CODE}`);
    await expect(page.getByRole('heading', { name: new RegExp(`Who has ${CARD}`) })).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Holders in your region' })
        .getByRole('link', { name: holder.displayName }),
    ).toBeVisible();

    // The holder was described by state and country only.
    const seen = holdersAnswers.received
      .flatMap(({ body }) => body.items)
      .map((item) => item.collector)
      .filter((collector) => collector?.handle === holder.handle);
    expect(seen.length, 'the card-holders answer listed the holder').toBeGreaterThan(0);
    for (const collector of seen) {
      expect(collector?.place?.label).toBe(place.label);
    }
    await privacy.settle();
    expect(privacy.checkedPlaces, 'the search delivered public places to check').toBeGreaterThan(0);
  });
});
