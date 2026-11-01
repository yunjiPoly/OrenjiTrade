import { requireStack } from '../support/stack';
import { dialogReady, expect, signIn, test } from './support/fixtures';

/**
 * Acceptance — usage limits (spec § 50, as changed by stage F1 "free for all" on 2026-10-14): a
 * collector at the `binders.max` limit (5, the same for every collector) tries to create one more
 * binder: the limit-reached dialog says so plainly, with no plan and nothing to buy.
 */
test.describe('acceptance: usage limits', () => {
  requireStack();

  test('limit reached → a plain explanation, nothing to buy', async ({ page, api }) => {
    test.setTimeout(180_000);
    const collector = await api.collector('acc-limits');
    for (let i = 1; i <= 5; i++) {
      await api.binder(collector, { name: `Limit binder ${i}` });
    }
    await signIn(page, collector);

    // --- Limit reached ------------------------------------------------------------------------------
    await page.goto('/inventory');
    const binders = page.getByRole('navigation', { name: 'Binders' });
    await expect(binders.getByRole('link', { name: /Limit binder 5/ })).toBeVisible();
    await binders.getByTestId('pane-new').click();
    const form = await dialogReady(page.getByRole('dialog', { name: 'New binder' }));
    await form.getByTestId('new-binder-name').fill('Binder number six');
    await form.getByTestId('new-binder-create').click();

    // --- A plain explanation ------------------------------------------------------------------------
    const limit = page.getByRole('alertdialog', { name: 'You reached a limit' });
    await expect(limit).toBeVisible();
    await expect(limit.getByTestId('limit-summary')).toContainText('5 of 5');
    await expect(limit.getByTestId('limit-note')).toHaveText(
      'Every collector has the same limits.',
    );
    await expect(limit.getByRole('link')).toHaveCount(0);
    await expect(limit).not.toContainText(/premium|plan/i);
  });
});
