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
 * The 18+ rule on an existing account (launch readiness; Review our terms since stage R12): a
 * collector created before the rule (every document accepted, profile complete, no
 * `AGE_CONFIRMATION` consent) is asked for the confirmation alone on Review our terms at their
 * next sign-in, a link they open meanwhile is remembered, and they come back to it once the API
 * holds the confirmation. The sign-up checkbox and Review our terms with documents are covered by
 * auth.spec.ts.
 */
test.describe('mobile age confirmation', () => {
  requireStack();

  test('an existing collector confirms their age once on Review our terms, then returns to where they came from', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'age', 'Mobile Adult', {
      confirmAge: false,
    });
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(false);

    await signInThroughUi(page, collector.email, collector.password);
    const consent = screen(page, 'consent');
    await expect(page.getByRole('heading', { name: 'Review our terms' })).toBeVisible({
      timeout: 30_000,
    });
    // Only the age line: no document is due, and no welcome step.
    await expect(
      consent.getByText('Please confirm your age to keep using OrenjiTrade.')
    ).toBeVisible();
    await expect(consent.getByTestId('legal-consents')).toHaveCount(0);
    await expect(page.getByText('Are you 18 or older?')).toHaveCount(0);
    // English only (owner, 2026-10-20).
    await expect(consent.getByText(/Je confirme/)).toHaveCount(0);

    // A link opened meanwhile (a deep link, a notification) is remembered by the gate, which
    // sends the collector straight back to Review our terms (so the URL never settles on it).
    await page.evaluate(() => {
      window.history.pushState(null, '', '/collectors/collector5');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    await expect(page).toHaveURL(/\/consent$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Review our terms' })).toBeVisible({
      timeout: 30_000,
    });

    // Unticked: "Accept and continue" waits, nothing is recorded.
    const accept = consent.getByRole('button', { name: 'Accept and continue' });
    await expect(accept).toHaveAttribute('aria-disabled', 'true');
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(false);

    const recorded = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().endsWith('/api/v1/me/consents')
    );
    await consent
      .getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' })
      .click();
    await accept.click();
    const sent = (await recorded).postDataJSON() as {
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
    await openInApp(page, '/search');
    await expect(screen(page, 'search')).toBeVisible({ timeout: 30_000 });

    // Confirmed for good: a reload lands on the tabs, never on Review our terms again.
    await page.reload();
    await expect(screen(page, 'search')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Review our terms')).toHaveCount(0);
  });

  test('an unconfirmed collector who cannot confirm can still sign out from Review our terms', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'minor', 'Mobile Undecided', {
      confirmAge: false,
    });
    await signInThroughUi(page, collector.email, collector.password);
    const consent = screen(page, 'consent');
    await expect(page.getByRole('heading', { name: 'Review our terms' })).toBeVisible({
      timeout: 30_000,
    });
    await consent.getByRole('button', { name: 'Sign out' }).click();
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
    expect(await apiAgeConfirmed(request, collector.idToken)).toBe(false);
  });
});
