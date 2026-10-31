import { APIRequestContext, expect, test } from '@playwright/test';
import {
  API_URL,
  SEED_PASSWORD,
  authHeader,
  createOnboardedCollector,
  createStaffMember,
  emulatorSignIn,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Platform rules in the admin console (Phase 2) against the real local stack: a super admin edits
 * a usage limit inline (one limit per key, the same for every collector since stage F1); it
 * persists after a reload and reaches every collector at once. Admins see the rules read-only.
 * The limit (`binder.views.per_day`, only ever raised here, so a spec running at the same time is
 * never refused because of it) is restored afterwards. Switching a feature flag changes shared
 * state: it runs alone, after every other spec (`admin-flags.spec.ts`). Each test uses a fresh
 * account promoted by the seed super admin (and demoted at the end).
 */

const SUPER_ADMIN = 'superadmin@orenjitrade.test';
/** A flag the read-only check looks at (never changed here). */
const FLAG = 'publicChat';
const LIMIT_KEY = 'binder.views.per_day';
/** Its description in `usage_limit`, the name the admin console gives it. */
const LIMIT_NAME = 'Public binder views per day';

interface UsageLimit {
  id: string;
  key: string;
  window?: string;
  maxValue?: number;
  unlimited?: boolean;
  description?: string;
}

async function superAdminToken(api: APIRequestContext): Promise<string> {
  return emulatorSignIn(api, SUPER_ADMIN, SEED_PASSWORD);
}

test.describe('admin platform rules', () => {
  requireStack();

  test('a super admin edits a usage limit inline; it persists and reaches every collector', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const token = await superAdminToken(request);
    const list = await request.get(`${API_URL}/api/v1/admin/usage-limits`, {
      headers: authHeader(token),
    });
    const limits = (await list.json()) as UsageLimit[];
    expect(
      limits.filter((limit) => limit.key === LIMIT_KEY),
      'one row per key',
    ).toHaveLength(1);
    const original = limits.find((limit) => limit.key === LIMIT_KEY)!;
    const next = original.unlimited ? 57 : (original.maxValue ?? 0) + 7;
    const name = LIMIT_NAME;
    const staff = await createStaffMember(request, 'limits', ['SUPER_ADMIN']);

    try {
      await stubCardImages(page);
      await signInThroughUi(page, staff.email, staff.password);
      await page.goto('/admin/usage-limits');
      await expect(page.getByRole('heading', { level: 1, name: 'Usage limits' })).toBeVisible();
      const cell = page.getByTestId(`limit-${LIMIT_KEY}`);
      await expect(cell).toBeVisible();

      await page.getByRole('button', { name: `Edit ${name}` }).click();
      const input = page.getByLabel(`${name} value`);
      await expect(input).toBeFocused();

      // Inline validation: nothing is sent for an invalid value.
      await input.fill('-1');
      await page.getByRole('button', { name: `Save ${name}` }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Use 0 or more.' })).toBeVisible();

      // Escape cancels; Enter saves.
      await input.press('Escape');
      await expect(page.getByLabel(`${name} value`)).toHaveCount(0);
      await page.getByRole('button', { name: `Edit ${name}` }).click();
      await page.getByLabel(`${name} value`).fill(String(next));
      await page.getByLabel(`${name} value`).press('Enter');
      await expect(
        page.getByText(`${LIMIT_KEY} is now ${next} for every collector.`),
      ).toBeVisible();
      await expect(cell).toHaveText(String(next));

      await page.reload();
      await expect(page.getByTestId(`limit-${LIMIT_KEY}`)).toHaveText(String(next));

      // Every collector has the new value at once (no plan, no per-account value).
      const collector = await createOnboardedCollector(request, 'limitsread');
      const mine = await request.get(`${API_URL}/api/v1/me/limits`, {
        headers: authHeader(collector.idToken),
      });
      const status = ((await mine.json()) as { limits: { key: string; limit?: number }[] }).limits;
      expect(status.find((limit) => limit.key === LIMIT_KEY)?.limit).toBe(next);
    } finally {
      const response = await request.put(`${API_URL}/api/v1/admin/usage-limits/${original.id}`, {
        headers: authHeader(token),
        data: {
          unlimited: !!original.unlimited,
          maxValue: original.unlimited ? undefined : original.maxValue,
          window: original.window,
          description: original.description,
        },
      });
      expect(response.ok(), 'restore the usage limit').toBeTruthy();
      await staff.demote();
    }
  });

  test('administrators see the rules read-only', async ({ page, request }) => {
    test.setTimeout(90_000);
    const staff = await createStaffMember(request, 'readonly', ['ADMIN']);
    await signInThroughUi(page, staff.email, staff.password);
    await page.goto('/admin/feature-flags');
    await expect(page.getByText('Only super admins can change feature flags.')).toBeVisible();
    await expect(page.getByRole('switch', { name: FLAG })).toBeDisabled();

    await page.goto('/admin/usage-limits');
    await expect(page.getByText('Only super admins can change usage limits.')).toBeVisible();
    await expect(page.getByTestId(`limit-${LIMIT_KEY}`)).toBeVisible();
    await expect(page.getByRole('button', { name: `Edit ${LIMIT_NAME}` })).toHaveCount(0);
    await staff.demote();
  });

  test('admins validate a game schema, run a mock catalog sync, add a card and a printing', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await stubCardImages(page);
    const staff = await createStaffMember(request, 'catalog', ['ADMIN']);
    await signInThroughUi(page, staff.email, staff.password);

    // Games: the schema editor refuses invalid JSON before anything is sent.
    await page.goto('/admin/games?game=riftbound');
    await expect(page.getByRole('heading', { level: 2, name: /Riftbound/ })).toBeVisible();
    const schema = page.getByLabel('Schema (JSON)');
    await expect(page.getByText('Valid schema')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Metadata fields' })).toContainText('might');
    await schema.fill('{ "rarities": [');
    await expect(page.getByRole('alert').filter({ hasText: 'Not valid JSON' })).toBeVisible();
    await expect(schema).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByText('Valid schema')).toBeVisible();

    // Card data and images (board A12): the Riftbound mock catalog, its report, the cache.
    await page.goto('/admin/card-data');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Card data and images' }),
    ).toBeVisible();
    await page.locator('#cd-game').selectOption({ label: 'Riftbound' });
    await page.getByRole('radio', { name: 'None' }).click();
    await page.getByRole('button', { name: 'Run sync' }).click();
    await expect(page.getByText('Sync of Riftbound queued.')).toBeVisible();
    await expect(
      page.getByText(/Sync of Riftbound finished: [\d,]+ cards and [\d,]+ printings written\./),
    ).toBeVisible({ timeout: 60_000 });
    const runs = page.getByRole('table', { name: 'Catalog sync runs' });
    await expect(runs.getByRole('row').nth(1)).toContainText('Succeeded');
    await runs
      .getByRole('row')
      .nth(1)
      .getByRole('button', { name: /^Report of the Riftbound/ })
      .click();
    const report = page.getByTestId('sync-report');
    await expect(report.getByRole('heading', { name: 'Sync report' })).toBeVisible();
    await expect(report).toContainText('Cards read');
    await page.keyboard.press('Escape');
    await expect(report).toHaveCount(0);

    // Cards (board A11): find a card, open it in the drawer; New card, then Add printing.
    await page.goto('/admin/cards');
    await page.getByLabel('Name, text or printing code').fill('Lantern');
    await expect(page).toHaveURL(/query=Lantern/);
    await page.getByRole('button', { name: 'Lantern Fox Spirit', exact: true }).click();
    const drawer = page.getByTestId('card-drawer');
    await expect(drawer.getByRole('heading', { name: 'Lantern Fox Spirit' })).toBeVisible();
    await expect(page).toHaveURL(/open=/);
    await expect(drawer.getByLabel('ATK')).toHaveValue('800');
    await expect(
      drawer.getByRole('button', { name: 'Edit printing AZR-EN011' }).first(),
    ).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    const name = `E2E WH2 Card ${Date.now().toString(36)}`;
    await page.getByRole('button', { name: 'New card' }).click();
    await expect(drawer.getByRole('heading', { name: 'New card' }).first()).toBeVisible();
    await drawer.getByLabel('Game').selectOption({ label: 'Riftbound' });
    await drawer.getByRole('button', { name: 'Create card' }).click();
    await expect(drawer.getByText('A name is required.')).toBeVisible();
    await drawer.getByLabel('Name').fill(name);
    await drawer.getByRole('button', { name: 'Create card' }).click();
    await expect(page.getByText(`${name} created.`)).toBeVisible();
    await expect(drawer.getByRole('heading', { name })).toBeVisible();
    await expect(drawer.getByText('No printings yet.', { exact: false })).toBeVisible();
    await drawer.getByRole('button', { name: 'Add printing' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add printing' });
    await dialog.getByRole('combobox', { name: 'Set' }).click();
    await page.getByRole('option').first().click();
    await dialog.getByLabel('Collector number').fill('W2H001');
    await dialog.getByLabel('Printing code').fill('WH2-E2E1');
    await dialog.getByRole('button', { name: 'Add printing' }).click();
    await expect(page.getByText('Printing WH2-E2E1 added.')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Edit printing WH2-E2E1' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();

    await staff.demote();
  });
});
