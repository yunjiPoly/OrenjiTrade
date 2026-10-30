import { expect, test } from '@playwright/test';
import {
  API_URL,
  SEED_PASSWORD,
  TEST_PASSWORD,
  authHeader,
  chooseOption,
  createOnboardedCollector,
  emulatorSignIn,
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

    // --- Create your account (board W27): display name, the documents, the 18+ line ----------
    await page.goto('/auth/sign-up');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();
    await page.getByLabel('Display name').fill('E2E Newbie');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);

    // "Create account" waits with one reason line until every box is ticked (spec 14).
    const create = page.getByRole('button', { name: 'Create account' });
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    const why = page.locator('#su-why');
    await expect(why).toHaveText('Accept the documents and confirm your age to continue.');
    await create.click({ force: true });
    await expect(page).toHaveURL(/\/auth\/sign-up/);

    const read = page.getByRole('link', { name: 'Read the Terms of Service, opens in a new tab' });
    await expect(read).toHaveAttribute('href', '/legal/terms');
    await expect(read).toHaveAttribute('target', '_blank');
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    for (const box of await page.getByRole('checkbox', { name: /^I accept the / }).all()) {
      await expect(box).toBeChecked();
    }
    // "Accept all" never ticks the age confirmation: it is a separate, explicit statement, in
    // English only (owner, 2026-10-20).
    const ageBox = page.getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' });
    await expect(ageBox).not.toBeChecked();
    await expect(why).toHaveText('Confirm that you are 18 or older to continue.');
    await expect(page.getByText('Je confirme')).toHaveCount(0);
    await ageBox.check();
    await expect(create).not.toHaveAttribute('aria-disabled', 'true');
    await create.click();

    // --- Verify your email through the emulator's out-of-band code --------------------------
    await expect(page).toHaveURL(/\/auth\/verify-email/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Verify your email' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await verifyEmailInEmulator(request, email);
    await page.getByRole('button', { name: 'I have verified my email' }).click();

    // --- The welcome (spec 14): Step 1 of 3, the handle's live check ------------------------
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Who are you?' })).toBeVisible();
    await expect(page.getByTestId('welcome-step')).toHaveText('Step 1 of 3');
    // The name typed at sign-up comes along.
    await expect(page.getByLabel('Display name')).toHaveValue('E2E Newbie');
    const handleField = page.getByLabel('Handle');
    await handleField.fill('collector1');
    await expect(page.locator('#wl-handle-check')).toHaveText(
      'That handle is already taken. Try another one.',
    );
    await page.getByLabel('Bio (optional)').fill('Fictional collector created by the E2E suite.');
    await handleField.fill(handle);
    await expect(page.locator('#wl-handle-check')).toHaveText(`@${handle} is free`);
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    await continueButton.click();

    await expect(page.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    await expect(page.getByTestId('welcome-step')).toHaveText('Step 2 of 3');
    const pokemon = page
      .getByRole('group', { name: 'Games you collect or play' })
      .getByRole('button', { name: 'Pokémon' });
    await pokemon.click();
    await expect(pokemon).toHaveAttribute('aria-pressed', 'true');
    await expect(pokemon).toContainText('Opens first');
    const suggestion = page
      .getByRole('list', { name: 'Suggested tags' })
      .getByRole('button')
      .first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(page.getByText('1 / 12')).toBeVisible();
    await continueButton.click();

    // "Where do you ship from?": simple pickers fed by GET /regions, no map, no GPS (ADR 0017).
    await expect(page.getByRole('heading', { name: 'Where do you ship from?' })).toBeVisible();
    await expect(page.getByText('We never use GPS and never ask for your address.')).toBeVisible();
    const mapSwitch = page.getByRole('switch', { name: 'Show me on the map' });
    await expect(mapSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    // Finishing without a state or province is explained, not sent.
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Choose your country.')).toBeVisible();
    await chooseOption(page, 'Country', 'Canada');
    await chooseOption(page, 'State or province', 'Ontario');
    await page.getByLabel('City (optional)').fill('Ottawa');

    await mapSwitch.click();
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page).toHaveURL(/:\d+\/(\?region=[a-z-]+(&game=[a-z-]+)?)?$/, { timeout: 20_000 });
    await expect(page.getByText('Welcome to OrenjiTrade! Your profile is ready.')).toBeVisible();

    // --- Account menu shows the new identity; sign out ---------------------------------------
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-name')).toHaveText('E2E Newbie');
    await expect(page.getByTestId('account-menu-handle')).toHaveText(`@${handle}`);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByText('You are signed out. See you soon!')).toBeVisible();

    // Signed out, the top bar has "Sign in" instead of the bell and the avatar (spec 4.3).
    await expect(page.getByTestId('top-bar-sign-in')).toHaveAttribute(
      'href',
      /^\/auth\/sign-in\?returnUrl=%2F/,
    );
    await expect(page.getByTestId('account-menu-trigger')).toHaveCount(0);

    // --- Sign in again as the seed collector: an existing account confirms its age first, on
    // Review our terms (an account state, the phone's R12), never in the welcome ---------------
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    await expect(page).toHaveURL(/\/auth\/consent/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Review our terms' })).toBeVisible();
    await expect(
      page.getByText('Please confirm your age to keep using OrenjiTrade.'),
    ).toBeVisible();
    await expect(page.getByLabel('Handle')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' }).check();
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page).toHaveURL(/:\d+\/(\?region=[a-z-]+(&game=[a-z-]+)?)?$/, { timeout: 20_000 });
    await expect(page.getByText('Thanks for confirming. Welcome back!')).toBeVisible();
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-name')).toHaveText('Maïka Tremblay');
    await expect(page.getByTestId('account-menu-handle')).toHaveText('@collector1');
    await expect(page.getByRole('menuitem', { name: 'Admin console' })).toHaveCount(0);
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
    await expect(
      page.getByRole('link', { name: 'Read the Privacy Policy, opens in a new tab' }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    // The consent page also collects the 18+ confirmation (Google sign-ups never see sign-up).
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Accept every document and confirm your age to continue.',
    );
    await page.getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' }).check();
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
    await expect(page).toHaveURL(/\/auth\/consent\?returnUrl=(%2F|\/)settings(%2F|\/)privacy/, {
      timeout: 20_000,
    });
    await page.getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' }).check();
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page).toHaveURL(/\/settings\/privacy$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Visibility' })).toBeVisible();
  });

  test('Sign in is a page of its own: "Not now, keep browsing" goes back, the reset panel too', async ({
    page,
  }) => {
    await page.goto('/search?tab=binders');
    await page.getByTestId('top-bar-sign-in').click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    // The split page of board W27, without the rail or the top bar.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByTestId('top-bar-sign-in')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to OrenjiTrade' }),
    ).toBeAttached();
    await expect(
      page.getByText(
        'Find collectors in your region who own, trade or want the cards you care about.',
      ),
    ).toBeVisible();
    await expect(page.getByTestId('auth-art')).toContainText('Who in my region has this card?');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Reset your password' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await page.getByRole('link', { name: 'Not now, keep browsing' }).click();
    await expect(page).toHaveURL(/\/search\?tab=binders/);
    // Below 960 the form only.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/auth/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByTestId('auth-art')).toHaveCount(0);
  });

  test('the account states: suspended with its end, and "We could not load your account"', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    const collector = await createOnboardedCollector(request, 'state');
    const superAdmin = await emulatorSignIn(request, 'superadmin@orenjitrade.test', SEED_PASSWORD);
    const until = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const suspended = await request.post(`${API_URL}/api/v1/admin/users/${collector.id}/suspend`, {
      headers: authHeader(superAdmin),
      data: { reason: 'E2E: fictional suspension', until },
    });
    expect(suspended.ok(), 'suspend the E2E collector').toBeTruthy();
    try {
      // Owner decision of 2026-10-28: the login stays on; the account state says why.
      await signInThroughUi(page, collector.email, collector.password);
      await expect(page).toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });
      await expect(
        page.getByRole('heading', { level: 1, name: 'Your account is suspended' }),
      ).toBeVisible();
      await expect(page.getByTestId('suspension-end')).toContainText('The suspension ends on');
      await expect(
        page.getByRole('link', { name: 'Community guidelines', exact: true }),
      ).toBeVisible();
    } finally {
      await request.post(`${API_URL}/api/v1/admin/users/${collector.id}/unsuspend`, {
        headers: authHeader(superAdmin),
      });
    }

    // GET /me fails right after a sign-in: the account state with Try again.
    const other = await createOnboardedCollector(request, 'unload');
    const context = await browser.newContext();
    const fresh = await context.newPage();
    try {
      let failing = true;
      await fresh.route('**/api/v1/me', (route) =>
        failing ? route.fulfill({ status: 503, body: '' }) : route.continue(),
      );
      await fresh.goto('/auth/sign-in?returnUrl=%2Fsettings%2Fprivacy');
      await fresh.getByLabel('Email').fill(other.email);
      await fresh.getByLabel('Password', { exact: true }).fill(other.password);
      await fresh.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(fresh).toHaveURL(/\/auth\/unavailable/, { timeout: 20_000 });
      await expect(
        fresh.getByRole('heading', { level: 1, name: 'We could not load your account' }),
      ).toBeVisible();
      failing = false;
      await fresh.getByRole('button', { name: 'Try again' }).click();
      await expect(fresh).toHaveURL(/\/settings\/privacy$/, { timeout: 20_000 });
    } finally {
      await context.close();
    }
  });

  test('the reset-password page confirms without revealing accounts', async ({ page }) => {
    await page.goto('/auth/reset-password');
    await page.getByLabel('Email').fill(uniqueEmail('reset'));
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists for');
  });
});
