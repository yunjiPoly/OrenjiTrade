import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, escapeRegExp, expect, signIn, test } from './support/fixtures';

/**
 * Acceptance — collector reporting (spec § 50): a collector opens another collector's profile,
 * presses Report, the popup asks why, Confirm stays disabled until a reason is chosen, the report
 * is confirmed; an administrator sees it in Admin → Reports, takes an action (assigns it, sends a
 * warning with a note) and finds the decision in the audit log; the reporter is told it was
 * reviewed.
 */
test.describe('acceptance: collector reporting', () => {
  requireStack();

  test('profile → report popup → reason → confirm → admin sees → admin action → audit log', async ({
    page,
    api,
    actors,
  }) => {
    test.setTimeout(180_000);
    const reporter = await api.collector('acc-reporter', {
      displayName: `Rita Reporter ${suffix()}`,
    });
    const reported = await api.collector('acc-reported', {
      displayName: `Rex Reported ${suffix()}`,
    });
    const admin = await api.staff('acc-repadmin', ['ADMIN']);

    // --- Profile → report popup → reason → confirm ------------------------------------------------
    await signIn(page, reporter);
    await page.goto(`/collectors/${reported.handle}`);
    await expect(page.getByRole('heading', { level: 1, name: reported.displayName })).toBeVisible();
    await page.getByRole('button', { name: `Report ${reported.displayName}` }).click();
    const dialog = await dialogReady(page.getByRole('dialog', { name: 'Report collector' }));
    await expect(dialog.getByText('Why are you reporting this user?')).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Confirm' });
    await expect(confirm).toBeDisabled();
    await dialog
      .getByRole('radiogroup', { name: 'Why are you reporting this user?' })
      .getByRole('radio', { name: 'Scam or fraud' })
      .check();
    await expect(confirm).toBeEnabled();
    const details = `Asked for payment outside the platform, then vanished (E2E ${suffix()}).`;
    await dialog.getByRole('textbox', { name: 'Details (optional)' }).fill(details);
    await confirm.click();
    const sent = page.getByRole('dialog', { name: 'Report sent' });
    await expect(sent).toContainText('Our moderation team will review your report');
    await sent.getByRole('button', { name: 'Done' }).click();

    // --- The admin sees the report --------------------------------------------------------------
    const staff = await actors.open(admin);
    await staff.goto('/admin');
    await staff
      .getByRole('navigation', { name: 'Admin sections' })
      .getByRole('link', { name: 'Reports' })
      .click();
    await expect(staff.getByRole('heading', { level: 1, name: 'Collector reports' })).toBeVisible();
    await staff
      .getByRole('link', {
        name: new RegExp(`^Report about ${escapeRegExp(reported.displayName)}`),
      })
      .click();
    await expect(staff.getByTestId('report-status')).toHaveText('Open');
    await expect(staff.getByTestId('report-details')).toHaveText(details);
    await expect(staff.getByRole('region', { name: 'Reporter' })).toContainText(
      `@${reporter.handle}`,
    );

    // --- Admin action: assign, then resolve with a warning -----------------------------------------
    await staff.getByRole('button', { name: 'Assign to me' }).click();
    await expect(staff.getByTestId('report-status')).toHaveText('Under review');
    await staff.getByRole('button', { name: 'Resolve', exact: true }).click();
    const resolve = await dialogReady(
      staff.getByRole('dialog', {
        name: `Resolve report about @${reported.handle}`,
      }),
    );
    await resolve.getByRole('radio', { name: 'Send a warning' }).check();
    await resolve
      .getByRole('textbox', { name: 'Resolution note' })
      .fill('Off-platform payment request; warned.');
    await resolve.getByRole('button', { name: 'Resolve report' }).click();
    await expect(staff.getByText('Report resolved. The action is in the audit log.')).toBeVisible();
    await expect(staff.getByTestId('report-status')).toHaveText('Action taken');
    const reportId = staff.url().split('/').pop() as string;

    // --- Audit log ------------------------------------------------------------------------------
    await staff.getByRole('link', { name: 'Audit log', exact: true }).click();
    await expect(staff).toHaveURL(new RegExp(`/admin/audit-logs\\?.*targetId=${reportId}`));
    const entries = staff.getByRole('table', { name: 'Audit entries' });
    await expect(entries.getByText('Resolved a collector report')).toBeVisible();
    await expect(entries.getByText('REPORT_RESOLVED', { exact: true })).toBeVisible();
    await expect(entries.getByText('report.assign', { exact: true })).toBeVisible();
    await expect(entries.getByText(`@${admin.handle}`).first()).toBeVisible();

    // --- The reporter is told the report was reviewed ---------------------------------------------
    await page.goto('/settings/reports');
    await expect(
      page
        .getByRole('list', { name: 'My reports' })
        .getByRole('listitem')
        .filter({ hasText: reported.displayName }),
    ).toContainText('Reviewed — the team took action');
  });
});
