import { expect, test } from '@playwright/test';
import { forbidMapProviders } from './support/stack';

/** The app shell for a signed-out visitor (web redesign WA, spec 4). */
test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await forbidMapProviders(page);
  });

  test('opens on Home with the wordmark, the pills and the rail', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/\?region=americas-north$/);
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
    await expect(page.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
    // Signed out: the page invites the visitor to sign in (the inventory is personal).
    await expect(
      page.getByRole('heading', { name: 'Sign in to build your inventory' }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveAttribute('href', '/auth/sign-in?returnUrl=%2Finventory');
    // Inventory carries no pills (spec 4.2).
    await expect(page.getByTestId('region-pill')).toHaveCount(0);
  });

  test('renders the region map for signed-out visitors, without any map provider', async ({
    page,
  }) => {
    const providers = await forbidMapProviders(page);
    await page.goto('/inventory');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Home' })
      .click();
    await expect(page).toHaveURL(/\/\?region=americas-north$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Binders in Americas (North)' }),
    ).toBeVisible();
    await expect(page.getByTestId('boundary-map')).toBeVisible();
    // The boundaries are a static file of the web build, drawn as vector shapes (no tiles).
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeAttached();
    await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Natural Earth');
    await expect(page.getByRole('heading', { name: 'States and provinces' })).toBeVisible();
    await expect(page.getByTestId('subdivision-list')).toContainText('Quebec');
    await expect(
      page.getByRole('combobox', { name: 'Search cards, collectors and binders' }),
    ).toBeVisible();
    // The map page's side Messages panel left with the new shell (spec 2.7).
    await expect(page.locator('#map-messages-panel')).toHaveCount(0);
    expect(providers.calls, 'no map provider or tile server').toEqual([]);
  });

  test('the region pill scopes the map and is remembered when signed out', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/region=americas-north/);
    await page.getByTestId('region-pill').click();
    await page.getByRole('radio', { name: /^Europe/ }).click();
    await expect(page).toHaveURL(/\/\?region=europe$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Binders in Europe' })).toBeVisible();
    await expect(page.getByTestId('subdivision-list')).toContainText('Île-de-France');
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
    await expect(page).toHaveURL(/\/\?region=americas-north$/);
  });
});
