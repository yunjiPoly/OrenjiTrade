import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, expect, mapMarker, test } from './support/fixtures';
import { besides, randomCentre } from './support/places';

/**
 * Acceptance — account deletion (spec § 50): a discoverable collector with a public binder
 * requests the deletion of their account (password re-authentication); their inventory
 * disappears publicly and they disappear from the map at once, for another collector. After the
 * grace period (fast-forwarded: one of the suite's two test-clock shortcuts) the
 * `account-deletion` job runs through `/internal/jobs/account-deletion` with the local service token, and the personal
 * data is handled per the workflow: the identity-provider account is deleted, the account is
 * anonymised, the location and inventory are purged, while legal consents and the audit trail
 * are kept (checked by an administrator in the admin console).
 */

interface NearbyAnswer {
  collectors: { handle: string }[];
}

interface AdminUserDetail {
  account: { status: string; email: string | null; handle: string; displayName: string };
  deletedAt: string | null;
  locationLabel: string | null;
  consents: unknown[];
  deletionRequest: { status: string } | null;
}

test.describe('acceptance: account deletion', () => {
  requireStack();

  test('deletion hides the inventory and the map marker, then the job erases personal data', async ({
    api,
    actors,
  }) => {
    test.setTimeout(210_000);
    const area = randomCentre('deletion');
    const card = 'Frostbite Sorceress';
    const { collector: doomed, binder } = await api.seller(
      'acc-doomed',
      area,
      [{ code: 'AZR-EN031', extra: { askingPrice: 22 } }],
      {
        displayName: `Dora Leaving ${suffix()}`,
      },
    );
    const viewer = await api.collector('acc-delviewer', {
      area: besides(area),
      radiusKm: 10,
      displayName: `Vic Viewer ${suffix()}`,
    });
    const admin = await api.staff('acc-deladmin', ['ADMIN']);

    // --- Before: the viewer finds the collector on the map and their public binder -------------
    const pageV = await actors.anonymous();
    await pageV.goto('/auth/sign-in');
    await pageV.getByLabel('Email').fill(viewer.email);
    await pageV.getByLabel('Password', { exact: true }).fill(viewer.password);
    await pageV.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(pageV).toHaveURL(/\/map$/, { timeout: 20_000 });
    await expect(mapMarker(pageV, doomed.displayName)).toBeVisible({ timeout: 20_000 });
    await pageV.goto(`/binders/${binder.id}`);
    await expect(pageV.getByRole('article', { name: card, exact: true })).toBeVisible();

    // --- The collector requests the deletion (re-authentication with the password) -----------
    const pageD = await actors.open(doomed);
    await pageD.goto('/settings/account');
    await pageD.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = await dialogReady(pageD.getByRole('dialog', { name: 'Delete your account' }));
    await dialog.getByRole('checkbox', { name: 'Download a copy of my data first' }).uncheck();
    await dialog.getByLabel('Password').fill(doomed.password);
    await dialog.getByRole('checkbox', { name: /I understand/ }).check();
    await dialog.getByRole('button', { name: 'Delete my account' }).click();
    await expect(pageD).toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });
    await expect(
      pageD.getByRole('heading', { level: 1, name: 'Your account is scheduled for deletion' }),
    ).toBeVisible();

    // --- The inventory disappears publicly ----------------------------------------------------------
    await pageV.reload();
    await expect(
      pageV.getByRole('heading', { name: 'This binder is not available' }),
    ).toBeVisible();
    await expect(pageV.getByRole('article', { name: card, exact: true })).toHaveCount(0);
    await pageV.goto(`/collectors/${doomed.handle}`);
    await expect(
      pageV.getByRole('heading', { name: 'This collector is not available' }),
    ).toBeVisible();
    const inventory = await api.call('GET', `/api/v1/collectors/${doomed.handle}/inventory`, {
      token: viewer.idToken,
    });
    expect(inventory.status).toBe(404);

    // --- The collector disappears from the map ----------------------------------------------------
    await pageV.goto('/map');
    await expect(pageV.getByTestId('map-status')).toContainText(/within \d+ km/, {
      timeout: 20_000,
    });
    await expect(mapMarker(pageV, doomed.displayName)).toHaveCount(0);
    const nearby = await api.ok<NearbyAnswer>('GET', '/api/v1/collectors/nearby', {
      token: viewer.idToken,
    });
    expect(nearby.collectors.map((collector) => collector.handle)).not.toContain(doomed.handle);

    // --- Grace period over → the account-deletion job via the internal endpoint ---------------
    api.fastForwardDeletionGracePeriod(doomed.id);
    const run = await api.runJob<{ processed: number; failed: number }>('account-deletion');
    expect(run.processed).toBeGreaterThanOrEqual(1);

    // The identity-provider account is gone: the old credentials no longer sign in.
    expect(await api.emulatorSignInError(doomed.email, doomed.password)).toMatch(
      /EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|USER_NOT_FOUND/,
    );

    // Anonymised account, purged location; consents and audit trail kept.
    const detail = await api.ok<AdminUserDetail>('GET', `/api/v1/admin/users/${doomed.id}`, {
      token: admin.idToken,
    });
    expect(detail.account.status).toBe('DELETED');
    expect(detail.account.email).toBe(`deleted+${doomed.id}@anonymized.invalid`);
    expect(detail.account.handle).toMatch(/^deleted_[0-9a-f]{16}$/);
    expect(detail.account.displayName).toBe('Deleted collector');
    expect(detail.deletedAt).toBeTruthy();
    expect(detail.locationLabel).toBeNull();
    expect(detail.consents.length, 'legal consents are kept').toBeGreaterThan(0);
    expect((await api.call('GET', `/api/v1/public/binders/${binder.id}`)).status).toBe(404);

    // The administrator sees the deleted account and the trail in the admin console.
    const pageA = await actors.open(admin);
    await pageA.goto(`/admin/users/${doomed.id}`);
    await expect(pageA.getByRole('heading', { level: 1, name: 'Deleted collector' })).toBeVisible();
    await expect(pageA.getByTestId('admin-user-status')).toHaveText('Deleted');
    await expect(pageA.getByText(`deleted+${doomed.id}@anonymized.invalid`)).toBeVisible();
    await pageA.getByRole('link', { name: 'Full audit log' }).click();
    await expect(pageA).toHaveURL(new RegExp(`/admin/audit-logs\\?.*targetId=${doomed.id}`));
    const entries = pageA.getByRole('table', { name: 'Audit entries' });
    await expect(entries.getByText('Requested account deletion')).toBeVisible();
    await expect(entries.getByText('Completed account deletion')).toBeVisible();
  });
});
