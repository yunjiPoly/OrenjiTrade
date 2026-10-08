import { expect, test } from './support/fixtures';
import {
  apiListItem,
  apiPublicBinder,
  cardOfPrinting,
  createOnboardedCollector,
  nearArea,
  openInApp,
  randomRuralArea,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

const HOLDERS = '/api/v1/search/card-holders?';

/**
 * "Who has this near me" as a list (stage M7, the web's card-holders view on
 * `GET /search/card-holders`): from the card detail, the public copies of the card held by
 * collectors around the viewer's trading area, with the sort and every filter of the web; only
 * places and distance buckets, never metres or coordinates; the map stays the alternative view.
 */
test.describe('mobile card holders', () => {
  requireStack();

  test('the card detail lists the holders near me with sort and filters; the map stays the alternative', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const area = randomRuralArea();
    const holder = await createOnboardedCollector(request, 'hold', 'Mobile Holder', {
      area: nearArea(area),
      discoverable: true,
    });
    const viewer = await createOnboardedCollector(request, 'hview', 'Mobile Hunter', {
      area,
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
    await card.getByRole('button', { name: 'Who has this near me' }).click();
    // The request names the card and the sort, never the viewer's position.
    const firstUrl = new URL((await first).url());
    expect(firstUrl.searchParams.get('cardId')).toBe(cardId);
    expect(firstUrl.searchParams.get('sort')).toBe('distance');
    expect(firstUrl.searchParams.has('lat')).toBe(false);

    const holders = screen(page, 'holders');
    await expect(holders.getByTestId('holders-title')).toHaveText(`Who has ${cardName} near you`, {
      timeout: 30_000,
    });
    await expect(holders.getByTestId('holders-count')).toHaveText('2 listings near you', {
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
    await expect(offersRow.getByTestId(`holder-${offers.id}-collector`)).toContainText(/km/);
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
    await expect(holders.getByTestId('holders-count')).toHaveText('1 listing near you', {
      timeout: 30_000,
    });
    await expect(offersRow).toBeVisible();
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
    // Nothing is both cheap, lightly played, for sale and open to offers above 30 CAD.
    await expect(holders.getByTestId('holders-empty')).toBeVisible({ timeout: 30_000 });
    await expect(holders.getByTestId('holders-count')).toHaveText('0 listings near you');
    await holders.getByRole('button', { name: 'Clear filters' }).click();
    await expect(holders.getByTestId('holders-count')).toHaveText('2 listings near you', {
      timeout: 30_000,
    });
    await expect(holders.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();

    // The holder's profile from the row, then back; the map stays the alternative view.
    await offersRow.getByTestId(`holder-${offers.id}-collector`).click();
    await expect(screen(page, 'collector').getByTestId('collector-name')).toHaveText(
      'Mobile Holder',
      { timeout: 30_000 }
    );
    await page.goBack();
    await screen(page, 'holders').getByRole('button', { name: 'Show on the map' }).click();
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-holders')).toContainText(`Who has ${cardName} near you`, {
      timeout: 30_000,
    });
    await expect(map.getByTestId('map-status')).toHaveText(/1 collector with this card within/, {
      timeout: 30_000,
    });
  });
});
