import { expect, test } from '@playwright/test';
import {
  SEED_PASSWORD,
  TEST_PASSWORD,
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

  test('a new collector signs up, verifies, onboards on the map and signs out', async ({
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

    // Submitting without the consents shows the inline validation message.
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Please accept every document to continue.')).toBeVisible();

    const terms = page.getByRole('link', { name: 'Terms of Service' });
    await expect(terms).toHaveAttribute('href', '/legal/terms');
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    for (const box of await page.getByRole('checkbox', { name: /I have read and accept/ }).all()) {
      await expect(box).toBeChecked();
    }
    await page.getByRole('button', { name: 'Create account' }).click();

    // --- Verify the email through the emulator's out-of-band code ---------------------------
    await expect(page).toHaveURL(/\/auth\/verify-email/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await verifyEmailInEmulator(request, email);
    await page.getByRole('button', { name: 'I have verified my email' }).click();

    // --- Onboarding: profile (handle conflict first), interests, trading area ---------------
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

    await expect(page.getByRole('heading', { name: 'Where do you trade?' })).toBeVisible();
    const map = page.getByTestId('trading-area-map');
    await expect(map.locator('.leaflet-container, .leaflet-pane').first()).toBeAttached({
      timeout: 20_000,
    });
    await expect(page.locator('.orenji-map-pin--centre')).toBeVisible();
    const pinBefore = await page.locator('.orenji-map-pin--centre').boundingBox();
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    await map.click({ position: { x: box!.width * 0.3, y: box!.height * 0.35 } });
    await expect
      .poll(async () => (await page.locator('.orenji-map-pin--centre').boundingBox())?.x)
      .not.toBe(pinBefore?.x);

    const slider = page.getByRole('slider', { name: 'Trading radius' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('output').filter({ hasText: 'km' })).toContainText('7 km');

    await page.getByRole('switch', { name: 'Show me on the map' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page).toHaveURL(/\/map$/, { timeout: 20_000 });
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

    // --- Sign in again as the seed collector ---------------------------------------------------
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await expect(page).toHaveURL(/\/map$/);
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
    await page.getByRole('button', { name: 'Accept and continue' }).click();

    // Terms accepted: a fresh account continues to onboarding.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await expect(page.getByLabel('Handle')).toBeVisible();
  });

  test('protected pages redirect to sign-in and come back afterwards', async ({ page }) => {
    await page.goto('/settings/privacy');
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=(%2F|\/)settings(%2F|\/)privacy/);
    await page.getByLabel('Email').fill('collector2@orenjitrade.test');
    await page.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
