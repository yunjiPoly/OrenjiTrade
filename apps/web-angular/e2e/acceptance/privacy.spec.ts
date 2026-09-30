import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { expect, mapMarker, test } from './support/fixtures';
import { besides, randomCentre } from './support/places';
import { Point, stompBodies } from './support/privacy';

/**
 * Acceptance — privacy (ADR 0004, spec § 50). The network-response scanner runs as an automatic
 * fixture on every acceptance test; this spec proves that it really catches leaks (a planted
 * precise coordinate, a stored centre, a raw distance, in an HTTP answer and in a STOMP frame) and
 * then sweeps every geographic surface a signed-in collector can reach for a discoverable
 * collector: the map (nearby markers, preview), the map search, the card holders, the unified
 * search, the profile, the public binder, the wishlist matches and the realtime notification.
 */

interface Marker {
  handle: string;
  publicPoint: Point;
  distanceBucket?: string | null;
}

test.describe('acceptance: privacy', () => {
  requireStack();

  test('the network scanner flags precise coordinates, stored centres and raw distances', async ({
    page,
    privacy,
  }) => {
    const centre = randomCentre('privacy');
    privacy.registerCentre('@probe', centre);
    const probe = 'http://localhost:4200/__acceptance-privacy-probe.json';
    await page.route(probe, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          collectors: [
            { handle: 'fine', publicPoint: { lat: 50.121, lng: -90.5 }, distanceBucket: 'KM_1_5' },
            { handle: 'precise', publicPoint: { lat: 50.12345, lng: -90.5 } },
            { handle: 'centre', publicPoint: centre },
            { handle: 'metres', distanceMeters: 1234 },
          ],
        }),
      }),
    );
    await page.goto('/legal/terms');
    await page.evaluate((url) => fetch(url).then((response) => response.json()), probe);
    await privacy.settle();
    const found = privacy.violations().filter((violation) => violation.source === probe);
    expect(found.map((violation) => violation.path).sort()).toEqual([
      '$.collectors[1].publicPoint.lat',
      '$.collectors[2].publicPoint',
      '$.collectors[3].distanceMeters',
    ]);
    privacy.forgiveSource(probe);

    // The same rules apply to STOMP frames of the realtime WebSocket.
    const frame = `MESSAGE\ndestination:/user/queue/notifications\ncontent-type:application/json\n\n${JSON.stringify(
      { data: { lat: 45.50001, lng: -73.5 } },
    )}\0`;
    const socket = 'websocket self-test';
    for (const body of stompBodies(frame)) {
      privacy.scan(socket, body);
    }
    expect(privacy.violations().filter((violation) => violation.source === socket)).toHaveLength(1);
    privacy.forgiveSource(socket);
    expect(privacy.violations()).toEqual([]);
  });

  test('every geographic surface shows a discoverable collector approximately', async ({
    page,
    api,
    actors,
    privacy,
  }) => {
    test.setTimeout(180_000);
    const area = randomCentre('privacy');
    const {
      collector: seller,
      binder,
      items: [item],
    } = await api.seller(
      'acc-privseller',
      area,
      [{ code: 'TMP-EN014', extra: { availability: 'SALE', askingPrice: 9 } }],
      { displayName: `Pia Private ${suffix()}` },
    );
    const card = item.card.name;
    const viewer = await api.collector('acc-privviewer', {
      area: besides(area, 1, 21),
      radiusKm: 10,
      discoverable: true,
      displayName: `Val Viewer ${suffix()}`,
    });
    // The viewer wishes the card too: the match and its notification carry the seller's place.
    await api.ok('POST', '/api/v1/wishlist', {
      token: viewer.idToken,
      data: {
        cardId: await api.cardId(viewer.idToken, card),
        tradePreference: 'ANY',
        radiusKm: 10,
      },
    });

    const markers: Marker[] = [];
    const pageV = await actors.open(viewer);
    pageV.on('response', (response) => {
      if (/\/api\/v1\/(collectors\/nearby|search\/card-holders)/.test(response.url())) {
        response
          .json()
          .then((body: { collectors?: Marker[]; items?: { collector: Marker }[] }) =>
            markers.push(
              ...(body.collectors ?? []),
              ...(body.items ?? []).map((entry) => entry.collector),
            ),
          )
          .catch(() => undefined);
      }
    });

    // Map, marker, preview.
    await pageV.goto('/map');
    const marker = mapMarker(pageV, seller.displayName);
    await expect(marker).toBeVisible({ timeout: 20_000 });
    await marker.click();
    await expect(pageV.getByRole('dialog', { name: seller.displayName })).toBeVisible();
    // Map search → holders of the card.
    const search = pageV.getByRole('combobox', { name: 'Search the map' });
    await search.fill(card.split(' ')[0]);
    await pageV
      .getByRole('option', { name: new RegExp(card) })
      .first()
      .click();
    await expect(pageV.getByRole('heading', { name: `Holders of ${card}` })).toBeVisible();
    // Card holders and unified search, profile, public binder.
    await pageV.getByRole('link', { name: 'All filters' }).click();
    await expect(
      pageV.getByRole('list', { name: 'Card holders near you' }).getByRole('article').first(),
    ).toBeVisible();
    await pageV.goto(`/search?q=${encodeURIComponent(seller.displayName)}&tab=collectors`);
    await expect(pageV.getByRole('main')).toContainText(seller.displayName);
    await pageV.goto(`/collectors/${seller.handle}`);
    await expect(pageV.getByTestId('collector-public-label')).toContainText(seller.areaLabel ?? '');
    await pageV.goto(`/binders/${binder.id}`);
    await expect(pageV.getByTestId('owner-distance')).toHaveText(/km away/);
    // Wishlist: the wish matched the listed copy; a second copy is published while the viewer is
    // connected and reaches the viewer as a realtime notification (a STOMP frame, scanned too).
    await pageV.goto('/wishlist');
    const wish = pageV.locator('[data-wish]').filter({ hasText: card });
    await expect(wish.getByTestId('wish-matches')).toHaveText(/1 match/, { timeout: 15_000 });
    const bell = pageV.getByTestId('notification-bell');
    await expect(bell).toHaveAttribute('data-realtime', 'connected', { timeout: 20_000 });
    const framesBefore = privacy.checkedFrames;
    await api.item(seller, 'TMP-EN014', {
      binderId: binder.id,
      availability: 'SALE',
      askingPrice: 8,
      visibility: 'PUBLIC',
      condition: 'LIGHTLY_PLAYED',
    });
    await expect(pageV.getByTestId('notification-badge')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => privacy.checkedFrames).toBeGreaterThan(framesBefore);
    await expect(wish.getByTestId('wish-matches')).toHaveText(/2 matches/, { timeout: 15_000 });
    await wish.getByTestId('wish-matches').click();
    const drawer = pageV.getByRole('dialog', { name: `Matches for ${card}` });
    const matches = drawer.locator('[data-match]').filter({ hasText: seller.displayName });
    await expect(matches).toHaveCount(2);
    await expect(matches.first().getByTestId('match-distance')).toHaveText(/km away/);

    // What the viewer received: public points only, bucketed distances.
    const shown = markers.filter((entry) => entry?.handle === seller.handle);
    expect(shown.length, 'the seller was listed on the map and in the holders').toBeGreaterThan(0);
    for (const entry of shown) {
      expect(entry.publicPoint).not.toEqual(area);
      expect(entry.distanceBucket ?? 'LT_1KM').toMatch(/^(LT_1KM|KM_\d+_\d+|GT_50KM)$/);
    }
    await privacy.settle();
    expect(privacy.checkedCoordinates).toBeGreaterThan(0);
    expect(privacy.violations()).toEqual([]);
    await page.close();
  });
});
