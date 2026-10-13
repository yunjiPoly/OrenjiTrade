import type { Page } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  apiListCopy,
  apiPublicBinder,
  createOnboardedCollector,
  openTab,
  PLACE_LABELS,
  PLACES,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/** A word no seed or other spec uses, for names that must match exactly one collector. */
function word(): string {
  return `Rg${Math.random().toString(36).slice(2, 8)}`;
}

/** The chunks of the region drawings the page downloaded, by region. */
function watchDrawings(page: Page): string[] {
  const loaded: string[] = [];
  page.on('request', (request) => {
    const match =
      /\/_expo\/static\/js\/web\/(americas-north|americas-south|europe)-[0-9a-f]+\.js/.exec(
        request.url()
      );
    if (match?.[1]) {
      loaded.push(match[1]);
    }
  });
  return loaded;
}

/**
 * Regions on the phone (stage M9, ADR 0017): the region switcher, the region map drawn from the
 * app's own files, the list of states and provinces and the public binders of one of them,
 * against the real isolated stack. Counts depend on what other specs publish in a region, so the
 * specs look for their own collectors and binders. No map provider is ever asked and no API
 * answer carries a coordinate (the privacy fixture fails the test otherwise).
 */
test.describe('mobile regions and the region map', () => {
  requireStack();

  test('a state opens from the map and from the list; its binders name the owner and the state, never a city; a binder opens', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const token = word();
    // A Wyoming collector who shows their city on their own profile: it must stay there.
    const owner = await createOnboardedCollector(request, 'rgown', `${token} Owner`, {
      location: { ...PLACES.wyoming, city: 'Cheyenne', showCity: true },
      discoverable: true,
    });
    const binderName = `${token} trade binder`;
    const binderId = await apiPublicBinder(request, owner, binderName);
    await apiListCopy(
      request,
      owner,
      binderId,
      await printingIdOf(request, owner.idToken, 'PFT-002'),
      12
    );
    const viewer = await createOnboardedCollector(request, 'rgview', 'Mobile Mapper', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const drawings = watchDrawings(page);
    await signInThroughUi(page, viewer.email, viewer.password);

    // The Map tab: the home region, drawn from its own chunk only.
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-title')).toHaveText('Binders in Americas (North)', {
      timeout: 30_000,
    });
    await expect(map.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible();
    await expect(map.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });
    const wyoming = map.getByTestId('map-shape-US-WY');
    await expect(wyoming).toBeVisible({ timeout: 30_000 });
    expect(drawings).toEqual(['americas-north']);

    // From the map: Wyoming is a rectangle, the middle of its shape is Wyoming.
    const box = await wyoming.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const place = screen(page, 'place');
    await expect(place.getByTestId('place-title')).toHaveText(PLACE_LABELS.wyoming, {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/regions\/americas-north\/US-WY$/);
    await expect(place.getByTestId('place-count')).toHaveText(/^\d+ public binders?$/);
    const row = place.getByTestId(`place-binder-${binderId}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(binderName);
    await expect(row).toContainText('Trade binder · 1 card');
    await expect(place.getByTestId(`place-binder-owner-${binderId}`)).toHaveText(
      `${token} Owner @${owner.handle}`
    );
    await expect(place.getByTestId(`place-binder-place-${binderId}`)).toHaveText(
      PLACE_LABELS.wyoming
    );
    await expect(place.getByTestId(`place-binder-updated-${binderId}`)).toHaveText(/^Updated /);
    // The state or province and the country, never the owner's city, never a distance.
    await expect(place).not.toContainText('Cheyenne');
    await expect(place).not.toContainText(/\bkm\b|away/);
    await expect(row).toHaveAttribute(
      'aria-label',
      new RegExp(
        `^${binderName}, Trade binder, 1 card, by ${token} Owner, @${owner.handle}, ${PLACE_LABELS.wyoming}, Updated `
      )
    );

    // The binder opens; back to the state, back to the map, which outlines the state.
    await row.click();
    const binder = screen(page, 'binder');
    await expect(binder.getByText(binderName).first()).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(screen(page, 'place').getByTestId(`place-binder-${binderId}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.goBack();
    const back = screen(page, 'map');
    await expect(back.getByTestId('map-selected-US-WY')).toBeVisible({ timeout: 30_000 });

    // From the list: every place with its count, as links with a name.
    await back.getByRole('tab', { name: 'List' }).click();
    await expect(back.getByTestId('place-list')).toBeVisible({ timeout: 30_000 });
    await expect(back.getByTestId('region-map')).toHaveCount(0);
    await back.getByLabel('Find a state or province').fill('wyo');
    const listed = back.getByTestId('place-row-US-WY');
    await expect(listed).toHaveAttribute('aria-label', /^Wyoming, \d+ public binders?$/);
    await expect(back.getByTestId('place-row-CA-QC')).toHaveCount(0);
    await listed.click();
    await expect(screen(page, 'place').getByTestId(`place-binder-${binderId}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.goBack();

    // A state without a public binder says so (no spec and no seed puts a collector in Alaska).
    const list = screen(page, 'map');
    await list.getByLabel('Find a state or province').fill('alaska');
    await expect(list.getByTestId('place-row-US-AK')).toHaveAttribute(
      'aria-label',
      'Alaska, No public binders'
    );
    await list.getByTestId('place-row-US-AK').click();
    const empty = screen(page, 'place');
    await expect(empty.getByTestId('place-title')).toHaveText('Alaska, United States', {
      timeout: 30_000,
    });
    await expect(empty.getByTestId('place-empty')).toContainText('No public binders here yet');
    await expect(empty.getByTestId('place-count')).toHaveText('No public binders');

    // The view is remembered: the tab is still on its list after the visit.
    await page.goBack();
    await expect(screen(page, 'map').getByTestId('place-list')).toBeVisible({ timeout: 30_000 });
    // Only the region on screen was ever downloaded.
    expect(drawings).toEqual(['americas-north']);
  });

  test("the region switcher re-scopes search and the map, and says when the region is not the collector's own", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const token = word();
    const abroad = await createOnboardedCollector(request, 'rgabr', `${token} Abroad`, {
      location: PLACES.brittany,
      discoverable: true,
    });
    const binderId = await apiPublicBinder(request, abroad, `${token} Breton binder`);
    await apiListCopy(
      request,
      abroad,
      binderId,
      await printingIdOf(request, abroad.idToken, 'PFT-002'),
      9
    );
    const viewer = await createOnboardedCollector(request, 'rgsw', 'Mobile Traveller', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const drawings = watchDrawings(page);
    await signInThroughUi(page, viewer.email, viewer.password);
    await expect(screen(page, 'map').getByTestId('map-title')).toHaveText(
      'Binders in Americas (North)',
      { timeout: 30_000 }
    );

    // Search in the home region: the Breton collector is not there.
    await openTab(page, 'Search');
    const search = screen(page, 'search');
    await expect(search.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });
    await search.getByRole('tab', { name: 'Collectors' }).click();
    await expect(search.getByText('Who trades in your region?')).toBeVisible({ timeout: 30_000 });
    await search.getByLabel('Find a collector').fill(token);
    await expect(search.getByTestId('search-collectors-empty')).toBeVisible({ timeout: 30_000 });

    // The switcher: a sheet with the three regions, the home one marked.
    const asked = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('/api/v1/search?') && candidate.url().includes('region=europe')
    );
    await search.getByTestId('search-region').click();
    await expect(page.getByTestId('search-region-option-americas-north')).toContainText(
      'Your region'
    );
    await expect(page.getByRole('radio')).toHaveText([
      /Americas \(North\)/,
      /Americas \(South\)/,
      /Europe/,
    ]);
    await page.getByTestId('search-region-option-europe').click();
    const url = new URL((await asked).url());
    expect(url.searchParams.get('q')).toBe(token);
    expect(url.searchParams.get('region')).toBe('europe');
    // The same search, in Europe now: the Breton collector, with their state.
    const row = search.getByTestId(`collector-result-${abroad.handle}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(PLACE_LABELS.brittany);
    // At a glance: the switcher names Europe and says it is not the collector's region.
    await expect(search.getByRole('button', { name: 'Region: Europe' })).toBeVisible();
    await expect(search.getByTestId('search-region-away')).toContainText('Not your region');

    // The binders segment follows too.
    await search.getByRole('tab', { name: 'Binders' }).click();
    await search.getByLabel('Find a public binder').fill(token);
    await expect(search.getByTestId(`binder-result-${binderId}`)).toBeVisible({ timeout: 30_000 });

    // The map follows: Europe, its own drawing, Brittany shaded.
    await openTab(page, 'Map');
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-title')).toHaveText('Binders in Europe', { timeout: 30_000 });
    await expect(map.getByTestId('map-status')).toHaveText(/^\d+ public binders? in Europe$/, {
      timeout: 30_000,
    });
    await expect(map.getByTestId('map-shape-FR-BRE')).toBeVisible({ timeout: 30_000 });
    await expect(map.getByTestId('map-shape-CA-QC')).toHaveCount(0);
    await expect(map.getByTestId('map-region-away')).toContainText('Not your region');
    expect(drawings).toEqual(['americas-north', 'europe']);

    // The map's zoom buttons (a pinch on a phone): closer, then the whole region again.
    const frame = () => map.getByTestId('map-drawing').getAttribute('viewBox');
    const whole = await frame();
    await map.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(frame).not.toBe(whole);
    await map.getByRole('button', { name: 'Show the whole region' }).click();
    await expect.poll(frame).toBe(whole);

    // One press goes home; search and the map are back in the collector's region.
    await map.getByRole('button', { name: 'Back to Americas (North)' }).click();
    await expect(map.getByTestId('map-title')).toHaveText('Binders in Americas (North)');
    await expect(map.getByTestId('map-region-away')).toHaveCount(0);
    await openTab(page, 'Search');
    await expect(
      screen(page, 'search').getByRole('button', { name: 'Region: Americas (North)' })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('a link opens the tab on a region and one of its states; a new visit starts in the home region', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const token = word();
    const abroad = await createOnboardedCollector(request, 'rglnk', `${token} Linked`, {
      location: PLACES.montevideo,
      discoverable: true,
    });
    const binderId = await apiPublicBinder(request, abroad, `${token} Uruguayan binder`);
    await apiListCopy(
      request,
      abroad,
      binderId,
      await printingIdOf(request, abroad.idToken, 'PFT-002'),
      7
    );
    const viewer = await createOnboardedCollector(request, 'rglv', 'Mobile Linker', {
      location: PLACES.quebec,
      discoverable: true,
    });
    await signInThroughUi(page, viewer.email, viewer.password);
    await expect(screen(page, 'map').getByTestId('map-title')).toHaveText(
      'Binders in Americas (North)',
      { timeout: 30_000 }
    );

    // Inside the running app (a tapped link, a notification). The tab follows the link at once
    // (the address becomes the state's), so the link is opened here rather than with `openInApp`,
    // which waits on the address it pushed.
    await page.evaluate(() => {
      window.history.pushState(null, '', '/?region=americas-south&subdivision=uy-mo');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    const place = screen(page, 'place');
    await expect(place.getByTestId('place-title')).toHaveText(PLACE_LABELS.montevideo, {
      timeout: 30_000,
    });
    await expect(place.getByTestId(`place-binder-${binderId}`)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/regions\/americas-south\/UY-MO$/);
    await page.goBack();
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-title')).toHaveText('Binders in Americas (South)', {
      timeout: 30_000,
    });
    await expect(map.getByTestId('map-selected-UY-MO')).toBeVisible({ timeout: 30_000 });
    await expect(map.getByTestId('map-region-away')).toContainText('Not your region');

    // As a full page load (a link opened from outside the app): the region alone.
    await page.goto('/?region=europe');
    const linked = screen(page, 'map');
    await expect(linked.getByTestId('map-title')).toHaveText('Binders in Europe', {
      timeout: 30_000,
    });
    await expect(linked.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });

    // A new visit without a link starts in the collector's own region again.
    await page.goto('/');
    await expect(screen(page, 'map').getByTestId('map-title')).toHaveText(
      'Binders in Americas (North)',
      { timeout: 30_000 }
    );
  });
});
