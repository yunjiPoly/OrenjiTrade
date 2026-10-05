import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Settings → Location and discoverability (ADR 0004): a manual trading area chosen by the same
 * mechanism as the web picker (city quick pick, tap on the map, dragged pin, radius), the opt-in
 * to the map (off by default), the public label, and no precise coordinate in any answer (the
 * `privacy` fixture scans every API response).
 */
test.describe('mobile location and discoverability', () => {
  requireStack();

  test('a collector sets a manual trading area and opts into the map', async ({
    page,
    request,
    privacy,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'area', 'Mobile Mapper');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-visibility')).toHaveText('Hidden from the map.', {
      timeout: 30_000,
    });
    await profile.getByRole('link', { name: 'Location and discoverability' }).click();

    const settings = screen(page, 'settings-location');
    await expect(settings.getByTestId('area-public-label')).toHaveText(
      'No trading area saved yet.',
      {
        timeout: 30_000,
      }
    );
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'You have no trading area yet'
    );
    const discoverable = settings.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');

    // A manual area, chosen the way the web picker does it: jump to a city, then tap the map and
    // drag the pin (Leaflet + OpenStreetMap on web, tiles stubbed), then widen the radius.
    const summary = settings.getByTestId('area-centre-summary');
    await expect(summary).toHaveText('Centre: Montréal city centre.');
    const map = settings.getByTestId('trading-area-map');
    await expect(map.locator('.leaflet-container, .leaflet-pane').first()).toBeAttached({
      timeout: 30_000,
    });
    await settings.getByRole('button', { name: 'Québec' }).click();
    await expect(summary).toHaveText('Centre: Québec city centre.');
    await expect(settings.getByTestId('area-radius-value')).toHaveText('15 km');

    // Wait for the camera to settle on Québec (the pin back in the middle of the map).
    const pin = settings.getByTestId('trading-area-pin');
    await map.scrollIntoViewIfNeeded();
    const mapBox = await map.boundingBox();
    if (!mapBox) {
      throw new Error('The trading-area map has no box.');
    }
    /** Screen position of the pin's tip (32 px icon anchored at its bottom centre). */
    const pinTip = async () => {
      const box = await pin.boundingBox();
      return box ? { x: box.x + 16, y: box.y + 30 } : { x: -1000, y: -1000 };
    };
    await expect
      .poll(async () => Math.abs((await pinTip()).x - (mapBox.x + mapBox.width / 2)))
      .toBeLessThanOrEqual(3);

    // A tap on the map moves the centre there.
    const tap = { x: mapBox.x + 56, y: mapBox.y + 64 };
    await page.mouse.click(tap.x, tap.y);
    await expect(summary).toHaveText('Centre: the point you chose on the map.');
    await expect.poll(async () => Math.abs((await pinTip()).x - tap.x)).toBeLessThanOrEqual(3);
    expect(Math.abs((await pinTip()).y - tap.y)).toBeLessThanOrEqual(3);

    // Dragging the pin moves it again.
    const grab = { x: tap.x, y: tap.y - 16 };
    const drop = { x: mapBox.x + mapBox.width - 64, y: grab.y + 80 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 10, grab.y + 5, { steps: 3 });
    await page.mouse.move(drop.x, drop.y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await pinTip()).x - drop.x)).toBeLessThanOrEqual(4);
    await expect(summary).toHaveText('Centre: the point you chose on the map.');

    await settings.getByRole('button', { name: 'Increase trading radius' }).click();
    await expect(settings.getByTestId('area-radius-value')).toHaveText('20 km');
    const put = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' && request.url().endsWith('/api/v1/me/location/trading-area')
    );
    await settings.getByRole('button', { name: 'Save trading area' }).click();
    const sent = (await put).postDataJSON() as {
      lat: number;
      lng: number;
      radiusKm: number;
      source: string;
    };
    expect(sent.source).toBe('MANUAL');
    expect(sent.radiusKm).toBe(20);
    for (const value of [sent.lat, sent.lng]) {
      expect(String(value).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
    }
    // Neither the city centre nor the default: the point the pin was dragged to.
    expect([sent.lat, sent.lng]).not.toEqual([46.813, -71.208]);
    expect([sent.lat, sent.lng]).not.toEqual([45.502, -73.567]);
    await expect(snackbar(page)).toContainText('Trading area saved', { timeout: 30_000 });
    await expect(settings.getByTestId('area-public-label')).toContainText('20 km radius');
    await expect(summary).toHaveText(/^Centre: your saved point/);
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'You are hidden from the map.'
    );

    // Opt in.
    await discoverable.click();
    await expect(snackbar(page)).toHaveText('You now appear on the map.', { timeout: 30_000 });
    await expect(discoverable).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'Collectors see you near'
    );

    // The API agrees, and only ever exposes an approximate, 3-decimal public point.
    const location = await request.get(`${API_URL}/api/v1/me/location`, {
      headers: authHeader(collector.idToken),
    });
    expect(location.ok()).toBeTruthy();
    const body = (await location.json()) as {
      discoverable: boolean;
      tradingArea?: { radiusKm: number; source: string; label?: string };
    };
    expect(body.discoverable).toBe(true);
    expect(body.tradingArea).toMatchObject({ radiusKm: 20, source: 'MANUAL' });
    privacy.scan(`${API_URL}/api/v1/me/location`, body);

    const publicProfile = await request.get(`${API_URL}/api/v1/collectors/${collector.handle}`, {
      headers: authHeader(collector.idToken),
    });
    const publicBody = (await publicProfile.json()) as { location?: { publicLabel?: string } };
    expect(publicBody.location?.publicLabel).toBeTruthy();
    privacy.scan(`${API_URL}/api/v1/collectors/${collector.handle}`, publicBody);

    // The profile tab reflects it; then opting out again hides the collector.
    await page.goBack();
    const refreshed = screen(page, 'profile');
    await expect(refreshed.getByTestId('profile-visibility')).toHaveText(
      'Visible on the map at an approximate position.',
      { timeout: 30_000 }
    );
    await expect(refreshed.getByTestId('profile-area')).toContainText('20 km radius');
    await expect(refreshed.getByText(/\d+\.\d{4,}/)).toHaveCount(0);

    await refreshed.getByRole('button', { name: 'Public preview' }).click();
    const publicLabel = publicBody.location?.publicLabel ?? '';
    await expect(screen(page, 'collector').getByTestId('collector-location')).toHaveText(
      /^approximate area$/i.test(publicLabel) ? 'Approximate area' : `Near ${publicLabel}`,
      { timeout: 30_000 }
    );
    await page.goBack();

    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings')
      .getByRole('link', { name: 'Location and discoverability' })
      .click();
    const again = screen(page, 'settings-location');
    await again.getByRole('switch', { name: 'Show me on the map' }).click();
    await expect(snackbar(page)).toHaveText('You are hidden from the map.', { timeout: 30_000 });
    expect(privacy.responses).toBeGreaterThan(0);
  });
});
