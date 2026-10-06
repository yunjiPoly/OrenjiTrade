import { expect, test } from './support/fixtures';
import {
  API_URL,
  SEED_PASSWORD,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
} from './support/stack';

/**
 * Session leftovers of stages M1-M3 against the real, isolated stack: a link opened while signed
 * out reopens after sign-in, and a session the API no longer accepts ends in the sign-in screen
 * (with an explanation, then back to the same screen) instead of leaving every screen on "Your
 * session has ended".
 */

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  const form = screen(page, 'sign-in');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('screen-sign-in')).toBeHidden({ timeout: 30_000 });
}

test.describe('mobile session', () => {
  requireStack();

  test('a collector profile opened while signed out reopens after sign-in', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/sign-in');
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
    // A link to a collector profile, opened inside the app (like a tapped deep link).
    await page.evaluate(() => {
      window.history.pushState(null, '', '/collectors/collector5');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    // The gate keeps the visitor on sign-in and remembers the link.
    await expect(page).toHaveURL(/\/sign-in$/, { timeout: 30_000 });
    await signIn(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText('Sofia Nguyen', {
      timeout: 30_000,
    });
    // Back leads to the tabs underneath.
    await page.goBack();
    await expect(screen(page, 'map')).toBeVisible({ timeout: 30_000 });
  });

  test('a session the API refuses ends in sign-in with an explanation, then comes back', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const collector = await createOnboardedCollector(request, 'sess', 'Mobile Session');
    await page.goto('/sign-in');
    await signIn(page, collector.email, collector.password);
    await openTab(page, 'Wishlist');
    await expect(screen(page, 'wishlist').getByTestId('wishlist-empty')).toBeVisible({
      timeout: 30_000,
    });

    // From now on the API refuses every token (as for an account removed from Auth).
    await page.route(`${API_URL}/api/v1/**`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 401,
          errorCode: 'UNAUTHENTICATED',
          message: 'Authentication is required to access this resource',
          requestId: 'e2e',
        }),
      })
    );
    await openTab(page, 'Profile');
    const signInScreen = screen(page, 'sign-in');
    await expect(signInScreen).toBeVisible({ timeout: 30_000 });
    await expect(signInScreen.getByTestId('sign-in-session-ended')).toContainText(
      'Your session has ended. Sign in again to continue.'
    );

    // Signing in again brings the collector back to the screen they were on.
    await page.unroute(`${API_URL}/api/v1/**`);
    await signIn(page, collector.email, collector.password);
    await expect(screen(page, 'profile').getByTestId('profile-name')).toHaveText('Mobile Session', {
      timeout: 30_000,
    });
  });
});
