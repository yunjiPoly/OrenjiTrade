import { Response, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  API_URL,
  coordinates,
  createOnboardedCollector,
  decimalsOf,
  requireStack,
  signInThroughUi,
} from './support/stack';

interface CoordinateSample {
  url: string;
  path: string;
  value: number;
}

/**
 * Settings against the real local stack: discoverability (and the ADR 0004 precision rule on
 * every JSON response the browser receives), the data export and the deletion grace period.
 */
test.describe('settings', () => {
  requireStack();

  test('turning discoverability on shows the public label and never precise coordinates', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const collector = await createOnboardedCollector(request, 'privacy', { tradingArea: true });

    const samples: CoordinateSample[] = [];
    const pending: Promise<void>[] = [];
    page.on('response', (response: Response) => {
      const type = response.headers()['content-type'] ?? '';
      if (!type.includes('json')) {
        return;
      }
      pending.push(
        response
          .json()
          .then((body: unknown) => {
            for (const sample of coordinates(body)) {
              samples.push({ url: response.url(), ...sample });
            }
          })
          .catch(() => undefined),
      );
    });

    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/settings/privacy');
    await expect(page.getByRole('heading', { name: 'Visibility' })).toBeVisible();
    await expect(page.getByText('You are hidden from the map.')).toBeVisible();

    const discoverable = page.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');
    await discoverable.click();
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(discoverable).toHaveAttribute('aria-checked', 'true');
    const label = collector.areaLabel ?? '';
    await expect(page.getByText(/Collectors see you near/)).toContainText(label);

    // The trading-area section shows the label the server derived.
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: 'Trading area' })
      .click();
    await expect(page.getByTestId('area-public-label')).toHaveText(label);
    await expect(page.getByText('Visible on the map')).toBeVisible();

    // Own public profile: approximate label and map, never an exact position.
    await page.goto(`/collectors/${collector.handle}`);
    await expect(
      page.getByRole('heading', { level: 1, name: collector.displayName }),
    ).toBeVisible();
    await expect(page.getByTestId('collector-public-label')).toContainText(label);
    await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible();

    // Someone else's profile (seed data, discoverable): label + distance bucket.
    await page.goto('/collectors/collector2');
    await expect(page.getByRole('heading', { level: 1, name: 'Devon Okafor' })).toBeVisible();
    await expect(page.getByTestId('collector-public-label')).toContainText('Verdun, Montréal');
    await expect(page.getByText(/km away/)).toBeVisible();
    // Phase 5: Devon accepts messages from members with a profile.
    await expect(page.getByRole('button', { name: 'Message Devon Okafor' })).toBeEnabled();

    await Promise.all(pending);
    const apiSamples = samples.filter((sample) => sample.url.startsWith(API_URL));
    expect(apiSamples.length, 'the API returned coordinates to check').toBeGreaterThan(0);
    const precise = samples.filter((sample) => decimalsOf(sample.value) > 3);
    expect(precise, `coordinates with more than 3 decimals: ${JSON.stringify(precise)}`).toEqual(
      [],
    );
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
