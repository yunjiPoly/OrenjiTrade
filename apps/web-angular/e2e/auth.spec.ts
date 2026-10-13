import { expect, test } from '@playwright/test';
import {
  SEED_PASSWORD,
  TEST_PASSWORD,
  chooseOption,
  emulatorSignUp,
  openAccountMenu,
  requireStack,
  signInThroughUi,
  uniqueEmail,
  uniqueHandle,
  verifyEmailInEmulator,
} from './support/stack';

/**
 * Phase 1 authentication flows against the real local stack (API :8080 + Firebase Auth
 * emulator): sign-up with legal consents, email verification, onboarding with the Leaflet map,
 * sign-out and sign-in with a seed account, plus the 428 consent screen.
 */
test.describe('authentication and onboarding', () => {
  requireStack();

  test('a new collector signs up, verifies, says where they are and signs out', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail('signup');
    const handle = uniqueHandle('newbie');

    // --- Sign up with the required legal documents -----------------------------------------
    await page.goto('/auth/sign-up');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);

    // Submitting without the consents shows the inline validation messages (documents + 18+).
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Please accept every document to continue.')).toBeVisible();
    await expect(
      page.getByText('You must confirm that you are 18 years of age or older to use OrenjiTrade.'),
    ).toBeVisible();

    const terms = page.getByRole('link', { name: 'Terms of Service' });
    await expect(terms).toHaveAttribute('href', '/legal/terms');
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    for (const box of await page.getByRole('checkbox', { name: /I have read and accept/ }).all()) {
      await expect(box).toBeChecked();
    }
    // "Accept all" never ticks the age confirmation: it is a separate, explicit statement.
    const ageBox = page.getByRole('checkbox', { name: /I confirm I am 18 years of age or older/ });
    await expect(ageBox).not.toBeChecked();
    await ageBox.check();
    await page.getByRole('button', { name: 'Create account' }).click();

    // --- Verify the email through the emulator's out-of-band code ---------------------------
    await expect(page).toHaveURL(/\/auth\/verify-email/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await verifyEmailInEmulator(request, email);
    await page.getByRole('button', { name: 'I have verified my email' }).click();

    // --- Onboarding: profile (handle conflict first), interests, location -------------------
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: "Let's set up your collector profile" }),
    ).toBeVisible();
    const handleField = page.getByLabel('Handle');
    await handleField.fill('collector1');
    await page.getByLabel('Display name').fill('E2E Newbie');
    await page.getByLabel('Bio').fill('Fictional collector created by the E2E suite.');
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    await continueButton.filter({ visible: true }).click();
    await expect(page.getByText('That handle is already taken. Try another one.')).toBeVisible();

    await handleField.fill(handle);
    await continueButton.filter({ visible: true }).click();

    await expect(page.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    const pokemon = page
      .getByRole('group', { name: 'Games you collect or play' })
      .getByRole('button', { name: 'Pokémon' });
    await pokemon.click();
    await expect(pokemon).toHaveAttribute('aria-pressed', 'true');
    const suggestion = page
      .getByRole('list', { name: 'Suggested tags' })
      .getByRole('button')
      .first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(page.getByText('1 / 12')).toBeVisible();
    await continueButton.filter({ visible: true }).click();

    // "Where are you?": simple pickers fed by GET /regions, no map, no GPS (ADR 0017).
    await expect(page.getByRole('heading', { name: 'Where are you?' })).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    // Finishing without a state or province is explained, not sent.
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Choose your country.')).toBeVisible();
    await chooseOption(page, 'Country', 'Canada');
    await chooseOption(page, 'State or province', 'Ontario');
    await page.getByLabel('City (optional)').fill('Ottawa');

    await page.getByRole('switch', { name: 'Show me on the map' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page).toHaveURL(/\/map(\?region=[a-z-]+)?$/, { timeout: 20_000 });
    await expect(page.getByText('Welcome to OrenjiTrade! Your profile is ready.')).toBeVisible();

    // --- Account menu shows the new identity; sign out ---------------------------------------
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-name')).toHaveText('E2E Newbie');
    await expect(page.getByTestId('account-menu-handle')).toHaveText(`@${handle}`);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByText('You are signed out. See you soon!')).toBeVisible();

    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Create account' })).toBeVisible();
    await page.keyboard.press('Escape');

    // --- Sign in again as the seed collector: an existing account confirms its age first ------
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Are you 18 or older?' })).toBeVisible();
    await expect(page.getByLabel('Handle')).not.toBeVisible();
    await page.getByRole('checkbox', { name: /I confirm I am 18 years of age or older/ }).check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/map(\?region=[a-z-]+)?$/, { timeout: 20_000 });
    await expect(page.getByText('Thanks for confirming. Welcome back!')).toBeVisible();
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-name')).toHaveText('Maïka Tremblay');
    await expect(page.getByTestId('account-menu-handle')).toHaveText('@collector1');
    await expect(page.getByRole('menuitem', { name: 'Admin' })).toHaveCount(0);
  });

  test('wrong credentials show a friendly error', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email').fill('collector1@orenjitrade.test');
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No account matches these credentials.');
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test('an account without accepted terms is sent to the consent page first', async ({
    page,
    request,
  }) => {
    const user = await emulatorSignUp(request, uniqueEmail('consent'));
    await signInThroughUi(page, user.email, user.password);

    await expect(page).toHaveURL(/\/auth\/consent/);
    await expect(page.getByRole('heading', { level: 1, name: 'Review our terms' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    // The consent page also collects the 18+ confirmation (Google sign-ups never see sign-up).
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(
      page.getByText('You must confirm that you are 18 years of age or older to use OrenjiTrade.'),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /I confirm I am 18 years of age or older/ }).check();
    await page.getByRole('button', { name: 'Accept and continue' }).click();

    // Terms accepted and age confirmed: a fresh account continues to the profile step.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await expect(page.getByLabel('Handle')).toBeVisible();
  });

  test('protected pages redirect to sign-in and come back afterwards', async ({ page }) => {
    await page.goto('/settings/privacy');
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=(%2F|\/)settings(%2F|\/)privacy/);
    await page.getByLabel('Email').fill('collector2@orenjitrade.test');
    await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // A seed collector confirms being 18+ first (fresh E2E database); the return URL survives.
    await expect(page).toHaveURL(/\/onboarding\?returnUrl=(%2F|\/)settings(%2F|\/)privacy/, {
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'Are you 18 or older?' })).toBeVisible();
    await page.getByRole('checkbox', { name: /I confirm I am 18 years of age or older/ }).check();
    await page
      .getByRole('button', { name: 'Continue', exact: true })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(/\/settings\/privacy$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Visibility' })).toBeVisible();
  });

  test('the reset-password page confirms without revealing accounts', async ({ page }) => {
    await page.goto('/auth/reset-password');
    await page.getByLabel('Email').fill(uniqueEmail('reset'));
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists for');
  });
});
