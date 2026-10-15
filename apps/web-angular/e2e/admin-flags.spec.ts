import { APIRequestContext, expect, test } from '@playwright/test';
import {
  API_URL,
  SEED_PASSWORD,
  authHeader,
  createStaffMember,
  emulatorSignIn,
  requireStack,
  signInThroughUi,
} from './support/stack';

/**
 * A super admin switches a feature flag in the admin console (with confirmation); it persists
 * after a reload and the audit log records it. The flag is `publicChat` (on by default; the
 * community follows it), switched off and back on, so this spec changes shared state: it runs in
 * the `launch-config` project, alone, after every other spec (playwright.config.ts). Before stage
 * F1 it switched the `credits` flag, which no longer exists.
 */

const SUPER_ADMIN = 'superadmin@orenjitrade.test';
const FLAG = 'publicChat';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercent?: number;
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

test.describe('admin feature flags', () => {
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
});
