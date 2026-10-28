import { Page, expect, test } from '@playwright/test';
import {
  OnboardedCollector,
  createOnboardedCollector,
  forbidMapProviders,
  openAccountMenu,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * The shell of the web redesign (stage WA, spec 4; boards W1, W3, W28, W29 and W30): the five
 * areas from the rail and the tab bar at 1440, 1024 and 390, the region and game popovers by
 * keyboard, the top bar's search with "/" and Ctrl/Cmd+K and its recent searches, the account
 * menu, the "?" dialog and its off switch, the skip links, the session banner, the theme that
 * follows the system, and every old link of spec 4.11.
 */
test.describe('the web redesign shell (WA)', () => {
  requireStack();

  let collector: OnboardedCollector;

  test.beforeAll(async ({ request }) => {
    collector = await createOnboardedCollector(request, 'shell', {
      location: true,
      displayName: 'Sam Shell',
    });
  });

  /**
   * Takes the focus out of any field so a single-key shortcut fires. A click at a fixed body
   * position could land on a rail item once the window has scrolled (it once opened /profile).
   */
  async function blurFocus(page: Page): Promise<void> {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  async function signedIn(page: Page): Promise<void> {
    await forbidMapProviders(page);
    await stubCardImages(page);
    await signInThroughUi(page, collector.email, collector.password);
  }

  const AREAS: [string, RegExp][] = [
    ['Home', /:\d+\/(\?region=[a-z-]+)?$/],
    ['Search', /\/search$/],
    ['Inventory', /\/inventory$/],
    ['Messages', /\/messages$/],
    ['Profile', /\/profile$/],
  ];

  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`moves through the five areas at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await signedIn(page);
      const nav = page.getByRole('navigation', { name: 'Main' });
      // At 960 and wider the rail, below it the phone's tab bar (spec 3 and 16).
      await expect(page.getByTestId(width >= 960 ? 'rail-home' : 'tab-home')).toBeVisible();
      for (const [label, url] of AREAS) {
        await nav.getByRole('link', { name: new RegExp(`^${label}`) }).click();
        await expect(page).toHaveURL(url);
        await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
      // The profile is your own collector page.
      await expect(page.getByRole('heading', { level: 1, name: 'Sam Shell' })).toBeVisible();
      // No horizontal page scroll (spec 3).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('the region and game popovers work from the keyboard', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');
    const region = page.getByTestId('region-pill');
    await region.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Choose a region' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /^Americas \(North\)/ })).toBeFocused();
    await expect(dialog.getByRole('radio', { name: /^Americas \(North\)/ })).toHaveAccessibleName(
      /Your region/,
    );
    // Tab and Shift+Tab stay in the popover while it is open (it has a backdrop).
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('radio', { name: /^Americas \(North\)/ }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('radio', { name: /^Europe/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(region).toBeFocused();
    await expect(region).toContainText('Europe');
    await expect(page).toHaveURL(/region=europe/);
    // Browsing away: the way back, from the popover.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('region-away')).toContainText('Not your region.');
    await page.getByRole('button', { name: 'Back to Americas (North)' }).click();
    await expect(region).toContainText('Americas (North)');

    const game = page.getByTestId('game-pill');
    await game.focus();
    await page.keyboard.press('Enter');
    const games = page.getByRole('dialog', { name: 'Choose a game' });
    await expect(games.getByRole('radio', { name: /^Yu-Gi-Oh!/ })).toBeFocused();
    await expect(
      games.getByRole('radio', { name: 'One Piece, Cards coming soon' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(games).toBeHidden();
    await expect(game).toBeFocused();
  });

  test('the top bar search: "/", Ctrl+K, cards, recent searches on and off', async ({ page }) => {
    await signedIn(page);
    await page.goto('/search');
    // "/" on Search focuses the page's own search (the top bar hides its own there).
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await blurFocus(page);
    await page.keyboard.press('/');
    await expect(
      page.getByRole('combobox', { name: 'Search cards, collectors and binders' }),
    ).toBeFocused();
    await expect(page.locator('#global-search-input')).toHaveCount(0);
    // Ctrl/Cmd+K on a page without its own search: the top bar's.
    await page.goto('/legal');
    // The deferred search chunk has replaced the early field.
    await expect(page.locator('#global-search-input:not(.bar__placeholder-input)')).toHaveCount(1);
    await blurFocus(page);
    await page.keyboard.press('ControlOrMeta+k');
    const field = page.getByRole('combobox', { name: 'Search Yu-Gi-Oh! cards or collectors' });
    await expect(field).toBeFocused();
    await field.fill('lantern');
    const option = page.getByRole('option', { name: /Lantern Fox Spirit/ }).first();
    await expect(option).toBeVisible();
    await expect(
      page.getByRole('option', { name: /Search binders and deck cores for ‘lantern’/ }),
    ).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}/);
    // The text is remembered in this browser only, and listed on the next visit of the field.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('button', { name: 'lantern', exact: true })).toBeVisible();
    await expect(page.getByTestId('global-search-panel')).toContainText(
      'Only you see your searches. They’re kept in this browser.',
    );
    // Settings › Privacy › "Remember my searches" off clears them and stops them.
    await page.goto('/settings/privacy');
    await page.getByRole('switch', { name: 'Remember my searches' }).click();
    await expect(page.getByRole('switch', { name: 'Remember my searches' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByTestId('global-search-panel')).toContainText(
      'Your searches are not remembered in this browser.',
    );
    await expect(page.getByRole('button', { name: 'lantern', exact: true })).toHaveCount(0);
  });

  test('the account menu, the "?" dialog and its off switch in Settings › Appearance', async ({
    page,
  }) => {
    await signedIn(page);
    await page.goto('/');
    await openAccountMenu(page);
    for (const name of [
      'View my profile',
      'Settings',
      'Appearance',
      'Keyboard shortcuts',
      'Trading safely',
      'Sign out',
    ]) {
      await expect(page.getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    for (const name of ['Offers', 'Trades', 'Payouts']) {
      await expect(page.getByRole('menuitem', { name })).toHaveCount(0);
    }
    await page.getByRole('menuitem', { name: /^Appearance/ }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: /^Appearance/ }).click();
    await page.getByRole('menuitemradio', { name: 'Same as the system' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

    // The menus have closed (a single key never fires over an open menu).
    await expect(page.getByRole('menu')).toHaveCount(0);
    await blurFocus(page);
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('Go to Home, Search, Inventory, Messages or Profile');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    // "g" then "i" goes to Inventory.
    await page.keyboard.press('g');
    await page.keyboard.press('i');
    await expect(page).toHaveURL(/\/inventory$/);

    await page.goto('/settings/appearance');
    await page.getByRole('switch', { name: 'Single-key shortcuts' }).click();
    await expect(page.getByText('Off. Ctrl/Cmd+K still opens the search')).toBeVisible();
    await blurFocus(page);
    await page.keyboard.press('?');
    await page.keyboard.press('g');
    await page.keyboard.press('h');
    await expect(help).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings\/appearance$/);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('combobox', { name: /^Search Yu-Gi-Oh! cards/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: 'Single-key shortcuts' }).click();
    await expect(page.getByRole('switch', { name: 'Single-key shortcuts' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('the skip links come first, "Skip the map" on the map', async ({ page }) => {
    await forbidMapProviders(page);
    await page.goto('/');
    await expect(page.getByTestId('boundary-map')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Tab');
    const skipMap = page.getByRole('link', { name: 'Skip the map' });
    await expect(skipMap).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#map-list')).toBeFocused();
  });

  test('the session banner says the account could not load, and "Try again" works', async ({
    page,
  }) => {
    await forbidMapProviders(page);
    let failing = false;
    await page.route('**/api/v1/me', (route) =>
      failing ? route.fulfill({ status: 503, body: '' }) : route.continue(),
    );
    await signInThroughUi(page, collector.email, collector.password);
    failing = true;
    await page.reload();
    const banner = page.getByTestId('session-banner');
    await expect(banner).toContainText('We could not load your account.');
    failing = false;
    await banner.getByRole('button', { name: 'Try again' }).click();
    await expect(banner).toBeHidden();
  });

  test('the theme follows the system by default (decision 12)', async ({ browser }) => {
    for (const [scheme, background] of [
      ['dark', 'rgb(20, 18, 16)'],
      ['light', 'rgb(255, 251, 247)'],
    ] as const) {
      const context = await browser.newContext({ colorScheme: scheme });
      const page = await context.newPage();
      await forbidMapProviders(page);
      await page.goto('/legal');
      await expect(page.locator('body')).toHaveCSS('background-color', background);
      await context.close();
    }
  });

  test('the rail starts at exactly 960 px, the tab bar below (spec 3)', async ({ page }) => {
    await signedIn(page);
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto('/inventory');
    await expect(page.getByTestId('rail-home')).toBeVisible();
    await expect(page.getByTestId('tab-home')).toHaveCount(0);
    await page.setViewportSize({ width: 959, height: 800 });
    await expect(page.getByTestId('tab-home')).toBeVisible();
    await expect(page.getByTestId('rail-home')).toHaveCount(0);
  });

  test('card art is never wider than 160 CSS px, even at 1920 (ADR 0015, spec 2.5)', async ({
    page,
  }) => {
    await signedIn(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const widest = () =>
      page.evaluate(() =>
        Math.max(
          0,
          ...Array.from(
            document.querySelectorAll('app-card-image'),
            (node) => node.getBoundingClientRect().width,
          ),
        ),
      );
    for (const url of ['/search?q=lantern', '/cards']) {
      await page.goto(url);
      await expect(page.locator('app-card-image').first()).toBeVisible();
      expect(await widest(), url).toBeGreaterThan(0);
      expect(await widest(), url).toBeLessThanOrEqual(160);
    }
    // The card page's hero, the largest picture of the web.
    await page.locator('main a[href^="/cards/"]').first().click();
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}/);
    await expect(page.locator('app-card-image').first()).toBeVisible();
    expect(await widest()).toBeLessThanOrEqual(160);
  });

  test('no sideways page scroll at 360 (Appearance) and 320 (Legal)', async ({ page }) => {
    await signedIn(page);
    const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/settings/appearance');
    await expect(page.getByRole('radio', { name: /Same as the system/ })).toBeVisible();
    expect(await scrollWidth()).toBeLessThanOrEqual(360);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/legal');
    await expect(page.getByRole('link', { name: /Terms of Service/ }).first()).toBeVisible();
    expect(await scrollWidth()).toBeLessThanOrEqual(320);
  });

  test('old links land where the spec says (4.11), offers with the toast', async ({ page }) => {
    await signedIn(page);
    const cases: [string, RegExp][] = [
      [
        '/map?region=europe&subdivision=FR-IDF',
        /\/search\?tab=binders&region=europe&state=FR-IDF$/,
      ],
      ['/cards?q=Lantern', /\/search\?tab=cards&q=Lantern$/],
      ['/wishlist', /\/search\?tab=wishlist$/],
      ['/wishlist/w-1', /\/search\?tab=wishlist$/],
      ['/community', /\/messages(\?tab=community|\/community\/[\w-]+)$/],
      ['/community/looking-for', /\/messages(\?tab=community|\/community\/[\w-]+)$/],
      ['/settings/offers', /\/settings\/profile$/],
      ['/settings/payouts', /\/settings\/profile$/],
      ['/settings/trading-area', /\/settings\/location$/],
    ];
    for (const [from, to] of cases) {
      await page.goto(from);
      await expect(page, from).toHaveURL(to);
    }
    for (const from of ['/offers', '/offers/o-1', '/trades/t-1']) {
      await page.goto(from);
      await expect(page).toHaveURL(/\/messages$/);
      await expect(
        page.getByText('Offers are no longer available. Deals happen in the chat.').first(),
      ).toBeVisible();
    }
    for (const from of ['/checkout/fake/ref-1', '/disputes/d-1']) {
      await page.goto(from);
      await expect(page.getByTestId('payments-notice')).toHaveText(
        "Payments and disputes aren't part of OrenjiTrade. Deals happen in the chat, and the buyer pays by e-Transfer outside the app.",
      );
      await page.getByRole('link', { name: 'Go to Messages' }).click();
      await expect(page).toHaveURL(/\/messages$/);
    }
    // The Messages header has no Offers or Trades links any more (spec 20).
    await expect(
      page.getByRole('main').getByRole('link', { name: /^(Offers|Trades)$/ }),
    ).toHaveCount(0);
  });
});
