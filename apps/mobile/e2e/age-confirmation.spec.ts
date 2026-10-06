import { expect, test } from './support/fixtures';
import {
  apiAgeConfirmed,
  createOnboardedCollector,
  openInApp,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * The 18+ rule on an existing account (launch readiness): a collector created before the rule
 * (every document accepted, profile complete, no `AGE_CONFIRMATION` consent) is asked for the
 * confirmation alone on their next sign-in, a link they open meanwhile is remembered, and they
 * come back to it once the API holds the confirmation. The sign-up checkbox and the consent
 * screen's checkbox are covered by auth.spec.ts.
 */
test.describe('mobile age confirmation', () => {
  requireStack();

  test('an existing collector confirms their age once, then returns to where they came from', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'age', 'Mobile Adult', {
      confirmAge: false,
    });
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(false);

    await signInThroughUi(page, collector.email, collector.password);
    const onboarding = screen(page, 'onboarding');
    await expect(onboarding.getByRole('heading', { name: 'Are you 18 or older?' })).toBeVisible({
      timeout: 30_000,
    });
    // Only the confirmation: no profile fields for a collector whose profile is complete.
    await expect(onboarding.getByLabel('Handle')).toHaveCount(0);
    await expect(onboarding.getByText('Je confirme avoir 18 ans ou plus')).toBeVisible();

    // A link opened meanwhile (a deep link, a notification) is remembered by the gate, which
    // sends the collector straight back to the step (so the URL never settles on the link).
    await page.evaluate(() => {
      window.history.pushState(null, '', '/collectors/collector5');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
    await expect(onboarding.getByRole('heading', { name: 'Are you 18 or older?' })).toBeVisible({
      timeout: 30_000,
    });

    // Unticked: nothing is recorded.
    await onboarding.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      onboarding.getByText(
        'You must confirm that you are 18 years of age or older to use OrenjiTrade.'
      )
    ).toBeVisible();
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(false);

    const consent = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().endsWith('/api/v1/me/consents')
    );
    await onboarding
      .getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' })
      .click();
    await onboarding.getByRole('button', { name: 'Continue', exact: true }).click();
    const sent = (await consent).postDataJSON() as {
      documentType: string;
      version: string;
      language: string;
    };
    expect(sent.documentType).toBe('AGE_CONFIRMATION');
    expect(sent.language).toBe('en');
    await expect(snackbar(page)).toHaveText('Thanks for confirming. Welcome back!', {
      timeout: 30_000,
    });
    // Back to the remembered link: Sofia's profile, on top of the tabs.
    await expect(screen(page, 'collector').getByTestId('collector-name')).toHaveText(
      'Sofia Nguyen',
      { timeout: 30_000 }
    );
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(true);
    await openInApp(page, '/');
    await expect(screen(page, 'map')).toBeVisible({ timeout: 30_000 });

    // Confirmed for good: a reload lands on the tabs, never on the step again.
    await page.reload();
    await expect(screen(page, 'map')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Are you 18 or older?')).toHaveCount(0);
  });

  test('an unconfirmed collector who cannot confirm can still sign out from the step', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'minor', 'Mobile Undecided', {
      confirmAge: false,
    });
    await signInThroughUi(page, collector.email, collector.password);
    const onboarding = screen(page, 'onboarding');
    await expect(onboarding.getByRole('heading', { name: 'Are you 18 or older?' })).toBeVisible({
      timeout: 30_000,
    });
    await onboarding.getByRole('button', { name: 'Sign out' }).click();
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(false);
  });
});
