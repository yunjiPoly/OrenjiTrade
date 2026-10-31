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
 * Web stage WH2 (spec 15.5 to 15.9, boards A7 to A23) against the real local stack: a super
 * admin's nav and every WH2 page without a raw id or a region code on screen, the staff search's
 * one endpoint (a collector, a card by its printing code), an import limit edited in the console
 * and read by the phone's import (`GET /inventory/imports/limits`), and one game's card images
 * cleared on the E2E database with the cache checked: no provider is ever called (the stack's
 * provider addresses point nowhere and no request leaves for a provider host).
 */

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const REGION_CODE = /\b(americas-north|americas-south|europe)\b/;
const PROVIDER_HOST = /ygoprodeck\.com|scryfall\.(com|io)|tcgdex\.(net|dev)/i;

async function openSignedIn(browser: Browser, member: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, member.email, member.password);
  return page;
}

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() =>
    [
      document.querySelector('nav[aria-label="Admin sections"]'),
      document.querySelector('main'),
      document.querySelector('[data-testid="card-drawer"]'),
    ]
      .map((part) => (part as HTMLElement | null)?.innerText ?? '')
      .join('\n'),
  );
}

test.describe('admin console (WH2)', () => {
  requireStack();

  test("a super admin's nav and pages: no raw id or region code; the staff search", async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const superAdmin = await createStaffMember(request, 'wh2sup', ['SUPER_ADMIN']);
    const collector = await createOnboardedCollector(request, 'wh2found');
    try {
      const page = await openSignedIn(browser, superAdmin);
      await page.goto('/admin');
      await expect(page.getByTestId('admin-role')).toHaveText('Role: Super admin');
      const nav = page.getByRole('navigation', { name: 'Admin sections' });
      for (const item of [
        'Users',
        'Listings',
        'Binders',
        'Cards',
        'Card data and images',
        'Games',
        'Usage limits',
        'Import limits',
        'Wishlist terms',
        'Auto-delist',
        'Feature flags',
        'Regions',
        'Notifications',
        'System health',
        'Analytics',
        'Audit log',
      ]) {
        await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible();
      }

      // The staff search's one endpoint: a collector by handle, a card by its printing code.
      const search = page.getByRole('combobox', { name: 'Find a collector, card or report' });
      await page.locator('body').press('/');
      await expect(search).toBeFocused();
      await expect(search).toHaveAttribute('aria-keyshortcuts', '/');
      await search.fill(`@${collector.handle}`);
      await expect(
        page.getByRole('option', { name: new RegExp(`@${collector.handle}`) }),
      ).toBeVisible();
      await search.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/admin/users/${collector.id}$`));
      await expect(
        page.getByRole('heading', { level: 1, name: collector.displayName }),
      ).toBeVisible();
      await search.fill('AZR-EN011');
      await expect(page.getByRole('option', { name: /Lantern Fox Spirit/ }).first()).toBeVisible();
      await search.press('Enter');
      await expect(page).toHaveURL(/\/admin\/cards\?open=/);
      await expect(
        page.getByTestId('card-drawer').getByRole('heading', { name: 'Lantern Fox Spirit' }),
      ).toBeVisible();

      for (const path of [
        '/admin/users',
        `/admin/users/${collector.id}`,
        '/admin/listings',
        '/admin/listings?tab=all',
        '/admin/binders',
        '/admin/cards',
        '/admin/card-data',
        '/admin/games',
        '/admin/usage-limits',
        '/admin/import-limits',
        '/admin/wishlist',
        '/admin/auto-delist-rules',
        '/admin/feature-flags',
        '/admin/regions',
        '/admin/notifications',
        '/admin/system-health',
        '/admin/analytics',
        '/admin/audit-logs',
      ]) {
        await page.goto(path);
        await expect(page.locator('main h1')).toBeVisible();
        await page.waitForLoadState('networkidle');
        const text = await visibleText(page);
        expect(text, `${path}: a UUID on screen`).not.toMatch(UUID);
        expect(text, `${path}: a region code on screen`).not.toMatch(REGION_CODE);
      }
      // mlScanning stays off and locked (the owner's hold).
      await page.goto('/admin/feature-flags');
      await expect(page.locator('[data-flag="mlScanning"]')).toContainText('On hold by the owner.');
      await expect(page.getByRole('switch', { name: /mlScanning/ })).toBeDisabled();
      await page.context().close();
    } finally {
      await superAdmin.demote();
    }
  });

  test("an admin edits an import limit and the phone's import reads it", async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const admin = await createStaffMember(request, 'wh2imp', ['ADMIN']);
    const collector = await createOnboardedCollector(request, 'wh2impc');
    const settingsUrl = `${API_URL}/api/v1/admin/inventory/import-settings`;
    const before = (await (
      await request.get(settingsUrl, { headers: authHeader(admin.idToken) })
    ).json()) as { ydkMaxLines: number };
    const next = before.ydkMaxLines >= 5000 ? 4999 : before.ydkMaxLines + 1;
    try {
      const page = await openSignedIn(browser, admin);
      await page.goto('/admin/import-limits');
      await expect(page.getByRole('heading', { level: 1, name: 'Import limits' })).toBeVisible();
      const lines = page.locator('#il-ydkMaxLines');
      await expect(lines).toHaveValue(String(before.ydkMaxLines));

      // Validation: nothing is sent for a value out of range.
      await lines.fill('5');
      await page.getByRole('button', { name: 'Save limits' }).click();
      await expect(page.getByText('Use 10 to 5,000 lines.')).toBeVisible();
      await expect(lines).toHaveAttribute('aria-invalid', 'true');
      await expect(lines).toBeFocused();

      await lines.fill(String(next));
      await expect(page.getByText(`and ${next.toLocaleString('en-US')} lines`)).toBeVisible();
      await page.getByRole('button', { name: 'Save limits' }).click();
      await expect(page.getByText('Import limits saved.')).toBeVisible();
      await expect(page.getByText('Recorded in the audit log.').first()).toBeVisible();
      await expect(page.getByText(`by ${admin.displayName}`)).toBeVisible();

      // The phone's import reads the limits from the API: the new value at once.
      const limits = await request.get(`${API_URL}/api/v1/inventory/imports/limits`, {
        headers: authHeader(collector.idToken),
      });
      expect(limits.ok()).toBeTruthy();
      expect(((await limits.json()) as { ydkMaxLines: number }).ydkMaxLines).toBe(next);

      // The audit log names it, with the code under the label.
      await page.goto('/admin/audit-logs?action=inventory.import.settings.update');
      const entries = page.getByRole('table', { name: 'Audit entries' });
      await expect(entries.getByText('Changed import limits').first()).toBeVisible();
      await expect(entries.getByText('inventory.import.settings.update').first()).toBeVisible();
      await expect(entries.getByText('Import limits').first()).toBeVisible();
      await page.context().close();
    } finally {
      const restored = await request.put(settingsUrl, {
        headers: authHeader(admin.idToken),
        data: { ydkMaxLines: before.ydkMaxLines },
      });
      expect(restored.ok(), 'restore the import limit').toBeTruthy();
      await admin.demote();
    }
  });

  test("an admin checks the card image cache and clears one game's images, no provider call", async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const admin = await createStaffMember(request, 'wh2img', ['ADMIN']);
    try {
      const page = await openSignedIn(browser, admin);
      const providerRequests: string[] = [];
      page.on('request', (r) => {
        if (PROVIDER_HOST.test(r.url())) {
          providerRequests.push(r.url());
        }
      });
      await page.goto('/admin/card-data');
      await expect(page.getByRole('heading', { name: 'Card image cache' })).toBeVisible();
      await expect(page.getByText('CARD_IMAGE_LOCAL_CACHE_MAX_MB')).toBeVisible();

      await page.getByRole('button', { name: 'Check the cache' }).click();
      await expect(page.getByText('The card image cache was checked.')).toBeVisible();

      const opener = page.getByRole('button', { name: 'Clear a game’s images…' });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Clear a game’s card images?' });
      await dialog.getByRole('button', { name: 'Clear images' }).click();
      await expect(dialog.getByText('Choose the game whose images to clear.')).toBeVisible();
      await dialog.getByLabel('Images to clear').selectOption({ value: 'yugioh' });
      await dialog.getByRole('button', { name: 'Clear images' }).click();
      await expect(page.getByText('Yu-Gi-Oh! card images cleared.')).toBeVisible();
      await expect(opener).toBeFocused();

      await page.goto('/admin/audit-logs?action=card_images.cache.clear');
      const entries = page.getByRole('table', { name: 'Audit entries' });
      await expect(entries.getByText('Cleared card images').first()).toBeVisible();
      await expect(entries.getByText('card_images.cache.clear').first()).toBeVisible();
      await expect(entries.getByRole('link', { name: 'Yu-Gi-Oh!' }).first()).toBeVisible();
      await expect(entries.getByText(admin.displayName).first()).toBeVisible();
      expect(providerRequests, 'no request to a card provider').toEqual([]);
      await page.context().close();
    } finally {
      await admin.demote();
    }
  });
});
