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
 * Profile tab and Settings → Profile against the real stack: view, validation, edit, tags and the
 * public preview (`GET /collectors/{handle}`).
 */
test.describe('mobile profile', () => {
  requireStack();

  test('a collector edits the profile, saves tags and opens the public preview', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const collector = await createOnboardedCollector(request, 'edit', 'Mobile Editor');
    await signInThroughUi(page, collector.email, collector.password);

    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-name')).toHaveText('Mobile Editor', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('profile-handle-label')).toHaveText(`@${collector.handle}`);
    await expect(profile.getByTestId('profile-bio-text')).toHaveText(
      'Fictional mobile E2E collector.'
    );
    await expect(profile.getByTestId('profile-area')).toHaveText('No trading area yet.');
    await expect(profile.getByTestId('profile-visibility')).toHaveText('Hidden from the map.');

    await profile.getByRole('button', { name: 'Edit profile' }).click();
    const editor = screen(page, 'settings-profile');
    const save = editor.getByRole('button', { name: 'Save details' });
    await expect(editor.getByLabel('Display name')).toHaveValue('Mobile Editor', {
      timeout: 30_000,
    });
    // Nothing changed yet: saving is disabled.
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // Client validation.
    await editor.getByLabel('Display name').fill('');
    await editor.getByLabel('Handle').fill('ab');
    await save.click();
    await expect(editor.getByText('Enter a display name.')).toBeVisible();
    await expect(editor.getByText('Use at least 3 characters.')).toBeVisible();

    // Server validation: a taken handle.
    await editor.getByLabel('Handle').fill('collector2');
    await editor.getByLabel('Display name').fill('Mobile Editor Renamed');
    await save.click();
    await expect(editor.getByText('That handle is already taken. Try another one.')).toBeVisible();

    await editor.getByLabel('Handle').fill(collector.handle);
    await editor.getByLabel('Bio').fill('Updated from the mobile app.');
    await editor.getByRole('checkbox', { name: 'Yu-Gi-Oh!' }).click();
    await save.click();
    await expect(snackbar(page)).toHaveText('Profile saved.', { timeout: 30_000 });
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // Tags: one curated suggestion.
    const addTag = editor.getByRole('button', { name: /^Add tag / }).first();
    await expect(addTag).toBeVisible({ timeout: 30_000 });
    await addTag.click();
    await expect(editor.getByTestId('tag-count')).toHaveText('1 / 12');
    await editor.getByRole('button', { name: 'Save tags' }).click();
    await expect(snackbar(page)).toHaveText('Tags saved.', { timeout: 30_000 });

    // The API holds the change.
    const me = await request.get(`${API_URL}/api/v1/me/profile`, {
      headers: authHeader(collector.idToken),
    });
    expect(me.ok()).toBeTruthy();
    const body = (await me.json()) as {
      displayName: string;
      bio: string;
      games: string[];
      tags: unknown[];
    };
    expect(body.displayName).toBe('Mobile Editor Renamed');
    expect(body.bio).toBe('Updated from the mobile app.');
    expect(body.games).toEqual(expect.arrayContaining(['pokemon', 'yugioh']));
    expect(body.tags).toHaveLength(1);

    // Back on the Profile tab, then the public preview.
    await page.goBack();
    const updated = screen(page, 'profile');
    await expect(updated.getByTestId('profile-name')).toHaveText('Mobile Editor Renamed', {
      timeout: 30_000,
    });
    await expect(updated.getByTestId('profile-bio-text')).toHaveText(
      'Updated from the mobile app.'
    );
    await updated.getByRole('button', { name: 'Public preview' }).click();
    const preview = screen(page, 'collector');
    await expect(preview.getByTestId('public-preview-banner')).toBeVisible({ timeout: 30_000 });
    await expect(preview.getByTestId('collector-name')).toHaveText('Mobile Editor Renamed');
    await expect(preview.getByTestId('collector-location')).toHaveText('Not on the map');
  });
});
