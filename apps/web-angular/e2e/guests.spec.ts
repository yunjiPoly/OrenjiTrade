import { APIRequestContext, Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
} from './support/inventory';
import {
  OnboardedCollector,
  TEST_PASSWORD,
  createOnboardedCollector,
  emulatorSignUp,
  forbidMapProviders,
  requireStack,
  stubCardImages,
  uniqueEmail,
  uniqueHandle,
  verifyEmailInEmulator,
  chooseOption,
} from './support/stack';

/**
 * Web stage WG (spec 14, decision 4; boards W26 and W27) against the real local stack: a
 * signed-out visitor (a guest, the phone's R15) reads Home, Search (Cards and Binders), a card, its
 * set, a binder and a deck core with "A collector" and the province only: no handle, name, avatar
 * or rating in the page or in any answer of the API. Inventory, Messages and Profile show the
 * guest pages; Appearance and Legal open. Every action opens the sign-in dialog with its title, and
 * the action finishes after signing in, back on the page.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** The seed accounts' handles and names (`db/seed/users.json`): never shown to a guest. */
const SEED_PEOPLE = [
  'collector1',
  'collector2',
  'collector3',
  'collector4',
  'collector5',
  'collector6',
  'collector7',
  'collector8',
  'premium_user',
  'Maïka Tremblay',
  'Devon Okafor',
  'Priya Raman',
  'Lucas Bergeron',
  'Sofia Nguyen',
  'Ethan Walsh',
  'Amara Diallo',
  'Noah Kim',
  'Camille Roy',
];

interface Seller {
  collector: OnboardedCollector;
  cardId: string;
  cardName: string;
  setId: string;
  binder: { id: string; name: string };
  core: { id: string; name: string };
}

/**
 * A discoverable collector (Prince Edward Island) with a public Pokémon binder and deck core (one
 * card of the seed catalogue, SVX-001).
 */
async function createSeller(api: APIRequestContext): Promise<Seller> {
  const collector = await createOnboardedCollector(api, 'wgseller', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-PE' },
    displayName: `WG Seller ${suffix()}`,
  });
  await apiUpdatePrivacy(api, collector.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, collector.idToken, {
    name: `WG binder ${suffix()}`,
    kind: 'TRADE',
    description: 'Fictional binder for the WG E2E suite.',
  });
  // A Pokémon card: the suite's Yu-Gi-Oh! Home keeps its seed window under one page (home-we).
  const fox = await printingIdOf(api, collector.idToken, 'SVX-001');
  const item = (await apiCreateItem(api, collector.idToken, {
    printingId: fox,
    binderId: binder.id,
    availability: 'TRADE_OR_SALE',
    askingPrice: 20,
  })) as unknown as { card: { id: string; name: string }; printing: { setId: string } };
  await apiPublishBinder(api, collector.idToken, binder.id, 'UNTIL_DISABLED');
  const core = await apiCreateBinder(api, collector.idToken, {
    name: `WG core ${suffix()}`,
    kind: 'DECK',
    description: 'Fictional deck core for the WG E2E suite.',
    sellsAsCore: true,
    askingPriceText: '$80',
  });
  await apiCreateItem(api, collector.idToken, {
    printingId: fox,
    binderId: core.id,
    quantity: 3,
    availability: 'TRADE_OR_SALE',
  });
  await apiPublishBinder(api, collector.idToken, core.id, 'UNTIL_DISABLED');
  return {
    collector,
    cardId: item.card.id,
    cardName: item.card.name,
    setId: item.printing.setId,
    binder,
    core,
  };
}

/** Every write the page sends to the API (`POST /api/v1/conversations`, ...). */
function watchWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/') && request.method() !== 'GET') {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  return writes;
}

/** Every JSON body of the API the page reads (to look for who a collector is). */
function watchApi(page: Page): string[] {
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/v1/') || !response.ok()) {
      return;
    }
    if (!(response.headers()['content-type'] ?? '').includes('json')) {
      return;
    }
    try {
      bodies.push(await response.text());
    } catch {
      // A body already gone (navigation): nothing to read.
    }
  });
  return bodies;
}

/** Nobody's handle, name, id or avatar in the page, and no rating of anyone. */
async function expectNoOne(page: Page, people: readonly string[], bodies: readonly string[]) {
  const html = await page.locator('body').innerHTML();
  for (const who of people) {
    expect(html, `the page names ${who}`).not.toContain(who);
    for (const body of bodies) {
      expect(body, `an API answer names ${who}`).not.toContain(`"${who}"`);
    }
  }
  for (const body of bodies) {
    expect(body).not.toMatch(/"(ownerRating|rating)":\{/);
    expect(body).not.toMatch(/"avatarUrl":"/);
  }
}

test.describe('web stage WG: browsing without an account', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await forbidMapProviders(page);
    await stubCardImages(page);
  });

  test('a guest reads Home, Search, a card, its set, a binder and a deck core: places only', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const people = [
      ...SEED_PEOPLE,
      seller.collector.handle,
      seller.collector.displayName,
      seller.collector.id,
    ];
    const bodies = watchApi(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'What’s new' })).toBeVisible();
    await expect(page.getByTestId('home-guest-card')).toContainText('You’re browsing as a guest');
    await expect(page.getByTestId('feed-post').first()).toBeVisible();
    await expectNoOne(page, people, bodies);

    await page.goto('/search');
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeAttached();
    await page.goto('/search?tab=binders&state=CA-PE&game=pokemon');
    await expect(page.getByText(seller.binder.name)).toBeVisible();
    await expectNoOne(page, people, bodies);

    await page.goto(`/cards/${seller.cardId}`);
    await expect(page.getByRole('heading', { level: 1, name: seller.cardName })).toBeVisible();
    await expect(page.getByTestId('holder-row').first()).toContainText('A collector');
    await expectNoOne(page, people, bodies);

    await page.goto(`/sets/${seller.setId}`);
    await expect(page.getByRole('button', { name: /Add from this set/ })).toBeVisible();
    await expectNoOne(page, people, bodies);

    for (const binder of [seller.binder, seller.core]) {
      await page.goto(`/binders/${binder.id}`);
      await expect(page.getByRole('heading', { level: 1, name: binder.name })).toBeVisible();
      await expect(page.getByText('Prince Edward Island').first()).toBeVisible();
      await expectNoOne(page, people, bodies);
    }
    expect(bodies.length).toBeGreaterThan(5);
  });

  test('Inventory, Messages and Profile show the guest pages; Appearance and Legal open', async ({
    page,
  }) => {
    await page.goto('/inventory');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Your cards, in one place' }),
    ).toBeVisible();
    await page.goto('/messages/community/americas-north-yugioh');
    await expect(page.getByRole('heading', { level: 1, name: 'Talk to collectors' })).toBeVisible();
    // Signing in comes back to the room itself (WF leftover U13).
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveAttribute(
      'href',
      '/auth/sign-in?returnUrl=%2Fmessages%2Fcommunity%2Famericas-north-yugioh',
    );
    await page.goto('/profile');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Your collector profile' }),
    ).toBeVisible();
    // The guest page's own rows (the shell's footer has a Legal link too: WG review F1).
    const guestProfile = page.getByTestId('guest-page-profile');
    await guestProfile.getByRole('link', { name: /^Appearance/ }).click();
    await expect(page).toHaveURL(/\/settings\/appearance$/);
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: /Legal/ })).toBeVisible();
    await page.goto('/settings/privacy');
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=%2Fsettings%2Fprivacy/);
    await page.goto('/profile');
    await page
      .getByTestId('guest-page-profile')
      .getByRole('link', { name: /^Legal/ })
      .click();
    await expect(page).toHaveURL(/\/legal$/);
  });

  test('every action opens the sign-in dialog with its title; "Not now" closes it', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const expectDialog = async (title: string) => {
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('It’s free. When you’re done, you come right back here.');
      await expect(dialog.getByRole('button', { name: 'Create account' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Not now' }).click();
      await expect(dialog).toHaveCount(0);
    };

    await page.goto(`/cards/${seller.cardId}`);
    // Other specs list this card too: a holder of the seller's province.
    const row = page.getByTestId('holder-row').filter({ hasText: 'Prince Edward Island' }).first();
    await row.getByTestId('holder-message').click();
    const message = page.getByRole('dialog', { name: 'Sign in to message this collector' });
    await expect(message.getByTestId('sign-in-dialog-subject')).toContainText(
      'A collector · Prince Edward Island',
    );
    await expectDialog('Sign in to message this collector');
    await row.click();
    await expectDialog('Sign in to see collector profiles');
    await page
      .getByRole('button', { name: /wishlist/i })
      .first()
      .click();
    await expectDialog('Sign in to save your wishes');
    await page.getByRole('button', { name: 'I have this card' }).click();
    await expectDialog('Sign in to add your cards');

    await page.goto(`/binders/${seller.core.id}`);
    await page
      .getByRole('button', { name: /^Message this collector/ })
      .first()
      .click();
    await expectDialog('Sign in to message this collector');
    await page.getByTestId('owner-guest-profile').click();
    await expectDialog('Sign in to see collector profiles');

    await page.goto(`/sets/${seller.setId}`);
    await page.getByRole('button', { name: /Add from this set/ }).click();
    await expectDialog('Sign in to add your cards');

    await page.goto('/?kind=wanted');
    const have = page.getByTestId('feed-have-it').first();
    await have.click();
    await expectDialog('Sign in to tell them you have it');
    await expect(have).toBeFocused();
  });

  async function signInFromDialog(page: Page, title: string, viewer: OnboardedCollector) {
    const dialog = page.getByRole('dialog', { name: title });
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=/);
    await page.getByLabel('Email').fill(viewer.email);
    await page.getByLabel('Password', { exact: true }).fill(viewer.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }

  function createViewer(api: APIRequestContext): Promise<OnboardedCollector> {
    return createOnboardedCollector(api, 'wgviewer', {
      location: { countryCode: 'CA', subdivisionCode: 'CA-QC' },
    });
  }

  test('"Message" finishes after signing in: the chat drawer about the card', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    await page.goto(`/cards/${seller.cardId}`);
    await page
      .getByTestId('holder-row')
      .filter({ hasText: 'Prince Edward Island' })
      .first()
      .getByTestId('holder-message')
      .click();
    await signInFromDialog(page, 'Sign in to message this collector', viewer);
    await expect(page).toHaveURL(new RegExp(`/cards/${seller.cardId}`), { timeout: 20_000 });
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    // The holder the guest picked (a guest never knows who: every seller of the suite lists this
    // card in Prince Edward Island), about that card.
    await expect(drawer).toContainText('Prince Edward Island');
    await expect(drawer).toContainText(seller.cardName);
  });

  test('"I have this card" finishes after signing in: the Add drawer over the card page', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    await page.goto(`/cards/${seller.cardId}`);
    await page.getByRole('button', { name: 'I have this card' }).click();
    await signInFromDialog(page, 'Sign in to add your cards', viewer);
    await expect(page).toHaveURL(new RegExp(`/cards/${seller.cardId}`), { timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: 'Add cards' })).toBeVisible({ timeout: 20_000 });
  });

  test('a binder\'s "View profile" finishes after signing in: the collector\'s profile', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    await page.goto(`/binders/${seller.binder.id}`);
    await page.getByTestId('owner-guest-profile').click();
    await signInFromDialog(page, 'Sign in to see collector profiles', viewer);
    await expect(page).toHaveURL(new RegExp(`/collectors/${seller.collector.handle}$`), {
      timeout: 20_000,
    });
  });

  /** Signs in on the sign-in page the guest is on (the dialog's or the top bar's). */
  async function signInHere(page: Page, viewer: { email: string; password: string }) {
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=/);
    await page.getByLabel('Email').fill(viewer.email);
    await page.getByLabel('Password', { exact: true }).fill(viewer.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }

  /** Nothing opens on the page by itself, and nothing is sent. */
  async function expectNothingRan(page: Page, writes: readonly string[]) {
    // Long enough for the lazy finishing chunk and `GET /listings/owner`.
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId('chat-drawer')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(writes.filter((write) => !write.includes('/me/'))).toEqual([]);
  }

  // WG review U1, P1, F2: the action belongs to the sign-in it was asked for, nothing else.
  test("an action left with the browser's Back never finishes on a later sign-in", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    const writes = watchWrites(page);
    await page.goto(`/cards/${seller.cardId}`);
    await page
      .getByTestId('holder-row')
      .filter({ hasText: 'Prince Edward Island' })
      .first()
      .getByTestId('holder-message')
      .click();
    await page
      .getByRole('dialog', { name: 'Sign in to message this collector' })
      .getByRole('button', { name: 'Sign in' })
      .click();
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/cards/${seller.cardId}$`));
    // A later sign-in from the top bar, on that very page.
    await page.getByTestId('top-bar-sign-in').click();
    await signInHere(page, viewer);
    await expect(page).toHaveURL(new RegExp(`/cards/${seller.cardId}$`), { timeout: 20_000 });
    await expect(page.getByTestId('top-bar-sign-in')).toHaveCount(0);
    await expectNothingRan(page, writes);
  });

  test('signing out of Review our terms, then another account, never finishes it', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    // An account that never accepted the documents: Review our terms after signing in.
    const unreviewed = await emulatorSignUp(request, uniqueEmail('wgterms'));
    const writes = watchWrites(page);
    const cardUrl = new RegExp(`/cards/${seller.cardId}$`);
    await page.goto(`/cards/${seller.cardId}`);
    await page
      .getByTestId('holder-row')
      .filter({ hasText: 'Prince Edward Island' })
      .first()
      .getByTestId('holder-message')
      .click();
    await page
      .getByRole('dialog', { name: 'Sign in to message this collector' })
      .getByRole('button', { name: 'Sign in' })
      .click();
    await signInHere(page, unreviewed);
    await expect(page).toHaveURL(/\/auth\/consent/, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).not.toHaveURL(/\/auth\//);
    // Back through the tab's history to the card page (no reload: the tab keeps its memory).
    for (let step = 0; step < 6 && !cardUrl.test(page.url()); step++) {
      await page.goBack();
      await page.waitForTimeout(300);
    }
    await expect(page).toHaveURL(cardUrl);
    await page.getByTestId('top-bar-sign-in').click();
    await signInHere(page, viewer);
    await expect(page).toHaveURL(cardUrl, { timeout: 20_000 });
    await expect(page.getByTestId('top-bar-sign-in')).toHaveCount(0);
    writes.length = 0;
    await expectNothingRan(page, writes);
  });

  test('"I have it" finishes after signing in: the draft in the chat drawer, nothing sent', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const viewer = await createViewer(request);
    const writes = watchWrites(page);
    await page.goto('/?kind=wanted');
    const wish = page.getByTestId('feed-post').filter({ hasText: 'wants a card' }).first();
    await expect(wish).toBeVisible({ timeout: 20_000 });
    const card = (await wish.locator('.fp__name').innerText()).trim();
    await wish.getByTestId('feed-have-it').click();
    await signInFromDialog(page, 'Sign in to tell them you have it', viewer);
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByRole('textbox', { name: 'Message' })).toHaveValue(
      `Hi! I have ${card}.`,
    );
    expect(writes.filter((write) => /\/conversations\/[^/]+\/messages/.test(write))).toEqual([]);
  });

  test('"Add to wishlist" finishes after signing in: the wish dialog, nothing saved', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    const writes = watchWrites(page);
    await page.goto(`/cards/${seller.cardId}`);
    await page
      .getByRole('button', { name: /wishlist/i })
      .first()
      .click();
    await signInFromDialog(page, 'Sign in to save your wishes', viewer);
    await expect(page).toHaveURL(new RegExp(`/cards/${seller.cardId}`), { timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: 'Add a wish' })).toBeVisible({
      timeout: 20_000,
    });
    expect(writes.filter((write) => write.includes('/wishlist'))).toEqual([]);
  });

  test('"Report" finishes after signing in: Report collector about that core, nothing sent', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    const writes = watchWrites(page);
    await page.goto(`/binders/${seller.core.id}`);
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: `Report ${seller.core.name}` }).click();
    await signInFromDialog(page, 'Sign in to report this collector', viewer);
    await expect(page).toHaveURL(new RegExp(`/binders/${seller.core.id}`), { timeout: 20_000 });
    await expect(
      page.getByRole('dialog', { name: `Report ${seller.collector.handle}` }),
    ).toBeVisible({ timeout: 20_000 });
    expect(writes.filter((write) => write.includes('/reports'))).toEqual([]);
  });

  test('"Add from this set" finishes after signing in: the adding mode, "Stop adding" focused', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    await page.goto(`/sets/${seller.setId}`);
    await page.getByRole('button', { name: /Add from this set/ }).click();
    await signInFromDialog(page, 'Sign in to add your cards', viewer);
    await expect(page).toHaveURL(new RegExp(`/sets/${seller.setId}`), { timeout: 20_000 });
    const stop = page.getByRole('button', { name: /Stop adding/ });
    await expect(stop).toBeVisible({ timeout: 20_000 });
    // The finished action is said and keeps the keyboard where a member's press leaves it (A7).
    await expect(stop).toBeFocused();
  });

  test('a deck core\'s "Message" finishes after signing in: the chat drawer, the core pinned', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    const viewer = await createViewer(request);
    await page.goto(`/binders/${seller.core.id}`);
    await page
      .getByRole('button', { name: /^Message this collector/ })
      .first()
      .click();
    await signInFromDialog(page, 'Sign in to message this collector', viewer);
    await expect(page).toHaveURL(new RegExp(`/binders/${seller.core.id}`), { timeout: 20_000 });
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer).toContainText(seller.core.name);
  });

  test("a Home post's header finishes after signing in: that collector's profile", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    await createSeller(request);
    const viewer = await createViewer(request);
    await page.goto('/?game=pokemon&kind=cards');
    const who = page.getByTestId('feed-guest-who').first();
    await expect(who).toBeVisible({ timeout: 20_000 });
    await who.click();
    await signInFromDialog(page, 'Sign in to see collector profiles', viewer);
    await expect(page).toHaveURL(/\/collectors\/[a-z0-9_]+$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Create account → verify → the welcome comes back to the page and finishes the action', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const seller = await createSeller(request);
    const email = uniqueEmail('wgnewbie');
    await page.goto(`/cards/${seller.cardId}`);
    await page
      .getByTestId('holder-row')
      .filter({ hasText: 'Prince Edward Island' })
      .first()
      .getByTestId('holder-message')
      .click();
    await page
      .getByRole('dialog', { name: 'Sign in to message this collector' })
      .getByRole('button', { name: 'Create account' })
      .click();
    await expect(page).toHaveURL(/\/auth\/sign-up\?returnUrl=/);
    await page.getByLabel('Display name').fill('WG Newbie');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    await page.getByRole('checkbox', { name: 'I confirm I am 18 years of age or older' }).check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/auth\/verify-email/, { timeout: 20_000 });
    await verifyEmailInEmulator(request, email);
    await page.getByRole('button', { name: 'I have verified my email' }).click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    const handle = page.getByLabel('Handle');
    await handle.fill(uniqueHandle('wgnew'));
    await expect(page.locator('#wl-handle-check')).toHaveText(/is free$/);
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.click();
    await page
      .getByRole('group', { name: 'Games you collect or play' })
      .getByRole('button', { name: 'Pokémon' })
      .click();
    await next.click();
    await expect(page.getByRole('heading', { name: 'Where do you ship from?' })).toBeVisible();
    await chooseOption(page, 'Country', 'Canada');
    await chooseOption(page, 'State or province', 'Ontario');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(new RegExp(`/cards/${seller.cardId}$`), { timeout: 20_000 });
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer).toContainText(seller.cardName);
  });

  test('signing in on Search comes back to the same game with the binder still open', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createSeller(request);
    // The viewer's own game is Yu-Gi-Oh! (its profile's first): the binder is a Pokémon one.
    const viewer = await createViewer(request);
    await page.goto(`/search?tab=binders&state=CA-PE&game=pokemon&open=${seller.binder.id}`);
    const drillIn = page.getByTestId('binder-drill-in');
    await expect(drillIn).toContainText(seller.binder.name, { timeout: 20_000 });
    await drillIn.getByTestId('drill-in-message').click();
    await signInFromDialog(page, 'Sign in to message this collector', viewer);
    await expect(page.getByTestId('chat-drawer')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(/game=pokemon/);
    await expect(page).toHaveURL(new RegExp(`open=${seller.binder.id}`));
    await expect(page.getByTestId('binder-drill-in')).toContainText(seller.binder.name);
  });
});
