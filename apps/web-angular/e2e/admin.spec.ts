import { expect, test } from '@playwright/test';
import {
  SEED_PASSWORD,
  createOnboardedCollector,
  openAccountMenu,
  requireStack,
  signInThroughUi,
} from './support/stack';

/**
 * Admin console against the real local stack: the seed admin suspends and unsuspends a fresh
 * collector, and the audit log records both actions.
 */
test.describe('admin console', () => {
  requireStack();

  test('an admin suspends and unsuspends a collector; the audit log shows both', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const target = await createOnboardedCollector(request, 'suspend');

    await signInThroughUi(page, 'admin@orenjitrade.test', SEED_PASSWORD);
    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Admin sections' })
      .getByRole('link', { name: 'Users' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    await page.getByLabel('Search handle, name or email').fill(target.email);
    await expect(page).toHaveURL(/query=/);
    const row = page.getByRole('link', { name: new RegExp(target.handle) });
    await expect(row).toBeVisible();
    await expect(page.getByText('1 account')).toBeVisible();
    await row.click();

    // --- Suspend ---------------------------------------------------------------------------
    await expect(page.getByRole('heading', { level: 1, name: target.displayName })).toBeVisible();
    await expect(page.getByTestId('admin-user-status')).toHaveText('Active');
    await page.getByRole('button', { name: 'Suspend' }).click();
    const dialog = page.getByRole('dialog', { name: `Suspend @${target.handle}` });
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog.getByText('A reason is required.')).toBeVisible();
    await dialog.getByLabel('Reason').fill('E2E: fictional policy violation');
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(page.getByText(`@${target.handle} is suspended.`)).toBeVisible();
    await expect(page.getByTestId('admin-user-status')).toHaveText('Suspended');
    await expect(page.getByText('E2E: fictional policy violation').first()).toBeVisible();

    // --- Unsuspend -------------------------------------------------------------------------
    await page.getByRole('button', { name: 'Unsuspend' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lift suspension' }).click();
    await expect(page.getByText(`@${target.handle} can use OrenjiTrade again.`)).toBeVisible();
    await expect(page.getByTestId('admin-user-status')).toHaveText('Active');

    // --- Audit log -------------------------------------------------------------------------
    await page.getByRole('link', { name: 'Full audit log' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/audit-logs\\?.*targetId=${target.id}`));
    await expect(page.getByRole('heading', { level: 1, name: 'Audit logs' })).toBeVisible();
    const entries = page.getByRole('table', { name: 'Audit entries' });
    await expect(entries.getByText('Suspended an account')).toBeVisible();
    await expect(entries.getByText('Lifted a suspension')).toBeVisible();
    await expect(entries.getByText('user.suspend', { exact: true })).toBeVisible();
    await expect(entries.getByText('user.unsuspend', { exact: true })).toBeVisible();
    await expect(entries.getByText('@admin').first()).toBeVisible();

    // Filtering by action narrows the list.
    await page.getByLabel('Action', { exact: true }).click();
    await page.getByRole('option', { name: 'Lifted a suspension' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/action=user\.unsuspend/);
    await expect(entries.getByText('Lifted a suspension')).toBeVisible();
    await expect(entries.getByText('Suspended an account')).toHaveCount(0);
  });

  test('collectors cannot open the admin console', async ({ page }) => {
    await signInThroughUi(page, 'collector3@orenjitrade.test', SEED_PASSWORD);
    await page.goto('/admin/users');
    // The guard's notice is a 5 s snack bar: check it before waiting for the (slower) map page.
    await expect(page.getByText('The admin console is limited to staff accounts.')).toBeVisible();
    await expect(page).toHaveURL(/\/map$/);
  });

  test('moderators only see the moderation areas', async ({ page }) => {
    await signInThroughUi(page, 'moderator@orenjitrade.test', SEED_PASSWORD);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('This admin area is limited to administrators.')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Admin sections' });
    await expect(nav.getByText('Reports')).toBeVisible();
    await expect(nav.getByText('Users')).toHaveCount(0);
  });
});

test.describe('admin console entry', () => {
  requireStack();

  test('the account menu offers Admin to administrators only', async ({ page }) => {
    await signInThroughUi(page, 'superadmin@orenjitrade.test', SEED_PASSWORD);
    await openAccountMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Admin' })).toBeVisible();
  });
});
