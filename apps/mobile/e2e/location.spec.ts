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
 * Settings → Location and discoverability (ADR 0004): a manual trading area chosen from the same
 * city presets the web uses, the opt-in to the map (off by default), the public label, and no
 * precise coordinate in any answer (the `privacy` fixture scans every API response).
 */
test.describe('mobile location and discoverability', () => {
  requireStack();

  test('a collector sets a manual trading area and opts into the map', async ({
    page,
    request,
    privacy,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'area', 'Mobile Mapper');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-visibility')).toHaveText('Hidden from the map.', {
      timeout: 30_000,
    });
    await profile.getByRole('link', { name: 'Location and discoverability' }).click();

    const settings = screen(page, 'settings-location');
    await expect(settings.getByTestId('area-public-label')).toHaveText(
      'No trading area saved yet.',
      {
        timeout: 30_000,
      }
    );
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'You have no trading area yet'
    );
    const discoverable = settings.getByRole('switch', { name: 'Show me on the map' });
    await expect(discoverable).toHaveAttribute('aria-checked', 'false');

    // A manual area: a public city centre and a wider radius.
    await settings.getByRole('radio', { name: 'Québec' }).click();
    await expect(settings.getByRole('radio', { name: 'Québec' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await settings.getByRole('button', { name: 'Increase trading radius' }).click();
    await expect(settings.getByTestId('area-radius-value')).toHaveText('6 km');
    await settings.getByRole('button', { name: 'Save trading area' }).click();
    await expect(snackbar(page)).toContainText('Trading area saved', { timeout: 30_000 });
    await expect(settings.getByTestId('area-public-label')).toContainText('6 km radius');
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'You are hidden from the map.'
    );

    // Opt in.
    await discoverable.click();
    await expect(snackbar(page)).toHaveText('You now appear on the map.', { timeout: 30_000 });
    await expect(discoverable).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByTestId('location-visibility')).toContainText(
      'Collectors see you near'
    );

    // The API agrees, and only ever exposes an approximate, 3-decimal public point.
    const location = await request.get(`${API_URL}/api/v1/me/location`, {
      headers: authHeader(collector.idToken),
    });
    expect(location.ok()).toBeTruthy();
    const body = (await location.json()) as {
      discoverable: boolean;
      tradingArea?: { radiusKm: number; source: string; label?: string };
    };
    expect(body.discoverable).toBe(true);
    expect(body.tradingArea).toMatchObject({ radiusKm: 6, source: 'MANUAL' });
    privacy.scan(`${API_URL}/api/v1/me/location`, body);

    const publicProfile = await request.get(`${API_URL}/api/v1/collectors/${collector.handle}`, {
      headers: authHeader(collector.idToken),
    });
    const publicBody = (await publicProfile.json()) as { location?: { publicLabel?: string } };
    expect(publicBody.location?.publicLabel).toBeTruthy();
    privacy.scan(`${API_URL}/api/v1/collectors/${collector.handle}`, publicBody);

    // The profile tab reflects it; then opting out again hides the collector.
    await page.goBack();
    const refreshed = screen(page, 'profile');
    await expect(refreshed.getByTestId('profile-visibility')).toHaveText(
      'Visible on the map at an approximate position.',
      { timeout: 30_000 }
    );
    await expect(refreshed.getByTestId('profile-area')).toContainText('6 km radius');
    await expect(refreshed.getByText(/\d+\.\d{4,}/)).toHaveCount(0);

    await refreshed.getByRole('button', { name: 'Public preview' }).click();
    await expect(screen(page, 'collector').getByTestId('collector-location')).toHaveText(
      `Near ${publicBody.location?.publicLabel ?? ''}`,
      { timeout: 30_000 }
    );
    await page.goBack();

    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings')
      .getByRole('link', { name: 'Location and discoverability' })
      .click();
    const again = screen(page, 'settings-location');
    await again.getByRole('switch', { name: 'Show me on the map' }).click();
    await expect(snackbar(page)).toHaveText('You are hidden from the map.', { timeout: 30_000 });
    expect(privacy.responses).toBeGreaterThan(0);
  });
});
