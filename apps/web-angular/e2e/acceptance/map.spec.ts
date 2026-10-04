import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { escapeRegExp, expect, mapMarker, signIn, test } from './support/fixtures';
import { besides, randomCentre } from './support/places';
import { Point } from './support/privacy';

/**
 * Acceptance — map (spec § 50): collector A publishes (turns on "Show me on the map" and publishes
 * a binder from the inventory page); collector B opens the map in another browser, where A appears
 * at an approximate position (the derived public point, never A's stored centre); B clicks A's
 * marker, reads the preview, opens A's full profile and A's public binder.
 */

interface NearbyAnswer {
  center: Point;
  collectors: { handle: string; publicPoint: Point; distance?: string | null }[];
}

test.describe('acceptance: map', () => {
  requireStack();

  test('A publishes; B finds A approximately on the map, previews, opens the profile and binder', async ({
    page,
    api,
    actors,
    privacy,
  }) => {
    test.setTimeout(180_000);
    const area = randomCentre('map');
    const a = await api.collector('acc-mapa', {
      area,
      radiusKm: 5,
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
      area: besides(area),
      radiusKm: 10,
      displayName: `Bo Explorer ${suffix()}`,
    });

    // --- A publishes: visible on the map, binder public -----------------------------------------
    await signIn(page, a);
    await page.goto('/settings/privacy');
    const discoverable = page.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');
    await discoverable.click();
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByText(/Collectors see you near/)).toContainText(a.areaLabel ?? '');
    await page.goto(`/inventory?binder=${binder.id}`);
    await page.getByRole('button', { name: `Publish ${binder.name}` }).click();
    await page.getByRole('menuitem', { name: 'Public until disabled' }).click();
    await expect(
      page.getByText(`“${binder.name}” is public until you make it private.`),
    ).toBeVisible();
    api.trackPublished(a, binder.id);

    // --- B opens the map ---------------------------------------------------------------------------
    const pageB = await actors.anonymous();
    const answers: NearbyAnswer[] = [];
    pageB.on('response', (response) => {
      if (response.url().includes('/api/v1/collectors/nearby') && response.ok()) {
        response
          .json()
          .then((body: NearbyAnswer) => answers.push(body))
          .catch(() => undefined);
      }
    });
    await signIn(pageB, b);
    await expect(pageB).toHaveURL(/\/map$/);
    await expect(
      pageB.getByText('Locations are approximate (about 2 km) to protect privacy'),
    ).toBeVisible();
    const markerA = mapMarker(pageB, a.displayName);
    await expect(markerA).toBeVisible({ timeout: 20_000 });

    // A appears approximately: the derived public point, about a grid cell from A's centre.
    await expect
      .poll(() => answers.find((answer) => answer.collectors.some((c) => c.handle === a.handle)))
      .toBeTruthy();
    const answer = answers.find((candidate) =>
      candidate.collectors.some((c) => c.handle === a.handle),
    )!;
    const shown = answer.collectors.find((collector) => collector.handle === a.handle)!;
    expect(shown.publicPoint).not.toEqual(area);
    expect(Math.abs(shown.publicPoint.lat - area.lat)).toBeLessThan(0.02);
    expect(Math.abs(shown.publicPoint.lng - area.lng)).toBeLessThan(0.03);
    expect(answer.center).not.toEqual(b.area);

    // Marker click → preview.
    await markerA.click();
    const preview = pageB.getByRole('dialog', { name: a.displayName });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(`@${a.handle}`);
    await expect(preview.getByTestId('preview-distance')).toContainText(/km away/);
    await expect(preview.getByTestId('preview-freshness')).toContainText(
      '1 public binder · 1 card',
    );
    await expect(preview.getByRole('link', { name: 'View public binder' })).toHaveAttribute(
      'href',
      `/binders/${binder.id}`,
    );

    // Full profile, then the public binder.
    await preview.getByRole('link', { name: 'View profile' }).click();
    await expect(pageB).toHaveURL(new RegExp(`/collectors/${escapeRegExp(a.handle)}$`));
    await expect(pageB.getByRole('heading', { level: 1, name: a.displayName })).toBeVisible();
    await expect(pageB.getByTestId('collector-public-label')).toContainText(a.areaLabel ?? '');
    await pageB.getByRole('link', { name: 'View public binder' }).click();
    await expect(pageB).toHaveURL(new RegExp(`/binders/${binder.id}$`));
    await expect(pageB.getByRole('heading', { level: 1, name: binder.name })).toBeVisible();
    await expect(pageB.getByRole('main')).toContainText('Lantern Fox Spirit');
    await expect(pageB.getByTestId('owner-distance')).toHaveText(/km away/);

    await privacy.settle();
    expect(privacy.checkedCoordinates, 'the map delivered coordinates to check').toBeGreaterThan(0);
  });
});
