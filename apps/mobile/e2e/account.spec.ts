import fs from 'node:fs';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  emulatorSignIn,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Settings → Account, Privacy and Notifications against the real stack: the data export, the
 * account deletion request (re-authentication, confirmation, the deletion-pending screen) and its
 * cancellation, privacy switches and notification preferences. Every account is a fresh,
 * fictional one: seed accounts are never deleted.
 */
test.describe('mobile account settings', () => {
  requireStack();

  test('a collector downloads their data, requests deletion, then cancels it', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'leave', 'Mobile Leaver');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings').getByRole('link', { name: 'Account' }).click();
    const account = screen(page, 'settings-account');
    await expect(account.getByTestId('account-email')).toHaveText(collector.email, {
      timeout: 30_000,
    });

    // Data export (web build: a JSON download).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      account.getByRole('button', { name: 'Download my data' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^orenjitrade-export-${collector.handle}-\\d{4}-\\d{2}-\\d{2}\\.json$`)
    );
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(exported)).toContain(collector.handle);
    await expect(snackbar(page)).toContainText('is ready', { timeout: 30_000 });

    // Deletion: validation, a wrong password, then the real request.
    await account.getByRole('button', { name: 'Delete my account' }).click();
    const deletion = screen(page, 'delete-account');
    await expect(deletion.getByRole('heading', { name: 'Delete your account' })).toBeVisible();
    await deletion.getByRole('button', { name: 'Delete my account' }).click();
    await expect(deletion.getByText('Enter your password to continue.')).toBeVisible();
    await expect(deletion.getByText('Please confirm to continue.')).toBeVisible();

    await deletion
      .getByLabel('Why are you leaving? (optional)')
      .fill('Just testing the mobile flow.');
    await deletion.getByRole('checkbox', { name: 'Download a copy of my data first' }).click();
    await deletion.getByRole('checkbox', { name: /I understand/ }).click();
    await deletion.getByLabel('Password', { exact: true }).fill('not-the-password');
    await deletion.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByTestId('delete-confirm-confirm').click();
    await expect(deletion.getByTestId('delete-error')).toContainText(
      'That password is not correct.',
      {
        timeout: 30_000,
      }
    );

    await deletion.getByLabel('Password', { exact: true }).fill(collector.password);
    await deletion.getByRole('button', { name: 'Delete my account' }).click();
    const confirm = page.getByTestId('delete-confirm');
    await expect(confirm.getByText('Delete your account?')).toBeVisible();
    await page.getByTestId('delete-confirm-confirm').click();

    // The gate shows the deletion-pending screen.
    const pending = screen(page, 'suspended');
    await expect(
      pending.getByRole('heading', { name: 'Your account is scheduled for deletion' })
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(pending.getByTestId('deletion-scheduled')).toContainText(
      'will be permanently deleted on'
    );

    // The request revoked the collector's sessions: ask the API with a fresh token.
    const token = await emulatorSignIn(request, collector.email, collector.password);
    const requests = await request.get(`${API_URL}/api/v1/me/deletion-requests`, {
      headers: authHeader(token),
    });
    expect(requests.status()).toBe(200);
    const list = (await requests.json()) as { status: string; exportRequested: boolean }[];
    // "Download a copy of my data first" was unticked.
    expect(list.find((entry) => entry.status === 'PENDING')?.exportRequested).toBe(false);

    // Changed their mind.
    await pending.getByRole('button', { name: 'Cancel deletion' }).click();
    await expect(snackbar(page)).toHaveText('Deletion cancelled. Welcome back!', {
      timeout: 30_000,
    });
    await openTab(page, 'Profile');
    await expect(screen(page, 'profile').getByTestId('profile-name')).toHaveText('Mobile Leaver', {
      timeout: 30_000,
    });
  });

  test('privacy switches and notification preferences are saved', async ({ page, request }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'prefs', 'Mobile Prefs');
    await signInThroughUi(page, collector.email, collector.password);
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-settings').click();

    // Privacy: every change is saved at once.
    await screen(page, 'settings').getByRole('link', { name: 'Privacy' }).click();
    const privacy = screen(page, 'settings-privacy');
    const wishlist = privacy.getByRole('switch', { name: 'Show my wishlist on my profile' });
    await expect(wishlist).toBeVisible({ timeout: 30_000 });
    const before = (await wishlist.getAttribute('aria-checked')) === 'true';
    await wishlist.click();
    await expect(privacy.getByTestId('privacy-status')).toContainText('All changes saved', {
      timeout: 30_000,
    });
    await privacy.getByRole('radio', { name: 'Private' }).click();
    await expect(privacy.getByTestId('privacy-status')).toContainText('All changes saved', {
      timeout: 30_000,
    });

    const saved = await request.get(`${API_URL}/api/v1/me/settings/privacy`, {
      headers: authHeader(collector.idToken),
    });
    const settings = (await saved.json()) as {
      wishlistVisible: boolean;
      profileVisibility: string;
      discoverable: boolean;
    };
    expect(settings.wishlistVisible).toBe(!before);
    expect(settings.profileVisibility).toBe('PRIVATE');
    expect(settings.discoverable).toBe(false);

    // Notifications: switch a channel off and save.
    await page.goBack();
    await screen(page, 'settings').getByRole('link', { name: 'Notifications' }).click();
    const notifications = screen(page, 'settings-notifications');
    const email = notifications.getByTestId('notif-master-email');
    await expect(email).toBeVisible({ timeout: 30_000 });
    const emailBefore = (await email.getAttribute('aria-checked')) === 'true';
    await email.click();
    await notifications.getByRole('button', { name: 'Save preferences' }).click();
    await expect(snackbar(page)).toHaveText('Notification preferences saved.', { timeout: 30_000 });
    const notif = await request.get(`${API_URL}/api/v1/me/settings/notifications`, {
      headers: authHeader(collector.idToken),
    });
    expect(((await notif.json()) as { emailEnabled: boolean }).emailEnabled).toBe(!emailBefore);
  });
});
