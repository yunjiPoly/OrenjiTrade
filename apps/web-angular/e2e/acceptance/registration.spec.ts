import {
  TEST_PASSWORD,
  emulatorSignIn,
  openAccountMenu,
  requireStack,
  uniqueEmail,
  uniqueHandle,
  verifyEmailInEmulator,
} from '../support/stack';
import { expect, signIn, test } from './support/fixtures';

/**
 * Acceptance — registration (spec § 50): a visitor registers with the required legal consents,
 * verifies the email address (Auth emulator out-of-band code), creates the collector profile,
 * chooses interests and an approximate trading area on the Leaflet map, signs out and signs in
 * again straight into the app. The chosen centre is registered with the privacy scanner once
 * the server stored it: afterwards no answer other than the owner's own `/me/location` may carry it.
 */
test.describe('acceptance: registration', () => {
  requireStack();

  test('register, verify, create the profile, set an approximate area, sign in again', async ({
    page,
    request,
    api,
    privacy,
  }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail('acc-register');
    const handle = uniqueHandle('acc_reg');
    const displayName = `Acceptance Newcomer ${handle.slice(-5)}`;

    // --- Register ------------------------------------------------------------------------------
    await page.goto('/auth/sign-up');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Please accept every document to continue.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    // The 18+ confirmation is a separate, explicit statement that "Accept all" never ticks.
    await expect(
      page.getByText('You must confirm that you are 18 years of age or older to use OrenjiTrade.'),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /I confirm I am 18 years of age or older/ }).check();
    await page.getByRole('button', { name: 'Create account' }).click();

    // --- Verify the email ------------------------------------------------------------------------
    await expect(page).toHaveURL(/\/auth\/verify-email/, { timeout: 20_000 });
    await expect(page.getByText(email)).toBeVisible();
    await verifyEmailInEmulator(request, email);
    await page.getByRole('button', { name: 'I have verified my email' }).click();

    // --- Create the profile ------------------------------------------------------------------------
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await page.getByLabel('Handle').fill(handle);
    await page.getByLabel('Display name').fill(displayName);
    await page.getByLabel('Bio').fill('Fictional collector registered by the acceptance suite.');
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.filter({ visible: true }).click();

    await expect(page.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    const pokemon = page
      .getByRole('group', { name: 'Games you collect or play' })
      .getByRole('button', { name: 'Pokémon' });
    await pokemon.click();
    await expect(pokemon).toHaveAttribute('aria-pressed', 'true');
    await next.filter({ visible: true }).click();

    // --- Approximate trading area on the map -----------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Where do you trade?' })).toBeVisible();
    const map = page.getByTestId('trading-area-map');
    await expect(map.locator('.leaflet-container, .leaflet-pane').first()).toBeAttached({
      timeout: 20_000,
    });
    const pin = page.locator('.orenji-map-pin--centre');
    await expect(pin).toBeVisible();
    const before = await pin.boundingBox();
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    await map.click({ position: { x: box!.width * 0.62, y: box!.height * 0.41 } });
    await expect.poll(async () => (await pin.boundingBox())?.x).not.toBe(before?.x);
    const slider = page.getByRole('slider', { name: 'Trading radius' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('output').filter({ hasText: 'km' })).toContainText('6 km');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/map$/, { timeout: 20_000 });
    await expect(page.getByText('Welcome to OrenjiTrade! Your profile is ready.')).toBeVisible();

    // The server stored the centre (3 decimals) and derived a public label for it.
    const token = await emulatorSignIn(request, email, TEST_PASSWORD);
    const location = await api.ok<{
      discoverable: boolean;
      publicPoint: unknown;
      tradingArea: { lat: number; lng: number; radiusKm: number; label: string | null };
    }>('GET', '/api/v1/me/location', { token });
    expect(location.tradingArea.radiusKm).toBe(6);
    expect(location.discoverable).toBe(false);
    expect(location.publicPoint ?? null).toBeNull();
    privacy.registerCentre(`@${handle}`, location.tradingArea);
    const label = location.tradingArea.label ?? '';
    expect(label).not.toBe('');

    // --- Sign out, then sign in again: straight into the app ---------------------------------
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-name')).toHaveText(displayName);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByText('You are signed out. See you soon!')).toBeVisible();

    await signIn(page, { email, password: TEST_PASSWORD });
    await expect(page).toHaveURL(/\/map$/);
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-handle')).toHaveText(`@${handle}`);
    await page.keyboard.press('Escape');

    // The trading-area settings show the approximate public label, never coordinates.
    await page.goto('/settings/trading-area');
    await expect(page.getByTestId('area-public-label')).toHaveText(label);
    await page.goto(`/collectors/${handle}`);
    await expect(page.getByRole('heading', { level: 1, name: displayName })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Games' })).toContainText('Pokémon');
  });
});
