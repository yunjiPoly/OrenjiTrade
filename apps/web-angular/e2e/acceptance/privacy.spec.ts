import { WEB_URL, requireStack } from '../support/stack';
import { AnswerRecorder, recordAnswers } from './support/answers';
import { suffix } from './support/api';
import { escapeRegExp, expect, openState, stateBinder, test } from './support/fixtures';
import { cityToken, placeOf } from './support/places';
import { stompBodies } from './support/privacy';

/**
 * Acceptance — privacy (ADR 0017, spec § 50). The network-response scanner runs as an automatic
 * fixture on every acceptance test; this spec proves that it really catches leaks (a planted
 * coordinate, a distance, a radius and a registered city, in an HTTP answer and in a STOMP frame)
 * and then sweeps every place-bearing surface a signed-in collector can reach for a discoverable
 * collector with a city: the region map (counts and the state's binders), the card holders, the
 * unified search, the profile (where the city is allowed), the public binder, the wishlist and
 * the realtime wishlist alert. Only states and countries may appear; never a
 * coordinate, a distance or the city outside the owner's profile.
 */

interface PlaceAnswer {
  place?: { label?: string; city?: string };
}

/** A page of the state binder list (`owner`) or of the card holders (`collector`). */
interface ListAnswer {
  items?: ({ collector?: PlaceAnswer; owner?: PlaceAnswer } & object)[];
}

test.describe('acceptance: privacy', () => {
  requireStack();

  test('the network scanner flags coordinates, distances, radii and leaked cities', async ({
    page,
    privacy,
  }) => {
    const city = cityToken();
    privacy.registerCity('probe_owner', city);
    const probe = `${WEB_URL}/__acceptance-privacy-probe.json`;
    await page.route(probe, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          collectors: [
            { handle: 'fine', place: { label: 'Quebec, Canada', subdivisionCode: 'CA-QC' } },
            { handle: 'point', publicPoint: { lat: 50.12, lng: -90.5 } },
            { handle: 'bucket', distanceBucket: 'KM_1_5' },
            { handle: 'radius', radiusKm: 10 },
            { handle: 'leak', note: `see you in ${city}` },
          ],
        }),
      }),
    );
    await page.goto('/legal/terms');
    await page.evaluate((url) => fetch(url).then((response) => response.json()), probe);
    await privacy.settle();
    const found = privacy.violations().filter((violation) => violation.source === probe);
    expect(found.map((violation) => violation.path).sort()).toEqual([
      '$',
      '$.collectors[1].publicPoint.lat',
      '$.collectors[1].publicPoint.lng',
      '$.collectors[2].distanceBucket',
      '$.collectors[3].radiusKm',
    ]);
    privacy.forgiveSource(probe);

    // The same rules apply to STOMP frames of the realtime WebSocket.
    const frame = `MESSAGE\ndestination:/user/queue/notifications\ncontent-type:application/json\n\n${JSON.stringify(
      { data: { lat: 45.5, lng: -73.5 } },
    )}\0`;
    const socket = 'websocket self-test';
    for (const body of stompBodies(frame)) {
      privacy.scan(socket, body);
    }
    expect(privacy.violations().filter((violation) => violation.source === socket)).toHaveLength(2);
    privacy.forgiveSource(socket);
    expect(privacy.violations()).toEqual([]);
  });

  test('every place-bearing surface shows a discoverable collector by state only', async ({
    page,
    api,
    actors,
    privacy,
  }) => {
    test.setTimeout(180_000);
    const city = cityToken();
    const place = placeOf('privacy', city);
    const {
      collector: seller,
      binder,
      items: [item],
    } = await api.seller(
      'acc-privseller',
      place,
      [{ code: 'TMP-EN014', extra: { availability: 'SALE', askingPrice: 9 } }],
      { displayName: `Pia Private ${suffix()}` },
    );
    const card = item.card.name;
    const viewer = await api.collector('acc-privviewer', {
      place: placeOf('privacy'),
      discoverable: true,
      displayName: `Val Viewer ${suffix()}`,
    });
    // The viewer wishes the card too: the wishlist alert carries the seller's place.
    await api.ok('POST', '/api/v1/wishlist', {
      token: viewer.idToken,
      data: { cardId: await api.cardId(viewer.idToken, card) },
    });

    const answers: PlaceAnswer[] = [];
    const pageV = await actors.open(viewer);
    // The answers of the state list and of the card holders are recorded in a route, before the
    // page gets them (support/answers.ts): read back from the browser, a body Chromium no longer
    // kept failed the test under the load of a full run.
    const collect = async (recorder: AnswerRecorder<ListAnswer>) => {
      await recorder.stop();
      expect(recorder.received.length, 'the page received the answer').toBeGreaterThan(0);
      for (const { body } of recorder.received) {
        answers.push(...(body.items ?? []).map((entry) => entry.collector ?? entry.owner ?? {}));
      }
    };

    // The region map: the state's panel lists the seller's binder.
    const stateAnswers = await recordAnswers<ListAnswer>(
      pageV,
      /\/api\/v1\/regions\/[^/?]+\/subdivisions\/[^/?]+\/binders(\?|$)/,
    );
    const panel = await openState(pageV, place);
    await expect(stateBinder(panel, binder.name)).toBeVisible();
    await collect(stateAnswers);
    expect(await privacy.scanDom(pageV)).toBeGreaterThan(100);
    // Card holders and unified search, profile, public binder.
    await pageV.goto(`/cards/${await api.cardId(viewer.idToken, card)}`);
    const holdersAnswers = await recordAnswers<ListAnswer>(
      pageV,
      /\/api\/v1\/search\/card-holders(\?|$)/,
    );
    await pageV.getByRole('link', { name: 'Who has this in my region' }).click();
    await expect(
      pageV.getByRole('list', { name: 'Card holders in your region' }).getByRole('article').first(),
    ).toBeVisible();
    await collect(holdersAnswers);
    await pageV.goto(`/search?q=${encodeURIComponent(seller.displayName)}&tab=collectors`);
    await expect(pageV.getByRole('main')).toContainText(seller.displayName);
    await pageV.goto(`/collectors/${seller.handle}`);
    await expect(pageV.getByTestId('collector-public-label')).toContainText(place.label);
    await expect(pageV.getByTestId('collector-city')).toHaveText(city);
    await pageV.goto(`/binders/${binder.id}`);
    await expect(pageV.getByTestId('owner-public-label')).toContainText(place.label);
    await expect(pageV.getByRole('main')).not.toContainText(city);
    // Wishlist: a copy published while the viewer is connected reaches the viewer as a realtime
    // wishlist alert (a STOMP frame, scanned too) naming the seller's state and country.
    await pageV.goto('/wishlist');
    const wish = pageV.locator('[data-wish]').filter({ hasText: card });
    await expect(wish).toHaveCount(1);
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
    await bell.click();
    const alert = pageV
      .getByRole('menu', { name: 'Notifications' })
      .getByRole('menuitem', { name: new RegExp(`Wishlist alert: ${escapeRegExp(card)}`) });
    await expect(alert).toContainText(`was just listed by @${seller.handle} in ${place.label}`);
    await expect(alert).not.toContainText(city);
    await pageV.keyboard.press('Escape');

    // What the viewer received: the state and the country, never the city.
    const shown = answers.filter((entry) => entry.place?.label);
    expect(shown.length, 'holders and map answers described the seller').toBeGreaterThan(0);
    for (const entry of shown) {
      expect(entry.place?.label).toBe(place.label);
      expect(entry.place?.city).toBeUndefined();
    }
    await privacy.settle();
    expect(privacy.checkedPlaces).toBeGreaterThan(0);
    expect(privacy.violations()).toEqual([]);
    await page.close();
  });
});
