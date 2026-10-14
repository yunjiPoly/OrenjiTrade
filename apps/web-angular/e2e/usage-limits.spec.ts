import { expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiUpdatePrivacy,
  coordinateLeaks,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Usage limits since stage F1 ("free for all", 2026-10-14) against the real local stack: a fresh
 * collector, discoverable in Quebec, fills the `binders.max` limit (5, the same for every
 * collector), and the sixth binder is refused with a plain limit-reached dialog: which limit, how
 * much was used, that it does not reset on its own, and nothing to buy. No sponsored placement
 * anywhere, no Premium, credits or "Support OrenjiTrade" page or entry. No JSON response carries a
 * coordinate (ADR 0017).
 */

test.describe('usage limits', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('a collector reaches the binders limit and is told plainly, with nothing to buy', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'limits', { location: true });
    await apiUpdatePrivacy(request, collector.idToken, { discoverable: true });
    for (let i = 1; i <= 5; i++) {
      await apiCreateBinder(request, collector.idToken, { name: `Limit binder ${i}` });
    }
    const adRequests: string[] = [];
    page.on('request', (candidate) => {
      if (/\/api\/v1\/(ads|plans|me\/plan)\b/.test(new URL(candidate.url()).pathname)) {
        adRequests.push(candidate.url());
      }
    });
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, collector.email, collector.password);

    // The inventory: no sponsored placement.
    await page.goto('/inventory');
    const binders = page.getByRole('navigation', { name: 'Binders' });
    await expect(binders.getByRole('link', { name: /Limit binder 5/ })).toBeVisible();
    await expect(page.getByText('Sponsored', { exact: true })).toHaveCount(0);

    // The sixth binder is refused: the dialog explains it, with no plan and no link.
    await binders.getByRole('button', { name: 'New binder' }).click();
    const form = page.getByRole('dialog', { name: 'New binder' });
    await form.getByLabel('Binder name').fill('Binder number six');
    await form.getByRole('button', { name: 'Create binder' }).click();
    const limit = page.getByRole('alertdialog', { name: 'You reached a limit' });
    await expect(limit).toBeVisible();
    await expect(limit.getByTestId('limit-summary')).toContainText('Binders');
    await expect(limit.getByTestId('limit-summary')).toContainText(
      'you used 5 of 5 on your account',
    );
    await expect(limit.getByTestId('limit-reset')).toContainText('Does not reset on its own');
    await expect(limit.getByTestId('limit-note')).toHaveText(
      'Every collector has the same limits.',
    );
    await expect(limit.getByRole('link')).toHaveCount(0);
    await expect(limit).not.toContainText(/premium|plan/i);
    await limit.getByRole('button', { name: 'OK' }).click();
    await expect(limit).toHaveCount(0);

    // The limits read back from the API: the same numbers for everyone, no plan.
    const limits = await request.get(`${API_URL}/api/v1/me/limits`, {
      headers: authHeader(collector.idToken),
    });
    expect(limits.ok()).toBeTruthy();
    const body = (await limits.json()) as {
      limits: { key: string; limit?: number; used?: number }[];
    };
    expect(body.limits.find((entry) => entry.key === 'binders.max')).toMatchObject({
      limit: 5,
      used: 5,
    });
    expect(JSON.stringify(body)).not.toMatch(/planCode|upgradeUrl/);

    // The account menu offers no Premium, credits or support; their pages do not exist.
    await page.getByRole('button', { name: /Account menu/ }).click();
    for (const name of ['Premium', 'Credits', 'Support OrenjiTrade']) {
      await expect(page.getByRole('menuitem', { name })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    for (const path of ['/premium', '/credits', '/support']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    }
    expect(adRequests).toEqual([]);

    // ADR 0017: no JSON response carried a coordinate.
    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });
});
