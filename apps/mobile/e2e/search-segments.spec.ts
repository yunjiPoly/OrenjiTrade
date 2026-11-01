import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiListCopy,
  apiPublicBinder,
  apiUpdatePrivacy,
  authHeader,
  createOnboardedCollector,
  openTab,
  PLACES,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/** A word no seed or other spec uses, for names that must match exactly one collector. */
function word(): string {
  return `Qz${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The collectors while a card is typed and Search › Binders (stage R5, owner spec 2026-10-14,
 * section 8, mockup screens 12 and 14), on the real stack: collectors of the region who allow name
 * search, by name or handle, at most three, with their state or province only, never a blocked
 * collector; binders and deck cores of the region by name, handle or key card. The requests name
 * the home region (ADR 0017), never a position; collectors of another region are never listed.
 */
test.describe('mobile search: collectors while typing, binders', () => {
  requireStack();

  test('collectors by name or handle with their state, never a blocked one; binders by name with their owner', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const token = word();
    const neighbour = await createOnboardedCollector(request, 'sneigh', `${token} Neighbour`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    // On the map, but opted out of name search: never a result.
    const hidden = await createOnboardedCollector(request, 'shid', `${token} Hidden`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    await apiUpdatePrivacy(request, hidden.idToken, { searchDiscoverable: false });
    // On the map of another region: never a result of the viewer's region.
    const abroad = await createOnboardedCollector(request, 'sabroad', `${token} Abroad`, {
      location: PLACES.brittany,
      discoverable: true,
    });
    // Blocked by the viewer: never a result either.
    const blocked = await createOnboardedCollector(request, 'sblock', `${token} Blocked`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    const viewer = await createOnboardedCollector(request, 'sview', 'Mobile Seeker', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const block = await request.post(`${API_URL}/api/v1/users/${blocked.id}/block`, {
      headers: authHeader(viewer.idToken),
    });
    expect(block.ok(), 'block').toBeTruthy();
    const binderId = await apiPublicBinder(request, neighbour, `${token} trade binder`);
    await apiListCopy(
      request,
      neighbour,
      binderId,
      await printingIdOf(request, neighbour.idToken, 'PFT-002'),
      12
    );
    await signInThroughUi(page, viewer.email, viewer.password);

    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await search.getByRole('search', { name: /Card name or code/ }).click({ timeout: 30_000 });

    // By name: the request carries the text, the home region and the limit, never a position.
    const asked = page.waitForRequest((candidate) =>
      candidate.url().includes('/api/v1/search/collectors?')
    );
    await search.getByLabel('Card name or code').fill(token);
    const url = new URL((await asked).url());
    expect(url.searchParams.get('q')).toBe(token);
    expect(url.searchParams.get('region')).toBe('americas-north');
    expect(url.searchParams.get('limit')).toBe('3');
    expect(url.searchParams.has('lat')).toBe(false);
    const row = search.getByTestId(`search-collector-${neighbour.handle}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('Ontario');
    await expect(row).not.toContainText(/\bkm\b|away/);
    await expect(search.getByTestId('search-collectors')).toContainText('Collectors');
    await expect(search.getByTestId(`search-collector-${hidden.handle}`)).toHaveCount(0);
    await expect(search.getByTestId(`search-collector-${abroad.handle}`)).toHaveCount(0);
    await expect(search.getByTestId(`search-collector-${blocked.handle}`)).toHaveCount(0);
    // No card of the browsed game (Pokémon, the collector's profile game, stage G) has the token.
    await expect(search.getByTestId('search-no-match')).toContainText(
      `No Pokémon card matches “${token}”`
    );

    // By handle; the row opens the profile, and the search is remembered on this phone.
    const byHandle = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/search/collectors?') &&
        new URL(response.url()).searchParams.get('q') === neighbour.handle
    );
    await search.getByLabel('Card name or code').fill(neighbour.handle);
    await byHandle;
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(`${token} Neighbour`, {
      timeout: 30_000,
    });
    await page.goBack();
    const back = screen(page, 'search');
    await back.getByLabel('Card name or code').fill('');
    await expect(back.getByTestId(`recent-search-${neighbour.handle}`)).toBeVisible({
      timeout: 30_000,
    });

    // Binders by name: the public binder with its owner, in the whole region.
    await back.getByRole('tab', { name: 'Binders', exact: true }).click();
    const askedBinders = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/api/v1/regions/americas-north/binders?') &&
        candidate.url().includes('q=')
    );
    await back.getByLabel('Deck, binder or collector').fill(`${token} trade`);
    expect(new URL((await askedBinders).url()).searchParams.has('lat')).toBe(false);
    const binder = back.getByTestId(`binder-search-row-${binderId}`);
    await expect(binder).toBeVisible({ timeout: 30_000 });
    await expect(binder).toContainText(`${token} trade binder`);
    await expect(binder).toContainText(`${neighbour.handle} · Ontario · 1 card`);
    // By the owner's handle too.
    await back.getByLabel('Deck, binder or collector').fill(neighbour.handle);
    await expect(binder).toBeVisible({ timeout: 30_000 });
    await binder.click();
    const view = screen(page, 'binder');
    await expect(view.getByTestId('public-binder-title')).toHaveText(`${token} trade binder`, {
      timeout: 30_000,
    });
    // The seller row of the redesign (stage R3): the handle and the province.
    await expect(view.getByTestId('public-binder-owner')).toContainText(neighbour.handle);
    await expect(view.getByTestId('public-binder-owner-line')).toHaveText(
      /^Ontario · \d+ public binders?$/
    );
  });
});
