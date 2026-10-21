import { expect, test } from './support/fixtures';
import {
  openInApp,
  openTab,
  requireStack,
  screen,
  SEED_PASSWORD,
  signInThroughUi,
} from './support/stack';

/**
 * Search's map (the Map tab before stage R5) and other collectors' places on mobile (ADR 0017)
 * against the real, isolated stack and its seed collectors (fictional; collector1 in Quebec,
 * collector2 in Ontario, both showing their city on their profile). The map is drawn from borders
 * the app ships (the whole walk is in `regions.spec.ts`): no map provider or tile server is ever
 * asked (the privacy fixture fails a test on any such request, or on a coordinate or distance in
 * an API answer). A collector's profile shows their state or province and, when they show it,
 * their city.
 */
test.describe('mobile map and places', () => {
  requireStack();

  test("Search's map draws the home region from its own files; no map provider is asked", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const elsewhere: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      // Everything the screen loads comes from the app's own origin or from the isolated API.
      if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
        elsewhere.push(request.url());
      }
    });
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await openTab(page, 'Search');
    const map = screen(page, 'search');
    await expect(map.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });
    // The drawing: vectors in the page, the seed's Quebec binders shade Quebec, its card open. Its
    // spoken name says the browsed game (stage G; collector1 browses Yu-Gi-Oh!, her first game).
    await expect(map.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });
    await expect(map.getByTestId('map-shape-CA-QC')).toBeVisible();
    await expect(
      map.getByRole('img', {
        name: 'Map of public Yu-Gi-Oh! binders by state or province in Americas (North)',
      })
    ).toBeVisible();
    await expect(map.getByTestId('search-state-name')).toHaveText('Quebec', { timeout: 30_000 });
    await expect(map.getByTestId('search-state-stats-CA-QC')).toHaveText(
      /^(\d+ binders?)( · \d+ deck cores?)?$|^\d+ deck cores?$/
    );
    await expect(map.getByTestId('search-map-privacy')).toContainText('never uses your GPS');
    // No map library, no tile layer, no image of a map, no Filters button.
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expect(map.locator('img[src*="tile"]')).toHaveCount(0);
    await expect(map.getByRole('button', { name: /Filters/ })).toHaveCount(0);
    expect(elsewhere).toEqual([]);
  });

  test('a profile shows the province and the shown city; "Message" opens the conversation', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await openInApp(page, '/collectors/collector2');
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText('Devon Okafor', {
      timeout: 30_000,
    });
    // The one line under the header (stage R6): the shown city and the province, no country.
    await expect(profile.getByTestId('collector-line')).toHaveText(
      /^Toronto, Ontario · Member since \d{4}/
    );
    // Distance wording only: a seeded reference says "shipped right away" (stage R1), and the
    // ratings section loading before this check made a plain "away" fail (found in stage R3).
    await expect(profile).not.toContainText(
      /\bkm\b|\bmiles? away\b|away from you|approximate area/i
    );

    await profile
      .getByRole('button', { name: /^Message/ })
      .first()
      .click();
    const thread = screen(page, 'conversation');
    await expect(thread.getByTestId('conversation-profile')).toContainText('collector2', {
      timeout: 30_000,
    });
    await expect(thread.getByTestId('conversation-messages')).toBeVisible();
    const text = `Hello from the mobile places E2E ${Date.now().toString(36)}`;
    await thread.getByLabel('Message', { exact: true }).fill(text);
    await thread.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(thread.getByText(text)).toBeVisible({ timeout: 30_000 });
  });
});
