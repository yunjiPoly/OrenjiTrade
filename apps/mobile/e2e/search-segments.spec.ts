import { expect, test } from './support/fixtures';
import {
  apiListCopy,
  apiPublicBinder,
  apiUpdatePrivacy,
  createOnboardedCollector,
  nearArea,
  openTab,
  printingIdOf,
  randomRuralArea,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/** A word no seed or other spec uses, for names that must match exactly one collector. */
function word(): string {
  return `Qz${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The Search tab's Collectors and Binders segments (stage M7, the web's `/search` tabs on
 * `GET /search`): collectors on the map who allow name search, by name or handle, with the API's
 * distance bucket only; public binders by name with their owner; recent searches per segment; the
 * rows open the existing profile and public binder screens. The request never carries the
 * viewer's position (the server uses their trading area).
 */
test.describe('mobile search segments', () => {
  requireStack();

  test('collectors by name or handle with approximate distances, public binders by name, recent searches per segment', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const area = randomRuralArea();
    const token = word();
    const neighbour = await createOnboardedCollector(request, 'sneigh', `${token} Neighbour`, {
      area: nearArea(area),
      discoverable: true,
    });
    // On the map, but opted out of name search: never a result.
    const hidden = await createOnboardedCollector(request, 'shid', `${token} Hidden`, {
      area: nearArea(area),
      discoverable: true,
    });
    await apiUpdatePrivacy(request, hidden.idToken, { searchDiscoverable: false });
    const viewer = await createOnboardedCollector(request, 'sview', 'Mobile Seeker', {
      area,
      discoverable: true,
    });
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
    await search.getByRole('tab', { name: 'Collectors' }).click();
    await expect(search.getByTestId('search-collectors-idle')).toBeVisible({ timeout: 30_000 });
    await expect(search.getByText('Who trades near you?')).toBeVisible();

    // By name: the request carries the text and no position.
    const asked = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/api/v1/search?') && candidate.url().includes('types=collectors')
    );
    await search.getByLabel('Find a collector').fill(token);
    const url = new URL((await asked).url());
    expect(url.searchParams.get('q')).toBe(token);
    expect(url.searchParams.has('lat')).toBe(false);
    expect(url.searchParams.has('lng')).toBe(false);
    const row = search.getByTestId(`collector-result-${neighbour.handle}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const count = search.getByTestId('search-collectors-count');
    await expect(count).toContainText(`1 collector for “${token}”`);
    await expect(count).toContainText('Locations are approximate (about 3 km)');
    await expect(row).toContainText(`@${neighbour.handle}`);
    await expect(row).toContainText(/km/);
    await expect(search.getByTestId(`collector-result-${hidden.handle}`)).toHaveCount(0);

    // By handle; a submitted search is remembered (a typed one only once a row is opened).
    await search.getByLabel('Find a collector').fill(neighbour.handle);
    await search.getByLabel('Find a collector').press('Enter');
    await expect(count).toContainText(`1 collector for “${neighbour.handle}”`, {
      timeout: 30_000,
    });
    await expect(row).toBeVisible();

    // No match: the empty state states the rule.
    await search.getByLabel('Find a collector').fill(`${token}zzz`);
    await expect(search.getByTestId('search-collectors-empty')).toBeVisible({ timeout: 30_000 });
    await expect(
      search.getByText('Collectors appear when they are on the map and allow name search.')
    ).toBeVisible();

    // The segment's recent searches come back when the field is emptied, and run again.
    await search.getByLabel('Find a collector').fill('');
    await expect(search.getByTestId('search-collectors-idle')).toBeVisible({ timeout: 30_000 });
    await expect(search.getByTestId(`recent-search-${neighbour.handle}`)).toBeVisible();
    await expect(search.getByTestId(`recent-search-${token}zzz`)).toHaveCount(0);
    await search.getByTestId(`recent-search-${neighbour.handle}`).click();
    await expect(row).toBeVisible({ timeout: 30_000 });

    // The row opens the existing profile screen (and remembers the search).
    await search.getByLabel('Find a collector').fill(token);
    // The previous results stay on screen while the new query loads: wait for its count.
    await expect(count).toContainText(`for “${token}”`, { timeout: 30_000 });
    await expect(row).toBeVisible();
    await row.click();
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(`${token} Neighbour`, {
      timeout: 30_000,
    });
    await page.goBack();
    await screen(page, 'search').getByLabel('Find a collector').fill('');
    await expect(screen(page, 'search').getByTestId(`recent-search-${token}`)).toBeVisible({
      timeout: 30_000,
    });

    // Binders by name: the public binder with its owner; its own recent searches.
    const back = screen(page, 'search');
    await back.getByRole('tab', { name: 'Binders' }).click();
    await expect(back.getByTestId('search-binders-idle')).toBeVisible({ timeout: 30_000 });
    await expect(back.getByText('What is in their binders?')).toBeVisible();
    await expect(back.getByTestId(`recent-search-${token}`)).toHaveCount(0);
    const askedBinders = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/api/v1/search?') && candidate.url().includes('types=binders')
    );
    await back.getByLabel('Find a public binder').fill(`${token} trade`);
    expect(new URL((await askedBinders).url()).searchParams.has('lat')).toBe(false);
    const binder = back.getByTestId(`binder-result-${binderId}`);
    await expect(binder).toBeVisible({ timeout: 30_000 });
    await expect(back.getByTestId('search-binders-count')).toContainText(
      `1 public binder for “${token} trade”`
    );
    await expect(binder).toContainText(`${token} trade binder`);
    await expect(binder).toContainText(`${token} Neighbour`);
    await binder.click();
    const view = screen(page, 'binder');
    await expect(view.getByTestId('public-binder-title')).toHaveText(`${token} trade binder`, {
      timeout: 30_000,
    });
    await expect(view.getByTestId('public-binder-owner')).toContainText(`${token} Neighbour`);
  });
});
