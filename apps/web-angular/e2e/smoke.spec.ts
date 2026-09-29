import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
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
    await expect(page.getByText('No cards yet')).toBeVisible();
  });

  test('renders the map page with its placeholder canvas and filters', async ({ page }) => {
    await page.goto('/inventory');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Map' })
      .click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByText('Map loads in Phase 4')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Map filters' })).toBeVisible();
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
