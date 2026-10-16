import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiListItem,
  apiPublicBinder,
  authHeader,
  cardOfPrinting,
  createOnboardedCollector,
  openTab,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

const HOLDERS = '/api/v1/search/card-holders?';

/**
 * Who has this card, the one card page (stage R5, owner spec 2026-10-14, section 8, mockup screen
 * 13), against the real isolated stack: the card search while typing opens it; the holders of the
 * browsed region come grouped by state or province, the collector's own first; a deck core's cards
 * show as the core in "Also in a deck core", never as rows; Message opens the chat with that card
 * pinned and the buying tip. States only, never a city, a distance or a count. The whole region is
 * listed (other specs list the same seed card), so the spec follows its own items.
 */
test.describe('mobile who has this card', () => {
  requireStack();

  test('typing a card opens its page: holders by province, the deck core banner, Message pins the card', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const suffix = Math.random().toString(36).slice(2, 7);
    const near = await createOnboardedCollector(request, 'whqc', `Mobile Near ${suffix}`, {
      location: PLACES.quebec,
      discoverable: true,
    });
    const far = await createOnboardedCollector(request, 'whwy', `Mobile Far ${suffix}`, {
      location: { ...PLACES.wyoming, city: 'Zqholdcity' },
      discoverable: true,
    });
    const seller = await createOnboardedCollector(request, 'whcore', `Mobile Core ${suffix}`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    const viewer = await createOnboardedCollector(request, 'whview', `Mobile Hunter ${suffix}`, {
      location: PLACES.quebec,
      discoverable: true,
    });
    const { cardId, printingId, cardName } = await cardOfPrinting(request, near.idToken, 'PFT-002');
    const nearItem = await apiListItem(
      request,
      near,
      await apiPublicBinder(request, near, `Near binder ${suffix}`),
      printingId,
      { askingPriceText: '85% TCG', quantity: 2 }
    );
    const farItem = await apiListItem(
      request,
      far,
      await apiPublicBinder(request, far, `Far binder ${suffix}`),
      printingId,
      { askingPriceText: '$45' }
    );
    // A public card filed in a public deck core: it sells only with the core.
    const coreName = `Fox core ${suffix}`;
    const created = await request.post(`${API_URL}/api/v1/binders`, {
      headers: authHeader(seller.idToken),
      data: { name: coreName, visibility: 'PUBLIC', sellsAsCore: true, askingPriceText: '$95' },
    });
    expect(created.status(), 'POST /binders (deck core)').toBe(201);
    const coreId = ((await created.json()) as { id: string }).id;
    const inCore = await apiListItem(request, seller, coreId, printingId, {
      visibility: 'PUBLIC',
    });

    await signInThroughUi(page, viewer.email, viewer.password);
    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByRole('search', { name: /Card name or code/ }).click({ timeout: 30_000 });
    await search.getByLabel('Card name or code').fill('PFT-002');
    await search.getByTestId(`search-result-${cardId}`).click({ timeout: 30_000 });

    // The card page: the request names the card, the province grouping, the region, and leaves
    // the deck core's cards out.
    const asked = page.waitForRequest((candidate) => candidate.url().includes(HOLDERS));
    const card = screen(page, 'card');
    await expect(card.getByTestId('card-name')).toHaveText(cardName, { timeout: 30_000 });
    const url = new URL((await asked).url());
    expect(url.searchParams.get('cardId')).toBe(cardId);
    expect(url.searchParams.get('sort')).toBe('province');
    expect(url.searchParams.get('excludeDeckCoreItems')).toBe('true');
    expect(url.searchParams.get('region')).toBe('americas-north');
    await expect(card.getByRole('link', { name: /Check the TCGplayer price/ })).toBeVisible();

    // The collector's own province first; the far holder under their state; never a city.
    await expect(card.getByTestId('holders-group-CA-QC')).toHaveText('Quebec · your province', {
      timeout: 30_000,
    });
    const nearRow = card.getByTestId(`holder-${nearItem.id}`);
    await expect(nearRow).toContainText(near.handle);
    await expect(card.getByTestId(`holder-${nearItem.id}-price`)).toHaveText('85% TCG');
    await expect(nearRow).toContainText('×2');
    await expect(card.getByTestId('holders-group-US-WY')).toHaveText('Wyoming');
    const farRow = card.getByTestId(`holder-${farItem.id}`);
    await expect(farRow).toBeVisible();
    await expect(card).not.toContainText('Zqholdcity');
    await expect(card).not.toContainText(/\bkm\b|away|\d+ (holders?|listings?)/);
    const quebecTop = (await card.getByTestId('holders-group-CA-QC').boundingBox())?.y ?? 0;
    const wyomingTop = (await card.getByTestId('holders-group-US-WY').boundingBox())?.y ?? 0;
    expect(quebecTop).toBeLessThan(wyomingTop);

    // The deck core: in the banner, never a row.
    await expect(card.getByTestId(`card-deck-core-${coreId}`)).toContainText(
      `${coreName} · ${seller.handle} · Ontario · $95`
    );
    await expect(card.getByTestId(`holder-${inCore.id}`)).toHaveCount(0);

    // Message on the far holder's row: the chat with that card pinned and the buying tip.
    await card.getByRole('button', { name: `Message ${far.handle}` }).click();
    const chat = screen(page, 'conversation');
    const bar = chat.getByTestId('pinned-bar');
    await expect(bar.getByTestId('pinned-name')).toHaveText(cardName, { timeout: 30_000 });
    await expect(bar.getByTestId('pinned-price')).toHaveText('$45');
    await expect(chat.getByTestId('chat-safety-tip-text')).toHaveText(
      'Check their rating before you send an e-Transfer, and ask for tracking.'
    );
  });

  test('the old card holders links land on the card page, a printing through its card', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const viewer = await createOnboardedCollector(request, 'whlink', 'Mobile Old Link', {
      location: PLACES.quebec,
    });
    const { cardId, printingId, cardName } = await cardOfPrinting(
      request,
      viewer.idToken,
      'PFT-002'
    );
    await signInThroughUi(page, viewer.email, viewer.password);
    await expect(screen(page, 'search')).toBeVisible({ timeout: 30_000 });
    for (const link of [`/holders?card=${cardId}`, `/holders?printing=${printingId}`]) {
      await page.evaluate((target) => {
        window.history.pushState(null, '', target);
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      }, link);
      await expect(screen(page, 'card').getByTestId('card-name')).toHaveText(cardName, {
        timeout: 30_000,
      });
      await expect(page).toHaveURL(new RegExp(`/cards/${cardId}`));
    }
    await expect(screen(page, 'card').getByTestId('card-printing')).toContainText('PFT-002');
  });
});
