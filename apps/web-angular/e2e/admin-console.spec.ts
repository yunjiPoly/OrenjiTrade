import { Browser, Page, expect, test } from '@playwright/test';
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
 * The admin console's shell, overview and moderation (web stage WH1, spec 15.1 to 15.4 and 15.9,
 * boards A1 to A6 and A24) against the real local stack: each role's nav (moderators get the 5
 * moderation items), the PAYMENTS group following `protectedPayments`, the staff search opening a
 * report by its number, archiving and restoring a room, and no raw id or region code in the
 * visible text of the console's moderation pages. Resolving a report with a warning is
 * `reporting.spec.ts`. Every account is a fresh one of this run (promoted, then demoted).
 */

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const REGION_CODE = /\b(americas-north|americas-south|europe)\b/;
/** A room far from the other specs' rooms (archived, then restored at once). */
const ROOM = 'europe-riftbound';

async function openSignedIn(browser: Browser, member: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, member.email, member.password);
  return page;
}

/** The visible text of the page's main area and nav (never the room drawer's read-only slug). */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts = [
      document.querySelector('nav[aria-label="Admin sections"]'),
      document.querySelector('main'),
    ];
    return parts.map((part) => (part as HTMLElement | null)?.innerText ?? '').join('\n');
  });
}

test.describe('admin console (WH1)', () => {
  requireStack();

  test("each role's nav, the payments group and the staff search", async ({ browser, request }) => {
    test.setTimeout(150_000);
    const moderator = await createStaffMember(request, 'wh1mod', ['MODERATOR']);
    const admin = await createStaffMember(request, 'wh1adm', ['ADMIN']);
    const reporter = await createOnboardedCollector(request, 'wh1rep');
    const reported = await createOnboardedCollector(request, 'wh1bad');
    try {
      const filed = await request.post(`${API_URL}/api/v1/reports/collectors`, {
        headers: authHeader(reporter.idToken),
        data: { reportedUserId: reported.id, reason: 'SPAM', details: 'E2E: spam (WH1).' },
      });
      expect(filed.ok()).toBeTruthy();
      const reportId = ((await filed.json()) as { id: string }).id;
      const other = await request.post(`${API_URL}/api/v1/reports/collectors`, {
        headers: authHeader(reported.idToken),
        data: { reportedUserId: reporter.id, reason: 'OTHER', details: 'E2E: the other (WH1).' },
      });
      expect(other.ok()).toBeTruthy();
      const otherId = ((await other.json()) as { id: string }).id;

      // --- A moderator: the Overview (A24), 5 nav items, reports found by number ----------------
      const page = await openSignedIn(browser, moderator);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      await expect(page.getByTestId('admin-role')).toHaveText('Role: Moderator');
      const nav = page.getByRole('navigation', { name: 'Admin sections' });
      await expect(nav.getByRole('link')).toHaveText([
        'Overview',
        /^Reports/,
        /^Flags and rules/,
        'Community',
        'Ratings',
      ]);
      // The Overview is the current page on /admin (review fix 1).
      await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByRole('heading', { name: 'What moderators decide' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Unassigned' })).toBeVisible();
      await expect(nav.getByText('Every staff action is recorded in the audit log.')).toBeVisible();

      const detail = await request.get(`${API_URL}/api/v1/admin/reports/${reportId}`, {
        headers: authHeader(moderator.idToken),
      });
      const number = ((await detail.json()) as { number: number }).number;
      expect(number).toBeGreaterThan(1000);
      const search = page.getByRole('combobox', { name: 'Find a report by its number' });
      // "/" focuses the staff search.
      await page.locator('body').press('/');
      await expect(search).toBeFocused();
      await search.fill(`#${number}`);
      await expect(page.getByRole('option', { name: new RegExp(`#${number}`) })).toBeVisible();
      await search.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/admin/reports/${reportId}$`));
      await expect(
        page.getByRole('heading', { level: 2, name: new RegExp(`^Report #${number} about`) }),
      ).toBeVisible();
      // The list marks the open report, and follows another row's click (same panel, new id).
      await expect(page.locator(`[data-report="${reportId}"]`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      await page.locator(`[data-report="${otherId}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/admin/reports/${otherId}$`));
      await expect(page.locator(`[data-report="${otherId}"]`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(page.locator(`[data-report="${reportId}"]`)).not.toHaveAttribute(
        'aria-current',
        'true',
      );
      // An administrator's page stays closed to a moderator.
      await page.goto('/admin/usage-limits', { waitUntil: 'commit' });
      await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
      await page.context().close();

      // --- An administrator: every group, PAYMENTS as the flag says -----------------------------
      const flags = await request.get(`${API_URL}/api/v1/public/feature-flags`);
      const paymentsOn = ((await flags.json()) as Record<string, boolean>)['protectedPayments'];
      const adminPage = await openSignedIn(browser, admin);
      await adminPage.goto('/admin');
      await expect(adminPage.getByTestId('admin-role')).toHaveText('Role: Admin');
      const adminNav = adminPage.getByRole('navigation', { name: 'Admin sections' });
      for (const group of ['Moderation', 'Collectors', 'Catalog', 'Rules', 'System']) {
        await expect(adminNav.getByText(group, { exact: true })).toBeVisible();
      }
      await expect(adminNav.getByRole('link', { name: 'Audit log' })).toBeVisible();
      await expect(adminNav.getByRole('link', { name: 'Transactions' })).toHaveCount(
        paymentsOn ? 1 : 0,
      );
      await expect(adminPage.locator('[data-tile="disputes"]')).toHaveCount(paymentsOn ? 1 : 0);
      await expect(adminNav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      // Typed into the address bar, a payments page opens only while the flag is on (review
      // fix 1): off, it says so and the Overview opens.
      await adminPage.goto('/admin/disputes');
      if (paymentsOn) {
        await expect(adminPage.getByRole('heading', { level: 1, name: 'Disputes' })).toBeVisible();
      } else {
        await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 20_000 });
        await expect(
          adminPage.getByText('Protected payments is not available right now.'),
        ).toBeVisible();
      }
      await adminPage.goto('/admin');
      await expect(adminPage.getByRole('heading', { name: 'Report queue' })).toBeVisible();
      await expect(adminPage.getByRole('heading', { name: 'Recent staff actions' })).toBeVisible();
      // Back to OrenjiTrade leaves the console.
      await adminPage.getByTestId('admin-back').click();
      await expect(adminPage).toHaveURL(/:\d+\/(\?.*)?$/);
      await adminPage.context().close();
    } finally {
      await moderator.demote();
      await admin.demote();
    }
  });

  test('a moderator archives a room and restores it', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const moderator = await createStaffMember(request, 'wh1room', ['MODERATOR']);
    const roomState = async (): Promise<string> => {
      const response = await request.get(`${API_URL}/api/v1/admin/community/channels`, {
        headers: authHeader(moderator.idToken),
      });
      const channels = (await response.json()) as { slug: string; status: string }[];
      return channels.find((channel) => channel.slug === ROOM)?.status ?? 'MISSING';
    };
    try {
      expect(await roomState()).toBe('ACTIVE');
      const page = await openSignedIn(browser, moderator);
      await page.goto('/admin/community');
      await expect(page.getByRole('heading', { level: 1, name: 'Community' })).toBeVisible();
      // No "New channel": the apps only list the rooms.
      await expect(page.getByRole('button', { name: /New channel/ })).toHaveCount(0);
      const cell = page.locator(`[data-room="${ROOM}"]`);
      await expect(cell).toHaveAccessibleName(/^Europe · Riftbound, .* Open$/);
      await cell.click();
      const drawer = page.getByRole('dialog', { name: 'Europe · Riftbound' });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByTestId('room-state')).toHaveText('Open');
      // Validation stays today's: a posting limit out of range is refused before saving.
      await drawer.getByLabel('Posts per member per hour').fill('0');
      await drawer.getByRole('button', { name: 'Save room' }).click();
      await expect(drawer.getByText('Between 1 and 1,000.')).toBeVisible();
      await drawer.getByLabel('Posts per member per hour').fill('10');

      await drawer.getByRole('button', { name: 'Archive room' }).click();
      const confirm = page.getByRole('dialog', { name: 'Archive Europe · Riftbound?' });
      await confirm.getByRole('button', { name: 'Archive room' }).click();
      await expect(page.getByText('Europe · Riftbound archived.')).toBeVisible();
      await expect(drawer.getByTestId('room-state')).toHaveText('Archived');
      expect(await roomState()).toBe('ARCHIVED');

      await drawer.getByRole('button', { name: 'Restore room' }).click();
      await expect(page.getByText('Europe · Riftbound restored.')).toBeVisible();
      await expect(drawer.getByTestId('room-state')).toHaveText('Open');
      expect(await roomState()).toBe('ACTIVE');
      // Esc closes the drawer and the focus goes back to its cell.
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(cell).toBeFocused();
      await page.context().close();
    } finally {
      if ((await roomState()) !== 'ACTIVE') {
        const response = await request.get(`${API_URL}/api/v1/admin/community/channels`, {
          headers: authHeader(moderator.idToken),
        });
        const channels = (await response.json()) as { id: string; slug: string }[];
        const id = channels.find((channel) => channel.slug === ROOM)?.id;
        await request.patch(`${API_URL}/api/v1/admin/community/channels/${id}`, {
          headers: authHeader(moderator.idToken),
          data: { status: 'ACTIVE' },
        });
      }
      await moderator.demote();
    }
  });

  test('no raw id or region code in the visible text of the moderation pages', async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const admin = await createStaffMember(request, 'wh1raw', ['ADMIN']);
    const reporter = await createOnboardedCollector(request, 'wh1rawr');
    const reported = await createOnboardedCollector(request, 'wh1rawd');
    try {
      const filed = await request.post(`${API_URL}/api/v1/reports/collectors`, {
        headers: authHeader(reporter.idToken),
        data: { reportedUserId: reported.id, reason: 'OTHER', details: 'E2E: raw values (WH1).' },
      });
      const reportId = ((await filed.json()) as { id: string }).id;
      // A flagged community post (the banned-term FLAG rule): its room line must read as words.
      const posted = await request.post(
        `${API_URL}/api/v1/community/channels/europe-pokemon/posts`,
        {
          headers: authHeader(reporter.idToken),
          data: { body: `Great fnordpromo bundle here (WH1 raw values)` },
        },
      );
      expect(posted.status(), 'POST community post').toBe(201);
      const postId = ((await posted.json()) as { id: string }).id;
      const page = await openSignedIn(browser, admin);
      for (const path of [
        '/admin',
        '/admin/reports?status=ALL',
        `/admin/reports/${reportId}`,
        '/admin/moderation?state=ALL',
        '/admin/moderation?tab=rules',
        '/admin/community',
        '/admin/ratings',
        '/admin/ratings?tab=references',
      ]) {
        await page.goto(path);
        await expect(page.locator('main h1')).toBeVisible();
        await page.waitForLoadState('networkidle');
        const text = await visibleText(page);
        expect(text, `${path}: a UUID on screen`).not.toMatch(UUID);
        expect(text, `${path}: a region code on screen`).not.toMatch(REGION_CODE);
        if (path === '/admin/moderation?state=ALL') {
          await expect(
            page.locator('li[data-flag]').filter({ hasText: 'WH1 raw values' }),
          ).toContainText('Europe · Pokémon');
        }
      }
      await page.context().close();
      await request.delete(`${API_URL}/api/v1/community/posts/${postId}`, {
        headers: authHeader(reporter.idToken),
      });
    } finally {
      await admin.demote();
    }
  });
});
