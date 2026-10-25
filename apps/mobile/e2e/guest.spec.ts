import { expect, test } from './support/fixtures';
import {
  API_URL,
  PLACES,
  SEED_PASSWORD,
  apiListItem,
  apiPublicBinder,
  cardOfPrinting,
  createOnboardedCollector,
  openInApp,
  openTab,
  requireStack,
  screen,
  snackbar,
} from './support/stack';

/**
 * Browsing without an account (stage R15) against the real, isolated stack: the app opens on Home
 * as a guest; the API's feed answers a signed-out caller without who posted (the place kept); the
 * member-only tabs show their page in place; Sign in's close button goes back; a deep link to a
 * member screen opens Sign in and continues to it after.
 */

test.describe('browsing without an account', () => {
  requireStack();

  test('Home and the member-only tabs as a guest, and Sign in closes back', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    const home = screen(page, 'home');
    await expect(home.getByTestId('home-guest-card')).toBeVisible({ timeout: 30_000 });
    await expect(home.getByText('You’re browsing as a guest')).toBeVisible();
    await expect(page.getByTestId('person-button-home')).toHaveAccessibleName('Sign in');
    await expect(page.getByTestId('notification-bell-home')).toHaveCount(0);

    // The API agrees: the feed is open, and never says who posted.
    const feed = await request.get(`${API_URL}/api/v1/feed?game=yugioh&limit=50`);
    expect(feed.ok(), 'GET /feed signed out').toBeTruthy();
    const body = (await feed.json()) as {
      items: { collector: Record<string, unknown>; place: { label: string } }[];
    };
    for (const post of body.items) {
      expect(post.collector).toEqual({
        id: null,
        handle: null,
        displayName: null,
        avatarUrl: null,
      });
      expect(post.place.label).not.toBe('');
    }

    await openTab(page, 'Inventory');
    await expect(screen(page, 'inventory-guest').getByText('Your cards, in one place')).toBeVisible(
      {
        timeout: 30_000,
      }
    );
    await openTab(page, 'Messages');
    await expect(screen(page, 'messages-guest').getByText('Talk to collectors')).toBeVisible();
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile-guest');
    await expect(profile.getByText('Your collector profile')).toBeVisible();
    await profile.getByTestId('guest-profile-sign-in').click();
    await expect(screen(page, 'sign-in')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Not now, keep browsing' }).click();
    await expect(screen(page, 'sign-in')).toHaveCount(0, { timeout: 30_000 });
    await expect(screen(page, 'profile-guest').getByText('Your collector profile')).toBeVisible();
  });

  test('Message on a plain public binder asks to sign in, then opens the chat (review fix 1)', async ({
    page,
    request,
  }) => {
    // Only a deck core can be a chat's subject: the binder only names its owner, and the chat
    // opens with nothing pinned, as a member's Message there does (findings P2, U1, F2).
    test.setTimeout(150_000);
    const seller = await createOnboardedCollector(request, 'gbseller', 'Mobile Guest Seller', {
      location: PLACES.quebec,
      discoverable: true,
    });
    const buyer = await createOnboardedCollector(request, 'gbbuyer', 'Mobile Guest Buyer', {
      location: PLACES.ontario,
    });
    const { printingId } = await cardOfPrinting(request, seller.idToken, 'PFT-002');
    const binderId = await apiPublicBinder(request, seller, 'Guest plain binder');
    await apiListItem(request, seller, binderId, printingId, { askingPriceText: '$12' });

    await page.goto('/');
    await expect(page.getByTestId('person-button-home')).toBeVisible({ timeout: 30_000 });
    await openInApp(page, `/binders/${binderId}`);
    await page
      .getByTestId('public-binder-message')
      .filter({ visible: true })
      .click({ timeout: 30_000 });
    const sheet = page.getByTestId('sign-in-sheet').filter({ visible: true });
    await expect(sheet.getByTestId('sign-in-sheet-title')).toHaveText(
      'Sign in to message this collector'
    );
    await sheet.getByTestId('sign-in-sheet-sign-in').click();
    const form = screen(page, 'sign-in');
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByLabel('Email').fill(buyer.email);
    await form.getByLabel('Password', { exact: true }).fill(buyer.password);
    await form.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(screen(page, 'conversation')).toBeVisible({ timeout: 30_000 });
    await expect(snackbar(page)).not.toContainText('Check the highlighted fields');
  });

  test('a link to a member screen opens Sign in, then the screen', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByTestId('person-button-home')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      window.history.pushState(null, '', '/notifications');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    const form = screen(page, 'sign-in');
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByLabel('Email').fill('collector1@orenjitrade.test');
    await form.getByLabel('Password', { exact: true }).fill(SEED_PASSWORD);
    await form.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(screen(page, 'notifications')).toBeVisible({ timeout: 30_000 });
  });
});
