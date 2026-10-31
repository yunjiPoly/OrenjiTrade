import { expect, test } from '@playwright/test';
import { forbidMapProviders } from './support/stack';

/** The app shell for a signed-out visitor (web redesign WA, spec 4). */
test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await forbidMapProviders(page);
  });

  test('opens on Home with the wordmark, the pills and the rail', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/\?region=americas-north&game=[a-z-]+$/);
    const wordmark = page.getByRole('link', { name: 'OrenjiTrade, Home' }).first();
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toContainText('Orenji');
    await expect(wordmark).toContainText('Trade');
    await expect(page).toHaveTitle(/^Home · OrenjiTrade$/);
    await expect(page.getByTestId('region-pill')).toContainText('Americas (North)');
    await expect(page.getByTestId('game-pill')).toContainText('Yu-Gi-Oh!');
    const rail = page.getByRole('navigation', { name: 'Main' });
    await expect(rail.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    // A guest has "Sign in" instead of the bell and the avatar (spec 4.3).
    await expect(page.getByTestId('top-bar-sign-in')).toBeVisible();
    await expect(page.getByTestId('notification-bell')).toHaveCount(0);
  });

  test('navigates to the inventory page from the rail', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Inventory' })
      .click();
    await expect(page).toHaveURL(/\/inventory$/);
    // Signed out: Inventory's guest page (spec 14), back here after signing in.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Your cards, in one place' }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveAttribute('href', '/auth/sign-in?returnUrl=%2Finventory');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Create account', exact: true }),
    ).toHaveAttribute('href', '/auth/sign-up?returnUrl=%2Finventory');
    // Inventory carries no pills (spec 4.2).
    await expect(page.getByTestId('region-pill')).toHaveCount(0);
  });

  test("Home shows what's new to signed-out visitors, with the static map card and no map provider", async ({
    page,
  }) => {
    const providers = await forbidMapProviders(page);
    await page.goto('/inventory');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Home' })
      .click();
    await expect(page).toHaveURL(/\/\?region=americas-north&game=[a-z-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'What’s new' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Show' })).toBeVisible();
    // A guest: the guest card, never Get started (spec 5.3).
    await expect(page.getByTestId('home-guest-card')).toContainText('You’re browsing as a guest');
    await expect(page.getByTestId('get-started')).toHaveCount(0);
    // The map card is a static SVG of the bundled boundaries: no Leaflet, no tiles (spec 5.3, 21).
    const card = page.getByTestId('home-map-card');
    await expect(card.locator('svg path').first()).toBeAttached();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expect(card).toContainText('Explore the map');
    // One search field on Home: the top bar's (spec 4.3).
    await expect(page.locator('#global-search-input')).toBeVisible();
    expect(providers.calls, 'no map provider or tile server').toEqual([]);
  });

  test('the region pill scopes Home and is remembered when signed out', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/region=americas-north/);
    await page.getByTestId('region-pill').click();
    await page.getByRole('radio', { name: /^Europe/ }).click();
    await expect(page).toHaveURL(/\/\?region=europe&game=[a-z-]+$/);
    await expect(page.locator('.home__scope')).toContainText('Europe');
    await page.reload();
    await expect(page.getByTestId('region-pill')).toContainText('Europe');
    await page.goto('/');
    await expect(page).toHaveURL(/region=europe/);
  });

  test('shows the draft banner on the terms page', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByRole('status').first()).toContainText(
      'Draft — requires review by qualified legal counsel before production launch',
    );
  });

  test('shows the not-found page for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(/\/\?region=americas-north&game=[a-z-]+$/);
  });
});
