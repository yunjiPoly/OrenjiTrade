import { APIRequestContext, expect, test } from '@playwright/test';
import {
  API_URL,
  SEED_PASSWORD,
  authHeader,
  createStaffMember,
  emulatorSignIn,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Platform rules in the admin console (Phase 2) against the real local stack: a super admin
 * switches a feature flag (with confirmation) and edits a usage limit inline; both persist after
 * a reload. Admins see the rules read-only. The flag (`credits`, no screen uses it yet) and the
 * limit (PREMIUM `saved_searches.max`, not consumed yet) are restored afterwards. Each test uses
 * a fresh account promoted by the seed super admin (and demoted at the end).
 */

const SUPER_ADMIN = 'superadmin@orenjitrade.test';
const FLAG = 'credits';
const LIMIT_PLAN = 'PREMIUM';
const LIMIT_KEY = 'saved_searches.max';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercent?: number;
  description?: string;
}

interface UsageLimit {
  id: string;
  planCode: string;
  key: string;
  window?: string;
  maxValue?: number;
  unlimited?: boolean;
  description?: string;
}

async function superAdminToken(api: APIRequestContext): Promise<string> {
  return emulatorSignIn(api, SUPER_ADMIN, SEED_PASSWORD);
}

async function setFlag(api: APIRequestContext, token: string, flag: FeatureFlag): Promise<void> {
  const response = await api.put(`${API_URL}/api/v1/admin/feature-flags/${flag.key}`, {
    headers: authHeader(token),
    data: {
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent,
      description: flag.description,
    },
  });
  expect(response.ok(), `restore flag ${flag.key}`).toBeTruthy();
}

test.describe('admin platform rules', () => {
  requireStack();

  test('a super admin switches a feature flag after confirming; it persists', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const token = await superAdminToken(request);
    const flags = await request.get(`${API_URL}/api/v1/admin/feature-flags`, {
      headers: authHeader(token),
    });
    const original = ((await flags.json()) as FeatureFlag[]).find((flag) => flag.key === FLAG)!;
    expect(original, `flag ${FLAG} exists`).toBeTruthy();
    // Deterministic start: the flag is on.
    await setFlag(request, token, { ...original, enabled: true });
    const staff = await createStaffMember(request, 'flags', ['SUPER_ADMIN']);

    try {
      await signInThroughUi(page, staff.email, staff.password);
      await page.goto('/admin');
      await page
        .getByRole('navigation', { name: 'Admin sections' })
        .getByRole('link', { name: 'Feature flags' })
        .click();
      await expect(page).toHaveURL(/\/admin\/feature-flags$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Feature flags' })).toBeVisible();

      const toggle = page.getByRole('switch', { name: FLAG });
      const state = page.getByTestId(`flag-state-${FLAG}`);
      await expect(state).toHaveText('On');
      await expect(toggle).toBeChecked();

      // Cancelling the confirmation changes nothing.
      await toggle.click();
      let dialog = page.getByRole('dialog', { name: `Turn off ${FLAG}?` });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await expect(toggle).toBeChecked();
      await expect(state).toHaveText('On');

      // Confirming switches it off.
      await toggle.click();
      dialog = page.getByRole('dialog', { name: `Turn off ${FLAG}?` });
      await dialog.getByRole('button', { name: 'Turn off' }).click();
      await expect(page.getByText(`${FLAG} is now off.`)).toBeVisible();
      await expect(state).toHaveText('Off');
      await expect(toggle).not.toBeChecked();

      await page.reload();
      await expect(page.getByTestId(`flag-state-${FLAG}`)).toHaveText('Off');
      await expect(page.getByRole('switch', { name: FLAG })).not.toBeChecked();
      const publicFlags = await request.get(`${API_URL}/api/v1/public/feature-flags`);
      expect(((await publicFlags.json()) as Record<string, boolean>)[FLAG]).toBe(false);

      // And back on.
      await page.getByRole('switch', { name: FLAG }).click();
      await page
        .getByRole('dialog', { name: `Turn on ${FLAG}?` })
        .getByRole('button', { name: 'Turn on' })
        .click();
      await expect(page.getByText(`${FLAG} is now on.`)).toBeVisible();
      await page.reload();
      await expect(page.getByTestId(`flag-state-${FLAG}`)).toHaveText('On');

      // The audit log records the changes.
      await page.goto('/admin/audit-logs?action=feature_flag.update');
      await expect(
        page
          .getByRole('table', { name: 'Audit entries' })
          .getByText('Changed a feature flag')
          .first(),
      ).toBeVisible();
    } finally {
      await setFlag(request, token, original);
      await staff.demote();
    }
  });

  test('a super admin edits a usage limit inline; it persists and reaches the plans', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const token = await superAdminToken(request);
    const list = await request.get(`${API_URL}/api/v1/admin/usage-limits?plan=${LIMIT_PLAN}`, {
      headers: authHeader(token),
    });
    const original = ((await list.json()) as UsageLimit[]).find(
      (limit) => limit.key === LIMIT_KEY,
    )!;
    expect(original, `${LIMIT_PLAN} ${LIMIT_KEY} exists`).toBeTruthy();
    const next = original.unlimited ? 57 : (original.maxValue ?? 0) + 7;
    const name = `${LIMIT_PLAN} ${LIMIT_KEY}`;
    const staff = await createStaffMember(request, 'limits', ['SUPER_ADMIN']);

    try {
      await stubCardImages(page);
      await signInThroughUi(page, staff.email, staff.password);
      await page.goto('/admin/usage-limits');
      await expect(page.getByRole('heading', { level: 1, name: 'Usage limits' })).toBeVisible();
      const cell = page.getByTestId(`limit-${LIMIT_PLAN}-${LIMIT_KEY}`);
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
      await expect(page.getByText(`${name} is now ${next}.`)).toBeVisible();
      await expect(cell).toHaveText(String(next));

      await page.reload();
      await expect(page.getByTestId(`limit-${LIMIT_PLAN}-${LIMIT_KEY}`)).toHaveText(String(next));

      // The public plans show the new value at once.
      await page.goto('/premium');
      const premium = page.getByRole('article', { name: 'Premium' });
      await expect(
        premium.getByRole('listitem').filter({ hasText: 'Saved searches' }),
      ).toContainText(String(next));
      await expect(premium.getByRole('button', { name: 'Upgrade to Premium' })).toBeDisabled();
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
    await expect(page.getByTestId(`limit-${LIMIT_PLAN}-${LIMIT_KEY}`)).toBeVisible();
    await expect(page.getByRole('button', { name: `Edit ${LIMIT_PLAN} ${LIMIT_KEY}` })).toHaveCount(
      0,
    );
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
