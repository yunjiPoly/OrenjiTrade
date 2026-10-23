import { expect, test } from './support/fixtures';
import {
  SEED_PASSWORD,
  TEST_PASSWORD,
  apiAgeConfirmed,
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

    // Stage R12: Create account waits for every box, with one line saying what is missing.
    const create = signUp.getByRole('button', { name: 'Create account' });
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await expect(signUp.getByTestId('sign-up-blocker')).toHaveText(
      'Accept the documents and confirm your age to continue.'
    );

    // The legal texts are readable in-app before accepting them.
    await signUp.getByRole('link', { name: 'Read the Terms of Service' }).click();
    const legal = screen(page, 'legal-document');
    await expect(legal.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(legal.getByTestId('legal-draft-banner')).toBeVisible();
    await page.goBack();
    await expect(signUp.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await signUp.getByRole('checkbox', { name: 'Accept all' }).click();
    for (const box of await signUp.getByRole('checkbox', { name: /^I accept the / }).all()) {
      await expect(box).toHaveAttribute('aria-checked', 'true');
    }
    // "Accept all" never ticks the 18+ confirmation: it is a separate, explicit statement.
    const ageBox = signUp.getByRole('checkbox', {
      name: 'I confirm I am 18 years of age or older',
    });
    await expect(ageBox).toHaveAttribute('aria-checked', 'false');
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await expect(signUp.getByTestId('sign-up-blocker')).toHaveText(
      'Confirm that you are 18 or older to continue.'
    );
    await ageBox.click();
    await expect(ageBox).toHaveAttribute('aria-checked', 'true');
    await expect(signUp.getByTestId('sign-up-blocker')).toHaveCount(0);

    // Then the fields, checked when it is pressed.
    await create.click();
    await expect(signUp.getByText('Enter a display name.')).toBeVisible();
    await expect(signUp.getByText('Enter your email address.')).toBeVisible();
    await signUp.getByLabel('Display name').fill('Mobile Newbie');
    await signUp.getByLabel('Email').fill(email);
    await signUp.getByLabel('Password', { exact: true }).fill('short');
    await create.click();
    await expect(signUp.getByText('Use at least 8 characters.')).toBeVisible();
    await signUp.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await create.click();

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

    // The welcome in three steps (stage R12): the profile (a taken handle first, said while it
    // is typed), the games, the place.
    const onboarding = screen(page, 'onboarding');
    await expect(onboarding.getByRole('heading', { name: 'Who are you?' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(onboarding.getByLabel('Step 1 of 3')).toBeVisible();
    await expect(onboarding.getByLabel('Display name')).toHaveValue('Mobile Newbie');
    // The account's first handle is random, never a part of the email (stage R12, review fix 2).
    await expect(onboarding.getByLabel('Handle', { exact: true })).toHaveValue(
      /^collector_[bcdfghjkmnpqrstvwxz2-9]{6}$/
    );
    await expect(onboarding.getByLabel('Available')).toBeVisible();
    await onboarding.getByLabel('Handle', { exact: true }).fill('collector1');
    await expect(
      onboarding.getByText('That handle is already taken. Try another one.')
    ).toBeVisible();
    await onboarding.getByLabel('Handle', { exact: true }).fill(handle);
    await expect(onboarding.getByLabel('Available')).toBeVisible();
    await onboarding
      .getByLabel('Bio (optional)')
      .fill('Fictional collector created by the mobile E2E suite.');
    await onboarding.getByRole('button', { name: 'Continue' }).click();

    await expect(onboarding.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    await expect(onboarding.getByLabel('Step 2 of 3')).toBeVisible();
    await expect(onboarding.getByTestId('interests-missing')).toHaveText(
      'Choose at least one game.'
    );
    const pokemon = onboarding.getByRole('checkbox', { name: /^Pokémon/ });
    await pokemon.click();
    await expect(pokemon).toHaveAttribute('aria-checked', 'true');
    await expect(onboarding.getByTestId('game-pokemon-note')).toHaveText('Opens first');
    const suggestion = onboarding.getByTestId(/^tag-suggestion-/).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(onboarding.getByTestId('tag-count')).toHaveText('1 / 12');
    await onboarding.getByRole('button', { name: 'Continue' }).click();

    // Where do you ship from? Pickers fed by GET /regions: no map, no GPS (ADR 0017).
    await expect(
      onboarding.getByRole('heading', { name: 'Where do you ship from?' })
    ).toBeVisible();
    await expect(onboarding.getByLabel('Step 3 of 3')).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await onboarding.getByTestId('location-country').click();
    await page.getByTestId('location-country-option-CA').click();
    await onboarding.getByTestId('location-subdivision').click();
    await page.getByTestId('location-subdivision-option-CA-QC').click();
    const discoverable = onboarding.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');
    const put = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().endsWith('/api/v1/me/location')
    );
    await onboarding.getByRole('button', { name: 'Finish' }).click();
    const sent = (await put).postDataJSON() as Record<string, unknown>;
    expect(sent).toEqual({
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      city: null,
      showCity: true,
    });

    // The tabs; the profile shows the new identity and the default (hidden) visibility.
    await expect(snackbar(page)).toHaveText('Welcome to OrenjiTrade! Your profile is ready.', {
      timeout: 30_000,
    });
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-name')).toHaveText('Mobile Newbie');
    await expect(profile.getByTestId('profile-handle-label')).toHaveText(`@${handle}`);
    // Not discoverable yet: your page, as others see it, has no place (stage R6).
    await expect(profile.getByTestId('profile-line')).toHaveText(
      /^Not on the map · Member since \d{4}$/
    );

    // Sign out is in Settings, behind the gear.
    await profile.getByTestId('profile-settings').click();
    await screen(page, 'settings').getByRole('button', { name: 'Sign out' }).click();
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
    await expect(page.getByRole('heading', { name: 'Review our terms' })).toBeVisible({
      timeout: 30_000,
    });
    // Stage R12: "Accept and continue" waits until every box is ticked.
    const accept = consent.getByRole('button', { name: 'Accept and continue' });
    await expect(accept).toHaveAttribute('aria-disabled', 'true');
    await consent.getByRole('checkbox', { name: 'Accept all' }).click();
    // Review our terms also collects the 18+ confirmation (Google sign-ups never see sign-up).
    await expect(accept).toHaveAttribute('aria-disabled', 'true');
    await consent
      .getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' })
      .click();
    await accept.click();
    const onboarding = screen(page, 'onboarding');
    // Confirmed on Review our terms: the welcome starts at the profile, and has no age step.
    await expect(onboarding.getByRole('heading', { name: 'Who are you?' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(onboarding.getByText('Are you 18 or older?')).toHaveCount(0);
    expect(await apiAgeConfirmed(request, user.idToken)).toBe(true);
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
