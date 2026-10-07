import { expect, test } from './support/fixtures';
import {
  FIREBASE_API_KEY,
  AUTH_EMULATOR_URL,
  createOnboardedCollector,
  emulatorProvidersOf,
  emulatorSignIn,
  emulatorVerifyEmail,
  openTab,
  requireStack,
  screen,
  snackbar,
  uniqueEmail,
  uniqueHandle,
  type EmulatorUser,
} from './support/stack';

/**
 * Google sign-in and sign-up (stage M7) on the Expo web build against the local Auth emulator,
 * which has no Google: the app's "simulated Google account" dialog sends the emulator's fake OAuth
 * ID token (`sub`, `email`, `email_verified`, `name`) through `signInWithCredential`, the same
 * credential path a device takes with a real Google ID token. A Google sign-up collects the legal
 * consent like the web, skips the e-mail verification (Google verified the address) and onboards.
 * Google with the e-mail of an existing e-mail/password account signs in to that account, and
 * Firebase's trusted-provider rule (the same on the web and in production) decides what happens to
 * the password: kept and linked when the address was verified, replaced when it was not.
 */
test.describe('mobile Google sign-in', () => {
  requireStack();

  /** Continues with Google as `email` / `name` from the sign-in screen (the emulator dialog). */
  async function continueWithGoogle(
    page: Parameters<typeof screen>[0],
    email: string,
    name: string
  ): Promise<void> {
    const signIn = screen(page, 'sign-in');
    await signIn.getByRole('button', { name: 'Continue with Google' }).click();
    const dialog = page.getByTestId('google-dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByTestId('google-dialog-confirm').click();
    await expect(signIn).toBeHidden({ timeout: 30_000 });
  }

  /** The password of an emulator account still signs in (true) or was removed (false). */
  async function passwordStillWorks(
    api: Parameters<typeof emulatorSignIn>[0],
    user: EmulatorUser
  ): Promise<boolean> {
    const response = await api.post(
      `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      { data: { email: user.email, password: user.password, returnSecureToken: true } }
    );
    return response.ok();
  }

  test('a Google sign-up collects consent, onboards and reaches the tabs with Google as its only sign-in method', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const email = uniqueEmail('google');
    const handle = uniqueHandle('mgoo');

    await page.goto('/sign-in');
    await screen(page, 'sign-in').getByRole('link', { name: 'Create an account' }).click();
    const signUp = screen(page, 'sign-up');
    await expect(signUp.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await signUp.getByRole('button', { name: 'Sign up with Google' }).click();

    // The simulated account is validated like a form, then sent as the fake OAuth credential.
    const dialog = page.getByTestId('google-dialog');
    await expect(dialog).toContainText('Simulated Google account');
    await expect(dialog).toContainText('Local emulator only. Nothing reaches Google.');
    await dialog.getByTestId('google-dialog-confirm').click();
    await expect(
      dialog.getByText('Enter the e-mail of the simulated Google account.')
    ).toBeVisible();
    await expect(dialog.getByText('Enter a name for the simulated Google account.')).toBeVisible();
    await dialog.getByLabel('Email').fill('not-an-email');
    await dialog.getByLabel('Name').fill('Google Newbie');
    await dialog.getByTestId('google-dialog-confirm').click();
    await expect(dialog.getByText('That email address does not look right.')).toBeVisible();
    await dialog.getByLabel('Email').fill(email);
    const idp = page.waitForRequest((candidate) =>
      candidate.url().includes('accounts:signInWithIdp')
    );
    await dialog.getByTestId('google-dialog-confirm').click();
    // The credential is the emulator's fake ID token: a JSON object with a verified e-mail.
    const sent = (await idp).postDataJSON() as { postBody?: string };
    const postBody = new URLSearchParams(sent.postBody ?? '');
    expect(postBody.get('providerId')).toBe('google.com');
    expect(JSON.parse(postBody.get('id_token') ?? '{}')).toMatchObject({
      email,
      email_verified: true,
      name: 'Google Newbie',
    });

    // No verification step (Google verified the address): the consent screen first, like the web.
    const consent = screen(page, 'consent');
    await expect(consent.getByRole('heading', { name: 'Review our terms' })).toBeVisible({
      timeout: 30_000,
    });
    await consent.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(consent.getByText('Please accept every document to continue.')).toBeVisible();
    await consent.getByRole('checkbox', { name: 'Accept all' }).click();
    // A Google sign-up never saw the sign-up screen: the consent screen collects the 18+
    // confirmation too (its own checkbox, never ticked by "Accept all").
    await consent.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(
      consent.getByText(
        'You must confirm that you are 18 years of age or older to use OrenjiTrade.'
      )
    ).toBeVisible();
    await consent
      .getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' })
      .click();
    await consent.getByRole('button', { name: 'Accept and continue' }).click();

    // Onboarding, with the name Google returned prefilled (no age step: confirmed already).
    const onboarding = screen(page, 'onboarding');
    await expect(
      onboarding.getByRole('heading', { name: "Let's set up your collector profile" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(onboarding.getByLabel('Display name')).toHaveValue('Google Newbie');
    await onboarding.getByLabel('Handle').fill(handle);
    await onboarding.getByRole('button', { name: 'Continue' }).click();
    await expect(onboarding.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    await onboarding.getByRole('checkbox', { name: 'Pokémon' }).click();
    await onboarding.getByRole('button', { name: 'Continue' }).click();
    await expect(onboarding.getByRole('heading', { name: 'Where do you trade?' })).toBeVisible();
    await onboarding.getByRole('button', { name: 'Finish' }).click();
    await expect(snackbar(page)).toHaveText('Welcome to OrenjiTrade! Your profile is ready.', {
      timeout: 30_000,
    });

    // The tabs and the profile; Settings → Account names Google as the only sign-in method.
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-name')).toHaveText('Google Newbie', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('profile-handle-label')).toHaveText(`@${handle}`);
    await profile.getByTestId('profile-settings').click();
    await screen(page, 'settings').getByTestId('settings-link-account').click();
    const account = screen(page, 'settings-account');
    await expect(account.getByTestId('account-email')).toHaveText(email, { timeout: 30_000 });
    await expect(account.getByTestId('account-sign-in-method')).toHaveText('Google');

    // The emulator holds one Google identity with a verified e-mail and no password.
    expect(await emulatorProvidersOf(request, email)).toEqual({
      providers: ['google.com'],
      displayName: 'Google Newbie',
      emailVerified: true,
    });
  });

  test('dismissing the chooser shows nothing; the e-mail of a verified password account signs in to that account and links Google', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'glink', 'Mobile Linked');
    await emulatorVerifyEmail(request, collector);

    await page.goto('/sign-in');
    const signIn = screen(page, 'sign-in');
    await signIn.getByRole('button', { name: 'Continue with Google' }).click();
    const dialog = page.getByTestId('google-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('google-dialog-cancel').click();
    await expect(dialog).toBeHidden();
    await expect(signIn.getByTestId('sign-in-error')).toHaveCount(0);
    await expect(signIn).toBeVisible();

    // The same e-mail as the password account (case does not matter): the existing account.
    await continueWithGoogle(page, collector.email.toUpperCase(), 'Mobile Linked (Google)');

    // Onboarding was already done: the tabs, the same handle and profile.
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-handle-label')).toHaveText(`@${collector.handle}`, {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('profile-name')).toHaveText('Mobile Linked');
    await profile.getByTestId('profile-settings').click();
    await screen(page, 'settings').getByTestId('settings-link-account').click();
    await expect(screen(page, 'settings-account').getByTestId('account-sign-in-method')).toHaveText(
      'Email and password, Google',
      { timeout: 30_000 }
    );

    // Google was linked to the verified account; the password still signs in.
    const identity = await emulatorProvidersOf(request, collector.email);
    expect([...(identity?.providers ?? [])].sort()).toEqual(['google.com', 'password']);
    expect(await passwordStillWorks(request, collector)).toBe(true);
  });

  test('the e-mail of an unverified password account: Google takes the account over and replaces the password (Firebase rule)', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'gtake', 'Mobile Taken Over');
    expect((await emulatorProvidersOf(request, collector.email))?.emailVerified).toBe(false);

    await page.goto('/sign-in');
    await continueWithGoogle(page, collector.email, 'Mobile Taken Over');

    // Still the same account (same handle, onboarding done), now with Google as its only method.
    await openTab(page, 'Profile');
    await expect(screen(page, 'profile').getByTestId('profile-handle-label')).toHaveText(
      `@${collector.handle}`,
      { timeout: 30_000 }
    );
    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings').getByTestId('settings-link-account').click();
    await expect(screen(page, 'settings-account').getByTestId('account-sign-in-method')).toHaveText(
      'Google',
      { timeout: 30_000 }
    );
    expect((await emulatorProvidersOf(request, collector.email))?.providers).toEqual([
      'google.com',
    ]);
    expect(await passwordStillWorks(request, collector)).toBe(false);
  });
});
