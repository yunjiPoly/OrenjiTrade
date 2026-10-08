import {
  TEST_PASSWORD,
  chooseOption,
  emulatorSignIn,
  openAccountMenu,
  requireStack,
  uniqueEmail,
  uniqueHandle,
  verifyEmailInEmulator,
} from '../support/stack';
import { expect, signIn, test } from './support/fixtures';
import { cityToken } from './support/places';

/**
 * Acceptance — registration (spec § 50): a visitor registers with the required legal consents,
 * verifies the email address (Auth emulator out-of-band code), creates the collector profile,
 * chooses interests and says where they are (region, country, state and an optional city with
 * simple pickers: no map, no GPS, ADR 0017), signs out and signs in again straight into the app,
 * in their home region. The city is registered with the privacy scanner: no answer other than the
 * owner's own profile and `/me/location` may carry it.
 */
test.describe('acceptance: registration', () => {
  requireStack();

  test('register, verify, create the profile, say where you are, sign in again', async ({
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

    // --- Where are you? -------------------------------------------------------------------------
    await expect(page.getByRole('heading', { name: 'Where are you?' })).toBeVisible();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    const city = cityToken();
    privacy.registerCity(handle, city);
    await chooseOption(page, 'Region', 'Europe');
    await chooseOption(page, 'Country', 'France');
    await chooseOption(page, 'State or province', 'Brittany');
    await page.getByLabel('City (optional)').fill(city);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/map(\?region=[a-z-]+)?$/, { timeout: 20_000 });
    await expect(page.getByText('Welcome to OrenjiTrade! Your profile is ready.')).toBeVisible();

    // The server stored the declared place (codes and the city text only, never a coordinate).
    const token = await emulatorSignIn(request, email, TEST_PASSWORD);
    const location = await api.ok<{
      discoverable: boolean;
      location: {
        regionCode: string;
        countryCode: string;
        subdivisionCode: string;
        label: string;
        city: string | null;
        showCity: boolean;
      };
    }>('GET', '/api/v1/me/location', { token });
    expect(location.discoverable).toBe(false);
    expect(location.location).toMatchObject({
      regionCode: 'europe',
      countryCode: 'FR',
      subdivisionCode: 'FR-BRE',
      label: 'Brittany, France',
      city,
      showCity: true,
    });
    const label = location.location.label;

    // --- Sign out, then sign in again: straight into the app ---------------------------------
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-name')).toHaveText(displayName);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByText('You are signed out. See you soon!')).toBeVisible();

    await signIn(page, { email, password: TEST_PASSWORD });
    await expect(page).toHaveURL(/\/map(\?region=[a-z-]+)?$/);
    // Signed in: the home region is browsed.
    await page.goto('/map');
    await expect(page).toHaveURL(/\/map\?region=europe$/);
    await expect(page.getByTestId('region-switcher')).toContainText('Europe');
    await openAccountMenu(page);
    await expect(page.getByTestId('account-menu-handle')).toHaveText(`@${handle}`);
    await page.keyboard.press('Escape');

    // The location settings show the public label, never coordinates.
    await page.goto('/settings/location');
    await expect(page.getByTestId('location-label')).toHaveText(new RegExp(label));
    // Not discoverable yet (the default): the profile shows no place at all.
    await page.goto(`/collectors/${handle}`);
    await expect(page.getByRole('heading', { level: 1, name: displayName })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Games' })).toContainText('Pokémon');
    await expect(page.getByRole('list', { name: 'Collector details' })).toContainText(
      'Not on the map',
    );
    await expect(page.getByTestId('collector-city')).toHaveCount(0);

    // Discoverable: the profile shows the state and, with "show my city" on, the city.
    await api.updatePrivacy(token, { discoverable: true });
    await page.reload();
    await expect(page.getByTestId('collector-public-label')).toContainText(label);
    await expect(page.getByTestId('collector-city')).toHaveText(city);
  });
});
