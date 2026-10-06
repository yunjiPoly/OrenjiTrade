import { expect, test } from './support/fixtures';
import {
  apiMyReports,
  apiSendText,
  apiStartConversation,
  createOnboardedCollector,
  openInApp,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/**
 * Mobile Phase 7 (collector reports) against the real, isolated stack with fresh fictional
 * collectors: Ada reports Ben from his profile (reasons as the API lists them, details, an
 * idempotent confirmation); the report shows in Settings → My reports with its status; a second
 * report while the first is open is refused (409) and explained. Ada also reports Cy from their
 * conversation's options (CONVERSATION context).
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile collector reports', () => {
  requireStack();

  test('report a collector from the profile → visible in My reports; a second one is refused', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const ada = await createOnboardedCollector(request, 'repa', `Ada Reporter ${suffix()}`);
    const ben = await createOnboardedCollector(request, 'repb', `Ben Reported ${suffix()}`);

    await signInThroughUi(page, ada.email, ada.password);
    await openInApp(page, `/collectors/${ben.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(ben.displayName, {
      timeout: 30_000,
    });
    await profile.getByRole('button', { name: `Report ${ben.displayName}` }).click();

    const report = screen(page, 'report');
    await expect(report.getByTestId('report-target')).toHaveText(ben.displayName);
    // The reasons of GET /public/report-reasons, in the dialog order.
    const reasons = report.getByRole('radio');
    await expect(reasons.first()).toHaveAccessibleName('Scam or fraud', { timeout: 30_000 });
    await expect(reasons).toHaveCount(7);
    await expect(report.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await report.getByRole('radio', { name: 'Harassment' }).click();
    await report.getByLabel('Details (optional)').fill('Insults after I declined a trade.');
    await report.getByRole('button', { name: 'Confirm' }).click();
    await expect(report.getByTestId('report-sent')).toContainText(
      `Our moderation team will review your report about ${ben.displayName}`,
      { timeout: 30_000 }
    );
    expect(await apiMyReports(request, ada)).toEqual([
      expect.objectContaining({
        status: 'OPEN',
        reason: 'HARASSMENT',
        reportedUser: expect.objectContaining({ handle: ben.handle }),
      }),
    ]);

    // My reports: the status only, never the decision's specifics.
    await report.getByRole('button', { name: 'My reports' }).click();
    const mine = screen(page, 'my-reports');
    await expect(mine.getByTestId('reports-summary')).toHaveText(
      '1 waiting for a decision · 0 reviewed',
      { timeout: 30_000 }
    );
    await expect(mine).toContainText(ben.displayName);
    await expect(mine).toContainText('Harassment');
    await expect(mine).toContainText('Waiting for a moderator');

    // A second report while the first is open: 409 REPORT_ALREADY_OPEN, explained.
    await openInApp(page, `/collectors/${ben.handle}`);
    await screen(page, 'collector')
      .getByRole('button', { name: `Report ${ben.displayName}` })
      .click({ timeout: 30_000 });
    const again = screen(page, 'report');
    await again.getByRole('radio', { name: 'Spam' }).click({ timeout: 30_000 });
    await again.getByRole('button', { name: 'Confirm' }).click();
    await expect(again.getByTestId('report-error')).toContainText(
      `You already reported ${ben.displayName}`,
      { timeout: 30_000 }
    );
    await expect(again.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(await apiMyReports(request, ada)).toHaveLength(1);
  });

  test('report the other collector of a conversation from its options', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const ada = await createOnboardedCollector(request, 'repc', `Ada Chatter ${suffix()}`);
    const cy = await createOnboardedCollector(request, 'repd', `Cy Spammer ${suffix()}`);
    const conversationId = await apiStartConversation(request, cy, ada.id);
    expect(await apiSendText(request, cy, conversationId, 'Buy my cards now!!!')).toBe(201);

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    await screen(page, 'messages')
      .getByTestId(`conversation-row-${cy.handle}`)
      .click({ timeout: 30_000 });
    const thread = screen(page, 'conversation');
    await expect(thread.getByText('Buy my cards now!!!')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('conversation-menu').click();
    await page.getByTestId('conversation-report').click();

    const report = screen(page, 'report');
    await report.getByRole('radio', { name: 'Spam' }).click({ timeout: 30_000 });
    await report.getByRole('button', { name: 'Confirm' }).click();
    await expect(report.getByTestId('report-sent')).toBeVisible({ timeout: 30_000 });
    expect(await apiMyReports(request, ada)).toEqual([
      expect.objectContaining({
        reason: 'SPAM',
        reportedUser: expect.objectContaining({ handle: cy.handle }),
      }),
    ]);
    await openInApp(page, '/settings/reports');
    await expect(screen(page, 'my-reports')).toContainText(cy.displayName, { timeout: 30_000 });
  });
});
