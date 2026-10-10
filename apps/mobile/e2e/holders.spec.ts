import { expect, test } from './support/fixtures';
import {
  apiListItem,
  apiPublicBinder,
  cardOfPrinting,
  createOnboardedCollector,
  openInApp,
  PLACE_LABELS,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

const HOLDERS = '/api/v1/search/card-holders?';

/**
 * "Who has this in my region" as a list (stage M7, the web's card-holders view on
 * `GET /search/card-holders`): from the card detail, the public copies of the card held by
 * collectors of the viewer's home region (ADR 0017), with the sort and every filter of the web;
 * holders show their state or province only, never a distance or a position. The whole region is
 * listed, so the spec follows its own items (never counts).
 */
test.describe('mobile card holders', () => {
  requireStack();

  test('the card detail lists the holders of my region with sort and filters, states only', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const holder = await createOnboardedCollector(request, 'hold', 'Mobile Holder', {
      location: { ...PLACES.wyoming, city: 'Zqholdcity' },
      discoverable: true,
    });
    const viewer = await createOnboardedCollector(request, 'hview', 'Mobile Hunter', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const { cardId, printingId, cardName } = await cardOfPrinting(
      request,
      holder.idToken,
      'PFT-002'
    );
    const binderId = await apiPublicBinder(request, holder, 'Mobile holders binder');
    const offers = await apiListItem(request, holder, binderId, printingId, {
      condition: 'NEAR_MINT',
      availability: 'TRADE_OR_SALE',
      askingPrice: 45,
      acceptsOffers: true,
    });
    const cheap = await apiListItem(request, holder, binderId, printingId, {
      condition: 'LIGHTLY_PLAYED',
      availability: 'SALE',
      askingPrice: 20,
      acceptsOffers: false,
    });
    await signInThroughUi(page, viewer.email, viewer.password);

    await openInApp(page, `/cards/${cardId}`);
    const card = screen(page, 'card');
    await expect(card.getByTestId('card-name')).toHaveText(cardName, { timeout: 30_000 });
    const first = page.waitForRequest((candidate) => candidate.url().includes(HOLDERS));
    await expect(card.getByRole('button', { name: 'Show on the map' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Who has this in my region' }).click();
    // The request names the card, the sort and the home region, never a position.
    const firstUrl = new URL((await first).url());
    expect(firstUrl.searchParams.get('cardId')).toBe(cardId);
    expect(firstUrl.searchParams.get('sort')).toBe('freshness');
    expect(firstUrl.searchParams.get('region')).toBe('americas-north');
    expect(firstUrl.searchParams.has('lat')).toBe(false);

    const holders = screen(page, 'holders');
    await expect(holders.getByTestId('holders-title')).toHaveText(
      `Who has ${cardName} in your region`,
      { timeout: 30_000 }
    );
    await expect(holders.getByTestId('holders-count')).toHaveText(/listings? in your region/, {
      timeout: 30_000,
    });
    const offersRow = holders.getByTestId(`holder-${offers.id}`);
    const cheapRow = holders.getByTestId(`holder-${cheap.id}`);
    await expect(offersRow).toBeVisible();
    await expect(cheapRow).toBeVisible();
    await expect(offersRow).toContainText('Offers');
    await expect(offersRow).toContainText('NM');
    await expect(offersRow.getByTestId(`holder-${offers.id}-price`)).toContainText('45');
    await expect(cheapRow).toContainText('LP');
    await expect(cheapRow).not.toContainText('Offers');
    await expect(offersRow.getByTestId(`holder-${offers.id}-collector`)).toContainText(
      'Mobile Holder'
    );
    // The holder's state, never their city (profile only) or a distance.
    await expect(offersRow.getByTestId(`holder-${offers.id}-collector`)).toContainText(
      PLACE_LABELS.wyoming
    );
    await expect(offersRow).not.toContainText('Zqholdcity');
    await expect(offersRow).not.toContainText(/\bkm\b|away/);
    await expect(offersRow.getByRole('button', { name: 'View binder' })).toBeVisible();
    await expect(offersRow.getByRole('button', { name: 'Make an offer' })).toBeVisible();

    // Sort by price: the cheaper copy first.
    const byPrice = page.waitForRequest(
      (candidate) => candidate.url().includes(HOLDERS) && candidate.url().includes('sort=price')
    );
    await holders.getByTestId('holders-sort').click();
    await page.getByTestId('holders-sort-option-price').click();
    await byPrice;
    await expect
      .poll(async () => {
        const [top, bottom] = await Promise.all([cheapRow.boundingBox(), offersRow.boundingBox()]);
        return top && bottom ? top.y < bottom.y : null;
      })
      .toBe(true);

    // Accepts offers only.
    await holders.getByRole('button', { name: 'Filters' }).click();
    const sheet = page.getByTestId('holder-filters');
    const withOffers = page.waitForRequest(
      (candidate) =>
        candidate.url().includes(HOLDERS) && candidate.url().includes('acceptsOffers=true')
    );
    await sheet.getByTestId('holder-accepts-offers').click();
    await withOffers;
    await sheet.getByRole('button', { name: 'Show results' }).click();
    await expect(holders.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
    await expect(offersRow).toBeVisible({ timeout: 30_000 });
    await expect(cheapRow).toHaveCount(0);

    // A price range: validated in the sheet, then sent; the availability and condition filters.
    await holders.getByRole('button', { name: 'Filters (1)' }).click();
    await sheet.getByLabel('Min price').fill('30');
    await sheet.getByLabel('Max price').fill('10');
    await sheet.getByLabel('Max price').blur();
    await expect(sheet.getByTestId('holder-price-range-error')).toHaveText(
      'The minimum price must not be above the maximum.'
    );
    const ranged = page.waitForRequest(
      (candidate) =>
        candidate.url().includes(HOLDERS) &&
        candidate.url().includes('minPrice=30') &&
        candidate.url().includes('maxPrice=50')
    );
    await sheet.getByLabel('Max price').fill('50');
    await sheet.getByLabel('Max price').blur();
    await ranged;
    await expect(sheet.getByTestId('holder-price-range-error')).toHaveCount(0);
    const conditioned = page.waitForRequest(
      (candidate) =>
        candidate.url().includes(HOLDERS) &&
        candidate.url().includes('availability=SALE') &&
        candidate.url().includes('condition=LIGHTLY_PLAYED')
    );
    await sheet.getByTestId('holder-availability-SALE').click();
    await sheet.getByTestId('holder-condition-LIGHTLY_PLAYED').click();
    await conditioned;
    await sheet.getByRole('button', { name: 'Show results' }).click();
    await expect(holders.getByRole('button', { name: 'Filters (5)' })).toBeVisible();
    // None of the holder's copies is lightly played, for sale and open to offers above 30 CAD.
    await expect(offersRow).toHaveCount(0, { timeout: 30_000 });
    await expect(cheapRow).toHaveCount(0);
    await holders.getByRole('button', { name: 'Filters (5)' }).click();
    await page.getByTestId('holder-filters-clear').click();
    await page.getByTestId('holder-filters-done').click();
    await expect(holders.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
    await expect(offersRow).toBeVisible({ timeout: 30_000 });
    await expect(cheapRow).toBeVisible();

    // The holder's profile from the row: their state and, shown there only, their city.
    await offersRow.getByTestId(`holder-${offers.id}-collector`).click();
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText('Mobile Holder', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-location')).toHaveText(
      `Zqholdcity, ${PLACE_LABELS.wyoming}`
    );
  });
});
