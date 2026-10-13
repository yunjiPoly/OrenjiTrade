import { expect, test } from './support/fixtures';
import {
  SEED_PASSWORD,
  createOnboardedCollector,
  openInApp,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/**
 * The Map tab and other collectors' places on mobile (ADR 0017) against the real, isolated stack
 * and its seed collectors (fictional; collector1 in Quebec, collector2 in Ontario, both showing
 * their city on their profile). The app draws no map yet: the tab names the home region and
 * leads to region-scoped search; no map provider or tile server is ever asked (the privacy
 * fixture fails a test on any such request, or on a coordinate or distance in an API answer).
 * A collector's profile shows their state or province and, when they show it, their city.
 */
test.describe('mobile map tab and places', () => {
  requireStack();

  test('the Map tab names the home region and leads to search; no map provider is asked', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const tiles: string[] = [];
    page.on('request', (request) => {
      if (/openstreetmap|maps\.googleapis|maps\.gstatic/.test(request.url())) {
        tiles.push(request.url());
      }
    });
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    const map = screen(page, 'map');
    await expect(map.getByTestId('map-placeholder')).toContainText(
      'The region map is coming to the app',
      { timeout: 30_000 }
    );
    await expect(map.getByTestId('map-placeholder')).toContainText('Americas (North)');
    await expect(map.getByTestId('map-privacy-note')).toContainText('never uses your GPS');
    // collector1 has a location: no invitation to choose one.
    await expect(map.getByTestId('map-choose-location')).toHaveCount(0);
    await expect(page.locator('.leaflet-container')).toHaveCount(0);

    await map.getByRole('button', { name: 'Search your region' }).click();
    await expect(screen(page, 'search')).toBeVisible({ timeout: 30_000 });
    expect(tiles).toEqual([]);
  });

  test('a collector without a location is invited to choose one from the Map tab', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const newcomer = await createOnboardedCollector(request, 'mapnew', 'Mobile Placeless');
    await signInThroughUi(page, newcomer.email, newcomer.password);
    const map = screen(page, 'map');
    await map.getByTestId('map-choose-location').click({ timeout: 30_000 });
    const settings = screen(page, 'settings-location');
    await expect(settings.getByTestId('location-none')).toBeVisible({ timeout: 30_000 });
  });

  test('a profile shows the state and the shown city; "Message" opens the conversation', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await openInApp(page, '/collectors/collector2');
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText('Devon Okafor', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('collector-location')).toHaveText('Toronto, Ontario, Canada');
    await expect(profile.getByTestId('collector-area-note')).toContainText(
      'On the map in Ontario, Canada.'
    );
    await expect(profile).not.toContainText(/\bkm\b|away|approximate area/i);

    await profile
      .getByRole('button', { name: /^Message/ })
      .first()
      .click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByTestId('conversation-profile')).toContainText('Devon Okafor', {
      timeout: 30_000,
    });
    await expect(thread.getByTestId('conversation-messages')).toBeVisible();
    const text = `Hello from the mobile places E2E ${Date.now().toString(36)}`;
    await thread.getByLabel('Message', { exact: true }).fill(text);
    await thread.getByRole('button', { name: 'Send message' }).click();
    await expect(thread.getByText(text)).toBeVisible({ timeout: 30_000 });
  });
});
