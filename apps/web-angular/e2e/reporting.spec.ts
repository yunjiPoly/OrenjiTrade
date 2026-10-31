import { Browser, Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  coordinateLeaks,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  createStaffMember,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Collector reporting (Phase 7, product spec § 23) against the real local stack: a collector
 * opens another collector's profile, presses Report, the "Report {handle}" popup asks "Why are
 * you reporting them?", "Send report" stays disabled until a reason is chosen, the report is
 * confirmed; a second report is refused inline (409). A moderator assigns the report, adds a note
 * and resolves it with a warning in Admin → Reports; an administrator finds the decision in the
 * audit log; the reporter sees the REPORT_DECISION notice and the outcome in Settings → My reports.
 * Every account is fictional and fresh.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

test.describe('collector reporting', () => {
  requireStack();

  test('report from the profile, duplicate refused, moderator resolves, audit log and reporter notified', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const reporter = await createOnboardedCollector(request, 'reporter', {
      displayName: `Rita Reporter ${suffix()}`,
    });
    const reported = await createOnboardedCollector(request, 'reported', {
      displayName: `Rex Reported ${suffix()}`,
    });
    const moderator = await createStaffMember(request, 'repmod', ['MODERATOR']);
    const admin = await createStaffMember(request, 'repadm', ['ADMIN']);
    try {
      // --- The reporter opens the profile and reports ----------------------------------------
      const page = await openSignedIn(browser, reporter);
      const watcher = watchCoordinates(page);
      await page.goto(`/collectors/${reported.handle}`);
      await expect(
        page.getByRole('heading', { level: 1, name: reported.displayName }),
      ).toBeVisible();
      await page.getByRole('button', { name: `More for ${reported.handle}` }).click();
      await page.getByRole('menuitem', { name: `Report ${reported.handle}` }).click();

      const dialog = page.getByRole('dialog', { name: /^Report / });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Why are you reporting them?')).toBeVisible();
      await expect(dialog).toContainText(reported.displayName);
      const reasons = dialog.getByRole('radiogroup', { name: 'Why are you reporting them?' });
      await expect(reasons.getByRole('radio')).toHaveCount(7);
      const labels = await reasons.locator('mat-radio-button').allInnerTexts();
      expect(labels.map((label) => label.trim())).toEqual([
        'Scam or fraud',
        'Counterfeit cards',
        'Harassment',
        'Spam',
        'Inappropriate behaviour',
        'Misleading listings',
        'Something else',
      ]);
      const confirm = dialog.getByRole('button', { name: 'Send report' });
      await expect(confirm).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();

      await reasons.getByRole('radio', { name: 'Spam' }).check();
      await expect(confirm).toBeEnabled();
      const details = `Sends the same outside-shop promotion to everyone (E2E ${suffix()}).`;
      await dialog.getByRole('textbox', { name: 'Details (optional)' }).fill(details);
      await confirm.click();

      const sent = page.getByRole('dialog', { name: 'Report sent' });
      await expect(sent).toBeVisible();
      await expect(sent).toContainText('Our moderation team will review your report');
      await expect(sent.getByRole('button', { name: 'Done' })).toBeFocused();
      await sent.getByRole('button', { name: 'Done' }).click();
      await expect(sent).toBeHidden();

      // The same collector again while the first report is open: refused inline (409).
      await page.getByRole('button', { name: `More for ${reported.handle}` }).click();
      await page.getByRole('menuitem', { name: `Report ${reported.handle}` }).click();
      const again = page.getByRole('dialog', { name: /^Report / });
      await again.getByRole('radio', { name: 'Harassment' }).check();
      await again.getByRole('button', { name: 'Send report' }).click();
      await expect(again.getByTestId('report-error')).toContainText(
        `You already reported ${reported.displayName}`,
      );
      await expect(again.getByRole('button', { name: 'Send report' })).toBeDisabled();
      await again.getByRole('button', { name: 'Cancel' }).click();
      await expect(again).toBeHidden();

      // Settings → My reports shows it waiting for a moderator.
      await page.goto('/settings/reports');
      const mine = page.getByRole('list', { name: 'My reports' });
      await expect(
        mine.getByRole('listitem').filter({ hasText: reported.displayName }),
      ).toContainText('Waiting for a moderator');

      // --- A moderator reviews it in Admin → Reports -----------------------------------------
      const staff = await openSignedIn(browser, moderator);
      await staff.goto('/admin');
      await expect(staff.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      await expect(
        staff.getByTestId('dashboard-tiles').locator('[data-tile="reports"]'),
      ).toContainText('Open reports');
      const nav = staff.getByRole('navigation', { name: 'Admin sections' });
      await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
      await nav.getByRole('link', { name: 'Reports' }).click();
      // Reports is one split view (web stage WH1, board A2): the list, then the open report.
      await expect(staff.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
      // A row is named by what it shows (review fix 1): the handle first, the number after.
      await staff
        .getByRole('link', { name: new RegExp(`^@${reported.handle}\\b.*Report #\\d+`) })
        .click();

      await expect(
        staff.getByRole('heading', {
          level: 2,
          name: new RegExp(`^Report #\\d+ about ${reported.displayName}$`),
        }),
      ).toBeVisible();
      await expect(staff).toHaveURL(/\/admin\/reports\/[0-9a-f-]{36}/);
      await expect(staff.getByTestId('report-status')).toHaveText('Open');
      await expect(staff.getByTestId('report-details')).toContainText(details);
      await expect(staff.getByRole('region', { name: 'Reporter' })).toContainText(
        `@${reporter.handle}`,
      );
      await expect(staff.getByRole('region', { name: 'Reported collector' })).toContainText(
        `@${reported.handle}`,
      );
      await expect(staff.getByRole('region', { name: 'History' })).toContainText('Recent reports');

      await staff.getByRole('button', { name: 'Assign to me' }).click();
      await expect(staff.getByText(/^Report #\d+ is assigned to you\.$/)).toBeVisible();
      await expect(staff.getByTestId('report-status')).toHaveText('Under review');

      const note = `Asked both collectors for screenshots (E2E ${suffix()}).`;
      await staff.getByRole('textbox', { name: 'Add a note' }).fill(note);
      await staff.getByRole('button', { name: 'Add note' }).click();
      await expect(staff.getByText('Note added.')).toBeVisible();
      await expect(staff.getByRole('list', { name: 'Moderator notes' })).toContainText(note);

      await staff.getByRole('button', { name: 'Resolve…' }).click();
      // The resolve dialog (board A3): radio cards, Suspend and Ban for administrators only.
      const resolve = staff.getByRole('dialog', {
        name: new RegExp(`^Resolve report #\\d+ about @${reported.handle}$`),
      });
      await expect(resolve.getByRole('radio', { name: /^Suspend the account/ })).toBeDisabled();
      await expect(resolve.getByRole('radio', { name: /^Ban the account/ })).toBeDisabled();
      await expect(resolve.getByText('Administrators only.').first()).toBeVisible();
      await resolve.getByRole('button', { name: 'Resolve report' }).click();
      await expect(resolve.getByText('Choose the action to take.')).toBeVisible();
      await expect(resolve.getByText('A note is required.')).toBeVisible();
      await resolve.getByRole('radio', { name: /^Send a warning/ }).check();
      // The arrows stay inside the Action group (review fix 1): past the locked Suspend and Ban
      // they wrap, and never reach "Dismiss".
      await resolve.getByRole('radio', { name: /^Send a warning/ }).press('ArrowDown');
      await expect(resolve.getByRole('radio', { name: /^Pause their listings/ })).toBeChecked();
      await resolve.getByRole('radio', { name: /^Pause their listings/ }).press('ArrowDown');
      await expect(resolve.getByRole('radio', { name: /^Send a warning/ })).toBeChecked();
      await expect(resolve.getByRole('radio', { name: 'Take action' })).toBeChecked();
      await resolve
        .getByRole('textbox', { name: /^Resolution note/ })
        .fill('Repeated spam; warned.');
      await expect(
        resolve.getByRole('checkbox', { name: 'Tell the reporter the report was reviewed' }),
      ).toBeChecked();
      // The confirm button names the action.
      await resolve.getByRole('button', { name: 'Warn and resolve' }).click();
      await expect(staff.getByText(/^Report #\d+ resolved: warning\.$/)).toBeVisible();
      await expect(staff.getByText('Recorded in the audit log.').first()).toBeVisible();
      await expect(staff.getByTestId('report-status')).toHaveText('Action taken');
      await expect(staff.getByRole('region', { name: 'Resolution' })).toContainText('Warning');
      await expect(staff.getByRole('button', { name: 'Resolve…' })).toHaveCount(0);
      const reportUrl = staff.url();
      const reportId = reportUrl.split('/').pop() as string;
      await staff.context().close();

      // --- An administrator finds the decision in the audit log ------------------------------
      const adminPage = await openSignedIn(browser, admin);
      await adminPage.goto(`/admin/reports/${reportId}`);
      await expect(adminPage.getByTestId('report-status')).toHaveText('Action taken');
      await adminPage
        .getByRole('main')
        .getByRole('link', { name: 'Audit log', exact: true })
        .click();
      await expect(adminPage).toHaveURL(new RegExp(`/admin/audit-logs\\?.*targetId=${reportId}`));
      const entries = adminPage.getByRole('table', { name: 'Audit entries' });
      await expect(entries.getByText('Resolved a collector report')).toBeVisible();
      await expect(entries.getByText('REPORT_RESOLVED', { exact: true })).toBeVisible();
      await expect(entries.getByText('report.assign', { exact: true })).toBeVisible();
      await expect(entries.getByText('report.note', { exact: true })).toBeVisible();
      await expect(entries.getByText(`@${moderator.handle}`).first()).toBeVisible();
      await adminPage.context().close();

      // --- The reporter is told, without specifics -------------------------------------------
      await page.goto('/notifications');
      await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
      await expect(page.getByText('Report reviewed:').first()).toBeVisible({
        timeout: 15_000,
      });
      await page.goto('/settings/reports');
      await expect(
        mine.getByRole('listitem').filter({ hasText: reported.displayName }),
      ).toContainText('Reviewed — the team took action');

      // The reported collector got the moderation warning (SYSTEM notice).
      const warned = await request.get(`${API_URL}/api/v1/notifications`, {
        headers: authHeader(reported.idToken),
        params: { limit: 20 },
      });
      expect(warned.ok()).toBeTruthy();
      const kinds = (
        (await warned.json()) as { items: { data?: Record<string, unknown> }[] }
      ).items.map((item) => item.data?.['kind']);
      expect(kinds).toContain('MODERATION_WARNING');

      await watcher.settle();
      expect(coordinateLeaks(watcher.samples), 'lat/lng in a JSON answer').toEqual([]);
      await page.context().close();
    } finally {
      await moderator.demote();
      await admin.demote();
    }
  });

  test('the conversation menu, community posts and public binders offer Report collector', async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const viewer = await createOnboardedCollector(request, 'viewer', {
      displayName: `Vera Viewer ${suffix()}`,
    });
    const other = await createOnboardedCollector(request, 'other', {
      displayName: `Otto Other ${suffix()}`,
      location: true,
    });
    // A conversation, a community post and a public binder of the other collector.
    const started = await request.post(`${API_URL}/api/v1/conversations`, {
      headers: authHeader(viewer.idToken),
      data: { recipientId: other.id },
    });
    expect(started.ok(), 'POST /conversations').toBeTruthy();
    const conversationId = ((await started.json()) as { id: string }).id;
    const sent = await request.post(`${API_URL}/api/v1/conversations/${conversationId}/messages`, {
      headers: authHeader(other.idToken),
      data: { kind: 'TEXT', body: `Hi, still trading? ${suffix()}` },
    });
    expect(sent.ok(), 'POST message').toBeTruthy();
    const postText = `Trading my spare Azure-Eyes, message me ${suffix()}`;
    const posted = await request.post(
      `${API_URL}/api/v1/community/channels/americas-north-yugioh/posts`,
      {
        headers: authHeader(other.idToken),
        data: { body: postText },
      },
    );
    expect(posted.status(), 'POST community post').toBe(201);
    const postId = ((await posted.json()) as { id: string }).id;
    await apiUpdatePrivacy(request, other.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, other.idToken, {
      name: `E2E report binder ${suffix()}`,
      kind: 'TRADE',
      description: 'Fictional binder for the reporting E2E suite.',
    });
    await apiCreateItem(request, other.idToken, {
      printingId: await printingIdOf(request, other.idToken, 'AZR-EN001'),
      binderId: binder.id,
      availability: 'TRADE',
    });
    await apiPublishBinder(request, other.idToken, binder.id, 'UNTIL_DISABLED');

    try {
      const page = await openSignedIn(browser, viewer);

      // Conversation menu.
      await page.goto(`/messages/${conversationId}`);
      const thread = page.getByRole('region', { name: `Chat with ${other.handle}` });
      await expect(thread).toBeVisible();
      await thread.getByRole('button', { name: `More for ${other.handle}` }).click();
      await page.getByRole('menuitem', { name: /^Report / }).click();
      const dialog = page.getByRole('dialog', { name: /^Report / });
      await expect(dialog).toContainText(other.displayName);
      await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled();
      // Keyboard: Space checks the focused reason, Escape cancels.
      await dialog.getByRole('radio', { name: 'Scam or fraud' }).focus();
      await page.keyboard.press('Space');
      await expect(dialog.getByRole('button', { name: 'Send report' })).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // A community post's "⋯" (web stage WF, board W22): "Report this post" shows the post.
      await page.goto('/messages/community/americas-north-yugioh');
      const post = page.locator(`article[data-post-id="${postId}"]`);
      await expect(post).toContainText(postText);
      await post.hover();
      await post.getByRole('button', { name: `More for the post by ${other.handle}` }).click();
      await page.getByRole('menuitem', { name: 'Report this post' }).click();
      const fromPost = page.getByRole('dialog', { name: 'Report this post' });
      await expect(fromPost).toContainText(postText);
      await fromPost.getByRole('button', { name: 'Cancel' }).click();
      await expect(fromPost).toBeHidden();

      // A public binder's "⋯" menu (web stage WD, board W9): this one is sent (BINDER context).
      await page.goto(`/binders/${binder.id}`);
      await page.getByRole('button', { name: 'More actions' }).click();
      await page.getByRole('menuitem', { name: /^Report / }).click();
      const fromBinder = page.getByRole('dialog', { name: /^Report / });
      await fromBinder.getByRole('radio', { name: 'Misleading listings' }).check();
      await fromBinder.getByRole('button', { name: 'Send report' }).click();
      await expect(page.getByRole('dialog', { name: 'Report sent' })).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();

      const mine = await request.get(`${API_URL}/api/v1/me/reports`, {
        headers: authHeader(viewer.idToken),
      });
      const reports = (await mine.json()) as { reason: string; reportedUser: { id: string } }[];
      expect(reports).toEqual([
        expect.objectContaining({
          reason: 'MISLEADING_LISTINGS',
          reportedUser: expect.objectContaining({ id: other.id }),
        }),
      ]);
      await page.context().close();
    } finally {
      await request.delete(`${API_URL}/api/v1/community/posts/${postId}`, {
        headers: authHeader(other.idToken),
      });
    }
  });
});
