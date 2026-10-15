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

  test('admins validate a game schema and run a mock catalog sync', async ({ page, request }) => {
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

    // Cards: find a card, open its editor, then import the Riftbound mock catalog.
    await page.goto('/admin/cards');
    await page.getByLabel('Name, text or printing code').fill('Lantern');
    await expect(page).toHaveURL(/query=Lantern/);
    await page.getByRole('link', { name: 'Lantern Fox Spirit', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Lantern Fox Spirit' })).toBeVisible();
    await expect(page.getByLabel('ATK')).toHaveValue('800');
    await expect(
      page.getByRole('button', { name: 'Edit printing AZR-EN011' }).first(),
    ).toBeEnabled();

    await page.goto('/admin/cards');
    const sync = page.getByRole('region', { name: 'Catalog sync' });
    await sync.getByRole('combobox', { name: 'Game' }).click();
    await page.getByRole('option', { name: 'Riftbound' }).click();
    await sync.getByRole('button', { name: 'Run sync' }).click();
    await expect(page.getByText('Sync queued for riftbound.')).toBeVisible();
    await expect(
      page.getByText(/Sync finished: \d+ cards and \d+ printings updated\./),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      sync.getByRole('table', { name: 'Catalog sync runs' }).getByRole('row').nth(1),
    ).toContainText('Succeeded');
    await staff.demote();
  });
});
