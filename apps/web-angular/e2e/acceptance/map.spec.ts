import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { escapeRegExp, expect, openState, signIn, stateBinder, test } from './support/fixtures';
import { cityToken, placeOf } from './support/places';

/**
 * Acceptance — map (spec § 50, ADR 0017): collector A declares a state (and a city), turns on
 * "Show me on the map" and publishes a binder from the inventory page; collector B opens the map in
 * another browser: A's state is shaded with a binder count, the state's panel lists A's binder with
 * A's handle (never the city), B opens A's full profile (the city is shown there, by A's choice)
 * and A's public binder. No coordinate, distance or map-provider call reaches B, and no DOM
 * attribute carries a coordinate.
 */
test.describe('acceptance: map', () => {
  requireStack();

  test('A publishes; B finds A by state on the map, opens the profile and the binder', async ({
    page,
    api,
    actors,
    privacy,
  }) => {
    test.setTimeout(180_000);
    const city = cityToken();
    const place = placeOf('map', city);
    const a = await api.collector('acc-mapa', {
      place,
      displayName: `Ari Publisher ${suffix()}`,
    });
    const binder = await api.binder(a, {
      name: `Acceptance map binder ${suffix()}`,
      kind: 'SALE',
      description: 'Fictional binder for the acceptance suite.',
    });
    await api.item(a, 'AZR-EN011', {
      binderId: binder.id,
      availability: 'SALE',
      askingPrice: 12,
      acceptsOffers: true,
      visibility: 'PUBLIC',
    });
    const b = await api.collector('acc-mapb', {
      place: placeOf('registration'),
      displayName: `Bo Explorer ${suffix()}`,
    });

    // --- A publishes: visible on the map, binder public -----------------------------------------
    await signIn(page, a);
    await page.goto('/settings/privacy');
    const discoverable = page.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');
    await discoverable.click();
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByText(/Collectors see you in/)).toContainText(place.label);
    await page.goto(`/inventory?binder=${binder.id}`);
    await page.getByRole('button', { name: `Publish ${binder.name}` }).click();
    await page.getByRole('menuitem', { name: 'Public until disabled' }).click();
    await expect(
      page.getByText(`“${binder.name}” is public until you make it private.`),
    ).toBeVisible();
    api.trackPublished(a, binder.id);

    // --- B opens the map: A's state is shaded, its panel lists A's binder --------------------------
    const pageB = await actors.anonymous();
    await signIn(pageB, b);
    await pageB.goto('/map');
    await expect(pageB).toHaveURL(/\/map\?region=americas-north$/);
    const shape = pageB.locator(`.leaflet-overlay-pane path[data-code="${place.subdivisionCode}"]`);
    await expect(shape).toBeAttached({ timeout: 20_000 });
    await expect
      .poll(async () => Number(await shape.getAttribute('fill-opacity')), {
        message: "A's state is shaded",
      })
      .toBeLessThan(1);
    await expect(pageB.locator('.leaflet-tile-pane img')).toHaveCount(0);
    expect(await privacy.scanDom(pageB), 'DOM attributes checked').toBeGreaterThan(100);

    const panel = await openState(pageB, place);
    const card = stateBinder(panel, binder.name);
    await expect(card).toBeVisible();
    await expect(card).toContainText(`@${a.handle}`);
    await expect(panel).not.toContainText(city);
    await expect(panel).not.toContainText(/\bkm\b/);
    await privacy.scanDom(pageB);

    // Full profile (the city, shown by A's choice), then the public binder.
    await card.getByRole('link', { name: new RegExp(escapeRegExp(a.displayName)) }).click();
    await expect(pageB).toHaveURL(new RegExp(`/collectors/${escapeRegExp(a.handle)}$`));
    await expect(pageB.getByRole('heading', { level: 1, name: a.displayName })).toBeVisible();
    await expect(pageB.getByTestId('collector-public-label')).toContainText(place.label);
    await expect(pageB.getByTestId('collector-city')).toHaveText(city);
    await privacy.scanDom(pageB);
    await pageB.getByRole('link', { name: 'View public binder' }).click();
    await expect(pageB).toHaveURL(new RegExp(`/binders/${binder.id}$`));
    await expect(pageB.getByRole('heading', { level: 1, name: binder.name })).toBeVisible();
    await expect(pageB.getByRole('main')).toContainText('Lantern Fox Spirit');
    await expect(pageB.getByTestId('owner-public-label')).toContainText(place.label);
    await expect(pageB.getByRole('main')).not.toContainText(city);

    await privacy.settle();
    expect(privacy.checkedPlaces, 'the map delivered public places to check').toBeGreaterThan(0);
  });
});
