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
 * Profile tab and Edit profile against the real stack: view, validation, edit, the tags saved with
 * the rest by one "Save changes" (stage R13), and the public profile read again.
 */
test.describe('mobile profile', () => {
  requireStack();

  test('a collector edits the profile and its tags and saves them once', async ({
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
    await expect(profile.getByTestId('profile-line')).toHaveText(
      /^Not on the map · Member since \d{4}$/
    );

    await profile.getByRole('button', { name: 'Edit profile' }).click();
    const editor = screen(page, 'settings-profile');
    // Stage R13: one "Save changes" for the whole page, "No changes yet" while nothing changed.
    const save = editor.getByTestId('profile-save');
    await expect(editor.getByLabel('Display name')).toHaveValue('Mobile Editor', {
      timeout: 30_000,
    });
    await expect(save).toHaveText('No changes yet');
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

    // Tags: "Add a tag" opens the suggestions; one curated tag, saved with the rest.
    await editor.getByRole('button', { name: 'Add a tag' }).click();
    const suggestion = page.getByTestId(/^tag-suggestion-/).first();
    await expect(suggestion).toBeVisible({ timeout: 30_000 });
    await suggestion.click();
    await expect(page.getByTestId('tag-count')).toHaveText('1 / 12');
    await page.getByTestId('profile-tag-sheet-done').click();
    const put = page.waitForRequest(
      (candidate) => candidate.method() === 'PUT' && candidate.url().endsWith('/api/v1/me/profile')
    );
    await expect(save).toHaveText('Save changes');
    await save.click();
    const sent = (await put).postDataJSON() as { tags?: { tagIds: string[] } };
    expect(sent.tags?.tagIds).toHaveLength(1);
    await expect(snackbar(page)).toContainText('Profile saved.', { timeout: 30_000 });
    await expect(save).toHaveText('No changes yet');
    await expect(save).toHaveAttribute('aria-disabled', 'true');

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

    // Back on the Profile tab: your page as others see it, read again (stage R6).
    await page.goBack();
    const updated = screen(page, 'profile');
    await expect(updated.getByTestId('profile-name')).toHaveText('Mobile Editor Renamed', {
      timeout: 30_000,
    });
    await expect(updated.getByTestId('profile-bio-text')).toHaveText(
      'Updated from the mobile app.'
    );
    await expect(updated.getByTestId('profile-chips')).toContainText('Pokémon');
  });
});
