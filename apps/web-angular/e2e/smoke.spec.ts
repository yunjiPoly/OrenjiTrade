import { expect, test } from '@playwright/test';
import { forbidMapProviders } from './support/stack';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await forbidMapProviders(page);
  });

  test('renders the wordmark and redirects the root to /map', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/map\?region=americas-north$/);

    const wordmark = page.getByRole('link', { name: 'OrenjiTrade home' }).first();
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toContainText('Orenji');
    await expect(wordmark).toContainText('Trade');
    await expect(page).toHaveTitle(/OrenjiTrade/);
  });

  test('navigates to the inventory page', async ({ page }) => {
    await page.goto('/map');
    await page
      .getByRole('navigation', { name: 'Primary' })
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
  });

  test('renders the region map for signed-out visitors, without any map provider', async ({
    page,
  }) => {
    const providers = await forbidMapProviders(page);
    await page.goto('/inventory');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Map' })
      .click();
    await expect(page).toHaveURL(/\/map\?region=americas-north$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Binders in Americas (North)' }),
    ).toBeVisible();
    await expect(page.getByTestId('boundary-map')).toBeVisible();
    // The boundaries are a static file of the web build, drawn as vector shapes (no tiles).
    await expect(page.locator('.leaflet-overlay-pane path').first()).toBeAttached();
    await expect(page.locator('.leaflet-tile-pane img')).toHaveCount(0);
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Natural Earth');
    await expect(page.getByTestId('region-switcher')).toContainText('Americas (North)');
    await expect(page.getByRole('heading', { name: 'States and provinces' })).toBeVisible();
    await expect(page.getByTestId('subdivision-list')).toContainText('Quebec');
    // Phase 5: the Messages panel invites signed-out visitors too.
    await expect(
      page.locator('#map-messages-panel').getByRole('link', { name: 'Sign in to message' }),
    ).toHaveAttribute('href', '/auth/sign-in?returnUrl=%2Fmap');
    await expect(
      page.getByRole('combobox', { name: 'Search cards, collectors and binders' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Hide|Show) messages panel$/ })).toBeVisible();
    expect(providers.calls, 'no map provider or tile server').toEqual([]);
  });

  test('the region switcher scopes the map and is remembered when signed out', async ({ page }) => {
    await page.goto('/map');
    await expect(page).toHaveURL(/region=americas-north/);
    await page.getByTestId('region-switcher').click();
    await page.getByRole('menuitemradio', { name: 'Europe' }).click();
    await expect(page).toHaveURL(/\/map\?region=europe$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Binders in Europe' })).toBeVisible();
    await expect(page.getByTestId('subdivision-list')).toContainText('Île-de-France');
    await page.reload();
    await expect(page.getByTestId('region-switcher')).toContainText('Europe');
    await page.goto('/map');
    await expect(page).toHaveURL(/region=europe/);
  });

  test('shows the draft banner on the terms page', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'Draft — requires review by qualified legal counsel before production launch',
    );
  });

  test('shows the not-found page for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to the map' }).click();
    await expect(page).toHaveURL(/\/map\?region=americas-north$/);
  });
});
