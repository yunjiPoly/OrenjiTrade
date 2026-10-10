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
 * Freemium (Phase 10) against the real local stack with the fake billing provider (no card, no
 * money): a fresh FREE collector, discoverable in Quebec, fills the `binders.max` limit (5),
 * sees the limit-reached dialog and follows "See Premium" to `/premium`; "Upgrade to Premium"
 * opens the local fake billing checkout, a simulated decline keeps it open, "Pay" activates the
 * subscription (webhook) and lands on `/premium?checkout=success` with the Premium limits
 * (binders 5 / 50); the sixth binder is created and the inventory's sponsored placement is gone
 * (Premium has no ads). "Cancel now" returns the collector to the FREE plan at once.
 * No JSON response carries a coordinate (ADR 0017).
 */

test.describe('freemium', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('a FREE collector hits a limit, upgrades through the fake checkout and cancels', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'freemium', { location: true });
    // Located in Quebec: the fictional "Harbour deck boxes" ad targets that province (CA-QC).
    await apiUpdatePrivacy(request, collector.idToken, { discoverable: true });
    for (let i = 1; i <= 5; i++) {
      await apiCreateBinder(request, collector.idToken, { name: `Free binder ${i}` });
    }
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, collector.email, collector.password);

    // FREE: the inventory sidebar carries a sponsored placement (always labelled "Sponsored").
    await page.goto('/inventory');
    const binders = page.getByRole('navigation', { name: 'Binders' });
    await expect(binders.getByRole('link', { name: /Free binder 5/ })).toBeVisible();
    const sidebarAd = page.locator('[data-slot="INVENTORY_SIDEBAR"] [data-testid="sponsored-ad"]');
    await expect(sidebarAd.first()).toBeVisible();
    await expect(sidebarAd.first().getByTestId('sponsored-label')).toHaveText('Sponsored');

    // The sixth binder is refused: the limit-reached dialog explains it and leads to Premium.
    await binders.getByRole('button', { name: 'New binder' }).click();
    let form = page.getByRole('dialog', { name: 'New binder' });
    await form.getByLabel('Binder name').fill('Binder number six');
    await form.getByRole('button', { name: 'Create binder' }).click();
    const limit = page.getByRole('alertdialog', { name: 'You reached a plan limit' });
    await expect(limit).toBeVisible();
    await expect(limit.getByTestId('limit-summary')).toContainText('5 of 5');
    await limit.getByRole('link', { name: 'See Premium' }).click();
    await expect(page).toHaveURL(/\/premium$/);

    // The plans and the usage: binders 5 / 5 on the free plan.
    await expect(page.getByRole('heading', { level: 1, name: 'Premium' })).toBeVisible();
    const usage = page.getByRole('list', { name: 'Your plan usage' });
    await expect(usage.locator('[data-limit="binders.max"]')).toContainText('5 / 5');
    const premiumCard = page.getByRole('article', { name: 'Premium' });
    await expect(page.getByRole('article', { name: 'Free' })).toContainText('Your plan');

    // Upgrade → the local fake billing checkout.
    await premiumCard.getByRole('button', { name: 'Upgrade to Premium' }).click();
    await expect(page).toHaveURL(/\/checkout\/fake-billing\/fake_cs_[\w-]+$/);
    await expect(page.getByTestId('local-payment-banner')).toContainText('Local test payment');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Premium subscription' }),
    ).toBeVisible();
    await expect(page.getByTestId('checkout-amount')).toContainText('$4.99');

    // A simulated decline keeps the checkout open; nothing is charged.
    await page.getByRole('button', { name: 'Simulate a failed payment' }).click();
    await expect(page.getByTestId('checkout-outcome')).toContainText(
      'The payment was declined. Nothing was charged.',
      { timeout: 45_000 },
    );
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('The last attempt was declined.')).toBeVisible();

    // Pay: the webhook activates the subscription and the collector lands on Premium.
    await page.getByRole('button', { name: /^Pay \$4\.99/ }).click();
    await expect(page).toHaveURL(/\/premium\?checkout=success$/, { timeout: 45_000 });
    await expect(page.getByTestId('premium-welcome')).toContainText('Welcome to Premium!');
    const subscription = page.getByTestId('subscription-card');
    await expect(subscription).toContainText('Premium subscription');
    await expect(subscription).toContainText('Active');
    await expect(subscription.getByTestId('subscription-period-end')).toBeVisible();
    await expect(usage.locator('[data-limit="binders.max"]')).toContainText('5 / 50');
    await expect(premiumCard).toContainText('Your plan');

    // The limitation is lifted: the sixth binder is created, and Premium shows no ads.
    await page.goto('/inventory');
    await binders.getByRole('button', { name: 'New binder' }).click();
    form = page.getByRole('dialog', { name: 'New binder' });
    await form.getByLabel('Binder name').fill('Premium binder six');
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form).toBeHidden();
    await expect(binders.getByRole('link', { name: /Premium binder six/ })).toBeVisible();
    await expect(page.getByRole('alertdialog', { name: 'You reached a plan limit' })).toHaveCount(
      0,
    );
    await expect(page.locator('[data-testid="sponsored-ad"]')).toHaveCount(0);

    // Cancel now: back on the free plan at once (6 of 5 binders kept, no new ones).
    await page.goto('/premium');
    await subscription.getByRole('button', { name: 'Cancel now' }).click();
    const confirm = page.getByRole('dialog', { name: 'Cancel Premium now?' });
    await confirm.getByRole('button', { name: 'Cancel now' }).click();
    await expect(
      page.getByText('Premium is cancelled. You are on the free plan now.'),
    ).toBeVisible();
    await expect(page.getByTestId('subscription-card')).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Free' })).toContainText('Your plan');
    await expect(usage.locator('[data-limit="binders.max"]')).toContainText('6 / 5');
    await expect(premiumCard.getByRole('button', { name: 'Upgrade to Premium' })).toBeEnabled();

    const plan = await request.get(`${API_URL}/api/v1/me/plan`, {
      headers: authHeader(collector.idToken),
    });
    expect(((await plan.json()) as { plan: { code: string } }).plan.code).toBe('FREE');

    // ADR 0017: no JSON response carried a coordinate.
    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });
});
