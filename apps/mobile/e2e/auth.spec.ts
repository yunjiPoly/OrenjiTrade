import { expect, test } from './support/fixtures';
import {
  SEED_PASSWORD,
  TEST_PASSWORD,
  emulatorSignUp,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
  uniqueEmail,
  uniqueHandle,
  verifyEmailInEmulator,
} from './support/stack';

/**
 * Phase 1 accounts on the mobile app (Expo web build) against the real stack: sign-up with the
 * legal documents, verification, onboarding, the tabs, sign-out, sign-in with a seed account, the
 * friendly sign-in error, the consent screen and the password reset.
 */
test.describe('mobile accounts', () => {
  requireStack();

  test('a new collector signs up, verifies, onboards and reaches the tabs, then signs out', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const email = uniqueEmail('signup');
    const handle = uniqueHandle('mnew');

    // Signed out: the gate shows the sign-in screen.
    await page.goto('/');
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
    await screen(page, 'sign-in').getByRole('link', { name: 'Create an account' }).click();
    const signUp = screen(page, 'sign-up');
    await expect(signUp.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    // Validation first: nothing filled in, no consent.
    await signUp.getByRole('button', { name: 'Create account' }).click();
    await expect(signUp.getByText('Enter a display name.')).toBeVisible();
    await expect(signUp.getByText('Enter your email address.')).toBeVisible();
    await expect(signUp.getByText('Please accept every document to continue.')).toBeVisible();

    await signUp.getByLabel('Display name').fill('Mobile Newbie');
    await signUp.getByLabel('Email').fill(email);
    await signUp.getByLabel('Password', { exact: true }).fill('short');
    await signUp.getByRole('button', { name: 'Create account' }).click();
    await expect(signUp.getByText('Use at least 8 characters.')).toBeVisible();
    await signUp.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);

    // The legal texts are readable in-app before accepting them.
    await signUp.getByRole('link', { name: 'Read the Terms of Service' }).click();
    const legal = screen(page, 'legal-document');
    await expect(legal.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(legal.getByTestId('legal-draft-banner')).toBeVisible();
    await page.goBack();
    await expect(signUp.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await signUp.getByRole('checkbox', { name: 'Accept all' }).click();
    for (const box of await signUp
      .getByRole('checkbox', { name: /I have read and accept/ })
      .all()) {
      await expect(box).toHaveAttribute('aria-checked', 'true');
    }
    await signUp.getByRole('button', { name: 'Create account' }).click();

    // Verification through the emulator's out-of-band code.
    const verify = screen(page, 'verify-email');
    await expect(verify.getByRole('heading', { name: 'Check your inbox' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(verify.getByText(email)).toBeVisible();
    await verify.getByRole('button', { name: 'I have verified my email' }).click();
    await expect(verify.getByTestId('verify-message')).toContainText(
      'We do not see the verification yet'
    );
    await verifyEmailInEmulator(request, email);
    await verify.getByRole('button', { name: 'I have verified my email' }).click();

    // Onboarding: profile (a taken handle first), interests, trading area.
    const onboarding = screen(page, 'onboarding');
    await expect(
      onboarding.getByRole('heading', { name: "Let's set up your collector profile" })
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(onboarding.getByLabel('Display name')).toHaveValue('Mobile Newbie');
    await onboarding.getByLabel('Handle').fill('collector1');
    await onboarding.getByRole('button', { name: 'Continue' }).click();
    await expect(
      onboarding.getByText('That handle is already taken. Try another one.')
    ).toBeVisible();
    await onboarding.getByLabel('Handle').fill(handle);
    await onboarding.getByLabel('Bio').fill('Fictional collector created by the mobile E2E suite.');
    await onboarding.getByRole('button', { name: 'Continue' }).click();

    await expect(onboarding.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    await onboarding.getByRole('button', { name: 'Continue' }).click();
    await expect(onboarding.getByText('Choose at least one game or one tag.')).toBeVisible();
    const pokemon = onboarding.getByRole('checkbox', { name: 'Pokémon' });
    await pokemon.click();
    await expect(pokemon).toHaveAttribute('aria-checked', 'true');
    const suggestion = onboarding.getByRole('button', { name: /^Add tag / }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(onboarding.getByTestId('tag-count')).toHaveText('1 / 12');
    await onboarding.getByRole('button', { name: 'Continue' }).click();

    await expect(onboarding.getByRole('heading', { name: 'Where do you trade?' })).toBeVisible();
    // The trading area: the launch city by default, moved by a tap on the map (Leaflet on web).
    const summary = onboarding.getByTestId('area-centre-summary');
    await expect(summary).toHaveText('Centre: Montréal city centre.');
    const map = onboarding.getByTestId('trading-area-map');
    await expect(map.locator('.leaflet-pane').first()).toBeAttached({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    if (!box) {
      throw new Error('The trading-area map has no box.');
    }
    await map.click({ position: { x: box.width / 2 - 40, y: box.height / 2 - 40 } });
    await expect(summary).toHaveText('Centre: the point you chose on the map.');
    const discoverable = onboarding.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');
    const put = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' && request.url().endsWith('/api/v1/me/location/trading-area')
    );
    await onboarding.getByRole('button', { name: 'Finish' }).click();
    const sent = (await put).postDataJSON() as { lat: number; lng: number; source: string };
    expect(sent.source).toBe('MANUAL');
    expect([sent.lat, sent.lng]).not.toEqual([45.502, -73.567]);

    // The tabs; the profile shows the new identity and the default (hidden) visibility.
    await expect(snackbar(page)).toHaveText('Welcome to OrenjiTrade! Your profile is ready.', {
      timeout: 30_000,
    });
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-name')).toHaveText('Mobile Newbie');
    await expect(profile.getByTestId('profile-handle-label')).toHaveText(`@${handle}`);
    await expect(profile.getByTestId('profile-area')).toContainText('5 km radius');
    await expect(profile.getByTestId('profile-visibility')).toHaveText('Hidden from the map.');

    await profile.getByRole('button', { name: 'Sign out' }).click();
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });

    // The session is gone: a reload stays signed out.
    await page.reload();
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
  });

  test('a seed collector signs in, the session survives a reload, and signs out from Settings', async ({
    page,
  }) => {
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-name')).toHaveText('Maïka Tremblay', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('profile-handle-label')).toHaveText('@collector1');

    // Session restore on launch (Firebase browser persistence).
    await page.reload();
    await openTab(page, 'Profile');
    await expect(screen(page, 'profile').getByTestId('profile-name')).toHaveText('Maïka Tremblay', {
      timeout: 30_000,
    });

    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings').getByTestId('settings-sign-out').click();
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
  });

  test('wrong credentials and a malformed email show friendly errors', async ({ page }) => {
    await page.goto('/sign-in');
    const signIn = screen(page, 'sign-in');
    await signIn.getByLabel('Email').fill('not-an-email');
    await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signIn.getByText('That email address does not look right.')).toBeVisible();
    await expect(signIn.getByText('Enter your password.')).toBeVisible();

    await signIn.getByLabel('Email').fill('collector1@orenjitrade.test');
    await signIn.getByLabel('Password', { exact: true }).fill('not-the-password');
    await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signIn.getByTestId('sign-in-error')).toContainText(
      'No account matches these credentials.'
    );
    await expect(signIn).toBeVisible();
  });

  test('an account without accepted terms goes to the consent screen first', async ({
    page,
    request,
  }) => {
    const user = await emulatorSignUp(request, uniqueEmail('consent'));
    await signInThroughUi(page, user.email, user.password);
    const consent = screen(page, 'consent');
    await expect(consent.getByRole('heading', { name: 'Review our terms' })).toBeVisible({
      timeout: 30_000,
    });
    await consent.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(consent.getByText('Please accept every document to continue.')).toBeVisible();
    await consent.getByRole('checkbox', { name: 'Accept all' }).click();
    await consent.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(
      screen(page, 'onboarding').getByRole('heading', {
        name: "Let's set up your collector profile",
      })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('a password reset never reveals whether the account exists', async ({ page }) => {
    await page.goto('/sign-in');
    await screen(page, 'sign-in').getByRole('link', { name: 'Forgot your password?' }).click();
    const reset = screen(page, 'reset-password');
    await reset.getByRole('button', { name: 'Send reset link' }).click();
    await expect(reset.getByText('Enter your email address.')).toBeVisible();
    const unknown = uniqueEmail('nobody');
    await reset.getByLabel('Email').fill(unknown);
    await reset.getByRole('button', { name: 'Send reset link' }).click();
    await expect(reset.getByTestId('reset-sent')).toContainText(
      `If an account exists for ${unknown}`
    );
  });
});
