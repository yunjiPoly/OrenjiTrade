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
  createOnboardedCollector,
  forbidMapProviders,
  requireStack,
  stubCardImages,
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

/** A discoverable collector (Prince Edward Island) with a public binder and a public deck core. */
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
  const fox = await printingIdOf(api, collector.idToken, 'AZR-EN011');
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
    await page.goto('/search?tab=binders&state=CA-PE');
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
    await page.getByRole('link', { name: 'Appearance' }).click();
    await expect(page).toHaveURL(/\/settings\/appearance$/);
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: /Legal/ })).toBeVisible();
    await page.goto('/settings/privacy');
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnUrl=%2Fsettings%2Fprivacy/);
    await page.goto('/profile');
    await page.getByRole('link', { name: /^Legal/ }).click();
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
    const row = page.getByTestId('holder-row').first();
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
    await page.getByTestId('holder-message').first().click();
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
});
