import { requireStack } from '../support/stack';
import { dialogReady, expect, signIn, test } from './support/fixtures';

/**
 * Acceptance — freemium (spec § 50): a FREE collector at the `binders.max` limit (5) tries to
 * create one more binder: the limit-reached dialog is the upgrade prompt ("See Premium"); the
 * collector upgrades through the local fake billing checkout (no card, no money) and the Premium
 * entitlement lifts the limit: the sixth binder is created.
 */
test.describe('acceptance: freemium', () => {
  requireStack();

  test('limit reached → upgrade prompt → Premium entitlement lifts the limit', async ({
    page,
    api,
  }) => {
    test.setTimeout(180_000);
    const collector = await api.collector('acc-freemium');
    for (let i = 1; i <= 5; i++) {
      await api.binder(collector, { name: `Free binder ${i}` });
    }
    await signIn(page, collector);

    // --- Limit reached ------------------------------------------------------------------------------
    await page.goto('/inventory');
    const binders = page.getByRole('navigation', { name: 'Binders' });
    await expect(binders.getByRole('link', { name: /Free binder 5/ })).toBeVisible();
    await binders.getByRole('button', { name: 'New binder' }).click();
    let form = await dialogReady(page.getByRole('dialog', { name: 'New binder' }));
    await form.getByLabel('Binder name').fill('Binder number six');
    await form.getByRole('button', { name: 'Create binder' }).click();

    // --- Upgrade prompt -----------------------------------------------------------------------------
    const limit = page.getByRole('alertdialog', { name: 'You reached a plan limit' });
    await expect(limit).toBeVisible();
    await expect(limit.getByTestId('limit-summary')).toContainText('5 of 5');
    await limit.getByRole('link', { name: 'See Premium' }).click();
    await expect(page).toHaveURL(/\/premium$/);
    const usage = page.getByRole('list', { name: 'Your plan usage' });
    await expect(usage.locator('[data-limit="binders.max"]')).toContainText('5 / 5');
    await page
      .getByRole('article', { name: 'Premium' })
      .getByRole('button', { name: 'Upgrade to Premium' })
      .click();

    // --- Fake billing checkout → Premium ------------------------------------------------------------
    await expect(page).toHaveURL(/\/checkout\/fake-billing\/fake_cs_[\w-]+$/);
    await expect(page.getByTestId('local-payment-banner')).toContainText('Local test payment');
    await page.getByRole('button', { name: /^Pay \$4\.99/ }).click();
    await expect(page).toHaveURL(/\/premium\?checkout=success$/, { timeout: 60_000 });
    await expect(page.getByTestId('premium-welcome')).toContainText('Welcome to Premium!');
    await expect(page.getByTestId('subscription-card')).toContainText('Active');
    await expect(usage.locator('[data-limit="binders.max"]')).toContainText('5 / 50');

    // --- The entitlement lifts the limit ------------------------------------------------------------
    await page.goto('/inventory');
    await binders.getByRole('button', { name: 'New binder' }).click();
    form = await dialogReady(page.getByRole('dialog', { name: 'New binder' }));
    await form.getByLabel('Binder name').fill('Premium binder six');
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form).toBeHidden();
    await expect(binders.getByRole('link', { name: /Premium binder six/ })).toBeVisible();
    await expect(page.getByRole('alertdialog', { name: 'You reached a plan limit' })).toHaveCount(
      0,
    );

    const plan = await api.ok<{ plan: { code: string } }>('GET', '/api/v1/me/plan', {
      token: collector.idToken,
    });
    expect(plan.plan.code).toBe('PREMIUM');
  });
});
