import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { watchCoordinates } from './support/inventory';
import {
  chooseOption,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
} from './support/stack';

/**
 * Settings against the real local stack: the self-declared location and discoverability (ADR
 * 0017: no coordinate in any JSON response the browser receives), the data export and the
 * deletion grace period.
 */
test.describe('settings', () => {
  requireStack();

  test('a collector declares a location, then appears on the map by state, never a coordinate', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const collector = await createOnboardedCollector(request, 'privacy');
    const city = `Zqcity${Math.random().toString(36).slice(2, 7)}`;
    // Bounded body reads: a response aborted by a navigation must not hang the spec.
    const watcher = watchCoordinates(page);

    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/settings/privacy');
    await expect(page.getByRole('heading', { name: 'Visibility' })).toBeVisible();
    await expect(page.getByText('You have not chosen a location yet')).toBeVisible();
    // Discoverability needs a location first (409 LOCATION_REQUIRED, explained).
    const discoverable = page.getByRole('switch', { name: 'Show me on the map' });
    await discoverable.click();
    await expect(page.getByText(/Pick your country and your state or province/)).toBeVisible();
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');

    // Settings → Location: region, country and state pickers, an optional city.
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: 'Location' })
      .click();
    await expect(page).toHaveURL(/\/settings\/location$/);
    await expect(page.getByTestId('location-none')).toBeVisible();
    await chooseOption(page, 'Country', 'Canada');
    await chooseOption(page, 'State or province', 'Quebec');
    await page.getByLabel('City (optional)').fill(city);
    await page.getByTestId('location-save').click();
    await expect(page.getByTestId('location-label')).toHaveText(/Quebec, Canada/);
    await expect(page.getByText('Hidden from the map')).toBeVisible();
    // The old address of this page still works.
    await page.goto('/settings/trading-area');
    await expect(page).toHaveURL(/\/settings\/location$/);

    // Now discoverable: collectors see the state and the country.
    await page.goto('/settings/privacy');
    await discoverable.click();
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(discoverable).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Collectors see you in/)).toContainText('Quebec, Canada');

    // Own public profile: the city (shown by default) and the state, never a map pin.
    await page.goto(`/collectors/${collector.handle}`);
    await expect(
      page.getByRole('heading', { level: 1, name: collector.displayName }),
    ).toBeVisible();
    await expect(page.getByTestId('collector-public-label')).toContainText('Quebec, Canada');
    await expect(page.getByTestId('collector-city')).toHaveText(city);
    await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible();

    // Someone else's profile (seed data, discoverable, city shown): state and city, no distance.
    await page.goto('/collectors/collector2');
    await expect(page.getByRole('heading', { level: 1, name: 'Devon Okafor' })).toBeVisible();
    await expect(page.getByTestId('collector-public-label')).toContainText('Ontario, Canada');
    await expect(page.getByTestId('collector-city')).toHaveText('Toronto');
    await expect(page.getByRole('main')).not.toContainText(/\bkm\b/);
    // Phase 5: Devon accepts messages from members with a profile.
    await expect(page.getByRole('button', { name: 'Message Devon Okafor' })).toBeEnabled();

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });

  test('the data export downloads a JSON document', async ({ page, request }) => {
    const collector = await createOnboardedCollector(request, 'export');
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/settings/account');
    await expect(page.getByTestId('account-email')).toHaveText(collector.email);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download my data' }).click(),
    ]);
    await expect(page.getByText(/Downloaded orenjitrade-export-/)).toBeVisible();
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^orenjitrade-export-${collector.handle}-\\d{4}-\\d{2}-\\d{2}\\.json$`),
    );
    const path = await download.path();
    const exported = JSON.parse(await readFile(path, 'utf-8')) as {
      userId?: string;
      sections?: Record<string, unknown>;
    };
    expect(exported.userId).toBe(collector.id);
    expect(Object.keys(exported.sections ?? {}).length).toBeGreaterThan(0);
  });

  test('profile edits are saved and shown on the public profile', async ({ page, request }) => {
    const collector = await createOnboardedCollector(request, 'profile');
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/settings/profile');
    await page.getByLabel('Display name').fill('Renamed E2E Collector');
    await page
      .getByRole('group', { name: 'Games you collect or play' })
      .getByRole('button', { name: 'Magic: The Gathering' })
      .click();
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.getByRole('link', { name: 'View public profile' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Renamed E2E Collector' }),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Games' })).toContainText('Magic: The Gathering');
  });

  test('account deletion needs the password, starts the grace period and can be cancelled', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const collector = await createOnboardedCollector(request, 'delete');
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/settings/account');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete your account' });
    await dialog.getByRole('checkbox', { name: 'Download a copy of my data first' }).uncheck();
    await dialog.getByLabel('Password').fill('wrong-password-123');
    await dialog.getByRole('checkbox', { name: /I understand/ }).check();
    await dialog.getByRole('button', { name: 'Delete my account' }).click();
    await expect(dialog.getByText('That password is not correct.')).toBeVisible();

    await dialog.getByLabel('Password').fill(collector.password);
    await dialog.getByRole('button', { name: 'Delete my account' }).click();

    await expect(page).toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Your account is scheduled for deletion' }),
    ).toBeVisible();
    await expect(page.getByText(/will be permanently deleted on/)).toBeVisible();

    // Other pages are blocked while the deletion is pending.
    await page.goto('/settings/privacy');
    await expect(page).toHaveURL(/\/auth\/suspended/);

    await page.getByRole('button', { name: 'Cancel deletion' }).click();
    await expect(page).toHaveURL(/\/settings\/account/, { timeout: 20_000 });
    await expect(page.getByText('Deletion cancelled. Welcome back!')).toBeVisible();
  });
});
