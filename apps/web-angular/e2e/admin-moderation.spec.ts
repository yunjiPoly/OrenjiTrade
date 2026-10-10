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
  OnboardedCollector,
  createOnboardedCollector,
  createStaffMember,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Admin console sections of Phase 7 against the real local stack: the dashboard counts, listing
 * review and search (hide a listing with a reason), pausing and resuming a collector's listings
 * (the collector sees the paused banner on /inventory), moderation rules and the auto-delist
 * editor with inline validation (nothing saved), notification statistics, analytics, system
 * health, and the audit log recording every write. Accounts and listings are fictional and fresh.
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

test.describe('admin console moderation sections', () => {
  requireStack();

  test('dashboard, listings, pause and resume, rules, delisting, notifications, analytics, health, audit', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const seller = await createOnboardedCollector(request, 'paused', {
      displayName: `Pia Paused ${suffix()}`,
      location: true,
    });
    await apiUpdatePrivacy(request, seller.idToken, { discoverable: true });
    const binder = await apiCreateBinder(request, seller.idToken, {
      name: `E2E admin binder ${suffix()}`,
      kind: 'SALE',
      description: 'Fictional binder for the admin E2E suite.',
    });
    await apiCreateItem(request, seller.idToken, {
      printingId: await printingIdOf(request, seller.idToken, 'AZR-EN001'),
      binderId: binder.id,
      availability: 'SALE',
      askingPrice: 25,
    });
    await apiCreateItem(request, seller.idToken, {
      printingId: await printingIdOf(request, seller.idToken, 'SVX-001'),
      binderId: binder.id,
      availability: 'TRADE',
    });
    await apiPublishBinder(request, seller.idToken, binder.id, 'UNTIL_DISABLED');
    const admin = await createStaffMember(request, 'consoleadm', ['ADMIN']);
    try {
      const page = await openSignedIn(browser, admin);
      const watcher = watchCoordinates(page);

      // --- Dashboard ---------------------------------------------------------------------------
      await page.goto('/admin');
      await expect(page.getByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeVisible();
      const tiles = page.getByTestId('dashboard-tiles');
      for (const id of ['reports', 'flags', 'accounts', 'listings', 'stale', 'notifications']) {
        await expect(tiles.locator(`[data-tile="${id}"]`).getByTestId('tile-value')).toHaveText(
          /^\d+$/,
        );
      }
      await expect(page.getByRole('list', { name: 'Admin sections' })).toContainText(
        'Auto-delist rules',
      );

      // --- Listings: review queue, then hide one of the seller's listings ----------------------
      const nav = page.getByRole('navigation', { name: 'Admin sections' });
      await nav.getByRole('link', { name: 'Listings' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Listings' })).toBeVisible();
      await expect(
        page
          .getByRole('list', { name: 'Listings to review' })
          .or(page.getByRole('heading', { name: 'Nothing to review' })),
      ).toBeVisible();

      // The seller's account page leads to their listings.
      await page.goto(`/admin/users/${seller.id}`);
      await expect(page.getByRole('heading', { level: 1, name: seller.displayName })).toBeVisible();
      await expect(page.getByTestId('listing-status')).toContainText('Live');
      await page.getByRole('link', { name: 'Their listings' }).click();
      await expect(page).toHaveURL(/\/admin\/listings\?.*ownerId=/);
      const listings = page.getByRole('list', { name: 'Listings', exact: true });
      await expect(listings.locator('[data-listing]')).toHaveCount(2);
      await page
        .getByRole('button', { name: `Hide Azure-Eyes Sky Dragon of @${seller.handle}` })
        .click();
      const hide = page.getByRole('dialog', { name: 'Hide Azure-Eyes Sky Dragon?' });
      await hide.getByRole('button', { name: 'Hide listing' }).click();
      await expect(hide.getByText('Give a short reason for the audit log.')).toBeVisible();
      await hide.getByRole('textbox', { name: 'Reason' }).fill('Price looks like bait (E2E).');
      await hide.getByRole('button', { name: 'Hide listing' }).click();
      await expect(
        page.getByText('Azure-Eyes Sky Dragon is hidden. The action is in the audit log.'),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: `Hide Azure-Eyes Sky Dragon of @${seller.handle}` }),
      ).toHaveCount(0);

      // --- Pause and resume the seller's listings ---------------------------------------------
      await page.goto(`/admin/users/${seller.id}`);
      await page.getByRole('button', { name: 'Pause listings' }).click();
      const pause = page.getByRole('dialog', { name: `Pause the listings of @${seller.handle}?` });
      await pause.getByRole('textbox', { name: 'Reason' }).fill('Checking reported prices (E2E).');
      await pause.getByRole('button', { name: 'Pause listings' }).click();
      await expect(page.getByText(`The listings of @${seller.handle} are paused.`)).toBeVisible();
      await expect(page.getByTestId('listing-status')).toContainText('Paused — Administrator');

      const sellerPage = await openSignedIn(browser, seller);
      await sellerPage.goto('/inventory');
      const banner = sellerPage
        .getByRole('status')
        .filter({ hasText: 'Your public listings are paused' });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('The moderation team is reviewing your account');
      await expect(banner.getByRole('button', { name: 'Resume listings' })).toHaveCount(0);
      await expect(banner).not.toContainText('Checking reported prices');

      await page.getByRole('button', { name: 'Resume listings' }).click();
      const resume = page.getByRole('dialog', {
        name: `Resume the listings of @${seller.handle}?`,
      });
      await resume.getByRole('button', { name: 'Resume listings' }).click();
      await expect(
        page.getByText(`The listings of @${seller.handle} are live again.`),
      ).toBeVisible();
      await expect(page.getByTestId('listing-status')).toContainText('Live');
      await sellerPage.reload();
      await expect(sellerPage.getByRole('heading', { level: 1, name: 'Inventory' })).toBeVisible();
      await expect(sellerPage.getByText('Your public listings are paused')).toHaveCount(0);
      await sellerPage.context().close();

      // --- Moderation rules (read, validate a draft, save nothing) ----------------------------
      await nav.getByRole('link', { name: 'Moderation' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Moderation' })).toBeVisible();
      const reportRules = page.getByRole('list', { name: 'Collector reports rules' });
      await expect(reportRules).toContainText('5 per day');
      await expect(reportRules).toContainText('Report threshold');
      await page.getByRole('button', { name: 'New rule' }).click();
      const rule = page.getByRole('dialog', { name: 'New moderation rule' });
      await rule.getByRole('combobox', { name: 'Kind' }).click();
      await page.getByRole('option', { name: 'Rate limit' }).click();
      await rule.getByRole('textbox', { name: 'Pattern' }).fill('five a day');
      await rule.getByRole('button', { name: 'Create rule' }).click();
      await expect(rule.getByText('Use <count>/<seconds>, for example 5/86400.')).toBeVisible();
      await rule.getByRole('textbox', { name: 'Pattern' }).fill('5/86400');
      await expect(rule.getByText('5 per day')).toBeVisible();
      await rule.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('tab', { name: 'Flags queue' }).click();
      await expect(page).toHaveURL(/\/admin\/moderation\?tab=flags$/);

      // --- Auto-delist rules: inline validation, nothing saved --------------------------------
      await nav.getByRole('link', { name: 'Auto-delist rules' }).click();
      await expect(page.getByTestId('delist-timeline')).toContainText('Fresh');
      const stale = page.getByRole('spinbutton', { name: 'Stale after' });
      const staleBefore = await stale.inputValue();
      await stale.fill('1');
      await expect(page.getByText('Must come after “aging”.')).toBeVisible();
      await expect(page.getByTestId('delist-timeline')).toContainText(
        'Fix the thresholds to preview the timeline.',
      );
      await page.getByRole('button', { name: 'Save rules' }).click();
      await expect(page.getByText('Fix the highlighted values before saving.')).toBeVisible();
      await page.getByRole('button', { name: 'Reset' }).click();
      await expect(stale).toHaveValue(staleBefore);

      // --- Notifications, analytics, system health --------------------------------------------
      await nav.getByRole('link', { name: 'Notifications' }).click();
      await expect(page.getByRole('list', { name: 'Notification totals' })).toContainText('Sent');
      await expect(
        page.getByText('Only a super admin can broadcast to every collector.'),
      ).toBeVisible();
      await nav.getByRole('link', { name: 'Analytics' }).click();
      await expect(page.getByTestId('analytics-total')).toHaveText(/^\d+$/);
      await nav.getByRole('link', { name: 'System health' }).click();
      await expect(page.getByTestId('health-status')).toHaveText('All systems operational');
      await expect(page.getByRole('table', { name: 'Scheduled jobs' })).toContainText(
        'Listing freshness',
      );

      // --- Every write is in the audit log ----------------------------------------------------
      await page.goto(`/admin/audit-logs?targetId=${seller.id}`);
      const entries = page.getByRole('table', { name: 'Audit entries' });
      await expect(entries.getByText('listings.pause', { exact: true })).toBeVisible();
      await expect(entries.getByText('listings.resume', { exact: true })).toBeVisible();
      await page.goto('/admin/audit-logs?action=listing.hide');
      await expect(entries.getByText('Hid a listing').first()).toBeVisible();
      await expect(entries.getByText(`@${admin.handle}`).first()).toBeVisible();

      await watcher.settle();
      expect(coordinateLeaks(watcher.samples), 'lat/lng in a JSON answer').toEqual([]);
      await page.context().close();
    } finally {
      await admin.demote();
    }
  });
});
