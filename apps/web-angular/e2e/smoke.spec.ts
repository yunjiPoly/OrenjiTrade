import { expect, test } from '@playwright/test';
import { stubMapTiles } from './support/stack';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await stubMapTiles(page);
  });

  test('renders the wordmark and redirects the root to /map', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/map$/);

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

  test('renders the map page around Montréal for signed-out visitors', async ({ page }) => {
    await page.goto('/inventory');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Map' })
      .click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByTestId('discovery-map')).toBeVisible();
    await expect(page.getByText('Showing collectors around')).toContainText('Montréal');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    // Phase 5: the Messages panel invites signed-out visitors too.
    await expect(
      page.locator('#map-messages-panel').getByRole('link', { name: 'Sign in to message' }),
    ).toHaveAttribute('href', '/auth/sign-in?returnUrl=%2Fmap');
    await expect(
      page.getByText('Locations are approximate (about 2 km) to protect privacy'),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Search the map' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Map filters' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'List', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Hide|Show) messages panel$/ })).toBeVisible();
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
    await expect(page).toHaveURL(/\/map$/);
  });
});
