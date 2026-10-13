import { expect, test } from './support/fixtures';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Settings → Location and discoverability (ADR 0017): the collector says where they are with
 * pickers fed by `GET /regions` (region, country, state or province, an optional city and "show
 * my city on my profile"); no map, no GPS, no coordinate anywhere (the `privacy` fixture scans
 * every API answer for coordinate, radius and distance fields). The map opt-in is off by default
 * and needs a location; the public profile shows the state and, when shown, the city.
 */
test.describe('mobile location and discoverability', () => {
  requireStack();

  test('a collector declares a place with pickers and opts into the map', async ({
    page,
    request,
    privacy,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'area', 'Mobile Placer');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-area')).toHaveText('No location yet.', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('profile-visibility')).toHaveText('Hidden from the map.');
    await profile.getByRole('link', { name: 'Location and discoverability' }).click();

    const settings = screen(page, 'settings-location');
    await expect(settings.getByTestId('location-none')).toBeVisible({ timeout: 30_000 });
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'You have not chosen a location yet'
    );
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    const discoverable = settings.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');

    // Saving without a state says what is missing; nothing is sent.
    const save = settings.getByRole('button', { name: 'Save location' });
    await settings.getByTestId('location-country').click();
    await page.getByTestId('location-country-option-CA').click();
    await save.click();
    await expect(settings.getByTestId('location-missing')).toContainText(
      'Choose your state or province.'
    );

    // Another region lists its own countries; back to Canada, Ontario, a city shown on the profile.
    await settings.getByTestId('location-region').click();
    await page.getByTestId('location-region-option-europe').click();
    await settings.getByTestId('location-country').click();
    await expect(page.getByTestId('location-country-option-FR')).toBeVisible();
    await expect(page.getByTestId('location-country-option-CA')).toHaveCount(0);
    await page.getByTestId('location-country-option-FR').click();
    await settings.getByTestId('location-region').click();
    await page.getByTestId('location-region-option-americas-north').click();
    await settings.getByTestId('location-country').click();
    await page.getByTestId('location-country-option-CA').click();
    await settings.getByTestId('location-subdivision').click();
    await page.getByTestId('location-subdivision-option-CA-ON').click();
    await settings.getByLabel('City (optional)').fill('Ottawa');

    const put = page.waitForRequest(
      (candidate) => candidate.method() === 'PUT' && candidate.url().endsWith('/api/v1/me/location')
    );
    await save.click();
    const sent = (await put).postDataJSON() as Record<string, unknown>;
    expect(sent).toEqual({
      countryCode: 'CA',
      subdivisionCode: 'CA-ON',
      city: 'Ottawa',
      showCity: true,
    });
    await expect(snackbar(page)).toContainText('Location saved · Ontario, Canada.', {
      timeout: 30_000,
    });
    await expect(settings.getByTestId('location-label')).toHaveText(
      'Ontario, Canada · Americas (North)'
    );
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'You are hidden from the map.'
    );

    // Opt in.
    await discoverable.click();
    await expect(snackbar(page)).toHaveText('You now appear on the map.', { timeout: 30_000 });
    await expect(discoverable).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByTestId('location-visibility')).toHaveText(
      'Collectors see you in Ontario, Canada.'
    );

    // The API agrees: codes, names and the city only, never a coordinate.
    const location = await request.get(`${API_URL}/api/v1/me/location`, {
      headers: authHeader(collector.idToken),
    });
    expect(location.ok()).toBeTruthy();
    const body = (await location.json()) as {
      discoverable: boolean;
      location?: { subdivisionCode: string; label: string; city?: string | null };
    };
    expect(body.discoverable).toBe(true);
    expect(body.location).toMatchObject({
      subdivisionCode: 'CA-ON',
      label: 'Ontario, Canada',
      city: 'Ottawa',
    });
    privacy.scan(`${API_URL}/api/v1/me/location`, body);

    // The profile tab reflects it; the public preview shows the state and the shown city.
    await page.goBack();
    const refreshed = screen(page, 'profile');
    await expect(refreshed.getByTestId('profile-visibility')).toHaveText(
      'Visible on the map in Ontario, Canada.',
      { timeout: 30_000 }
    );
    await expect(refreshed.getByTestId('profile-area')).toHaveText('Ottawa, Ontario, Canada');
    await refreshed.getByRole('button', { name: 'Public preview' }).click();
    await expect(screen(page, 'collector').getByTestId('collector-location')).toHaveText(
      'Ottawa, Ontario, Canada',
      { timeout: 30_000 }
    );
    await page.goBack();

    // Opting out again hides the collector; removing the location clears it.
    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings')
      .getByRole('link', { name: 'Location and discoverability' })
      .click();
    const again = screen(page, 'settings-location');
    await again.getByRole('switch', { name: 'Show me on the map' }).click();
    await expect(snackbar(page)).toHaveText('You are hidden from the map.', { timeout: 30_000 });
    await again.getByRole('button', { name: 'Remove location' }).click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(snackbar(page)).toHaveText('Your location was removed.', { timeout: 30_000 });
    await expect(again.getByTestId('location-none')).toBeVisible();
    expect(privacy.responses).toBeGreaterThan(0);
  });
});
