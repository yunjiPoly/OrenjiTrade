import {
  APIRequestContext,
  Page,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
} from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  SEED_PASSWORD,
  authHeader,
  createOnboardedCollector,
  emulatorSignIn,
  openAccountMenu,
  requireStack,
  signInThroughUi,
  stubCardImages,
  forbidMapProviders,
} from './support/stack';

/**
 * Launch configuration (2026-10-05): OrenjiTrade launches as "discovery + messaging only". This
 * spec switches every money flag off on the real E2E stack — the state a production database has
 * after the migrations (V105) — and checks that no screen offers to pay, subscribe, buy credits or
 * donate, that the money routes refuse with the feature-disabled Problem Details, and that the
 * ordinary journey (map, public binder, an offer as a plain proposal, the agreed trade) still
 * works. It changes shared state, so it is its own Playwright project (`launch-config`) that runs
 * alone after the `chromium` project; the flags are restored afterwards. Run it on its own with
 * `npm run test:e2e -- e2e/launch-config.spec.ts --no-deps`.
 */

const SUPER_ADMIN = 'superadmin@orenjitrade.test';
const MONEY_FLAGS = [
  'protectedPayments',
  'premiumPlans',
  'credits',
  'donations',
  'advertising',
  'mlScanning',
] as const;

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercent?: number;
  description?: string;
}

async function setFlag(api: APIRequestContext, token: string, flag: FeatureFlag): Promise<void> {
  const response = await api.put(`${API_URL}/api/v1/admin/feature-flags/${flag.key}`, {
    headers: authHeader(token),
    data: {
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent ?? 100,
      description: flag.description,
    },
  });
  expect(response.ok(), `set flag ${flag.key} = ${flag.enabled}`).toBeTruthy();
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** A discoverable seller with a published trade binder holding one card that accepts offers. */
async function sellerWithListing(
  api: APIRequestContext,
): Promise<{ collector: OnboardedCollector; binderId: string; card: string }> {
  const collector = await createOnboardedCollector(api, 'launchsell', {
    location: { countryCode: 'CA', subdivisionCode: 'CA-QC', city: 'Saguenay' },
    displayName: `Lou Launch ${suffix()}`,
  });
  await apiUpdatePrivacy(api, collector.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, collector.idToken, {
    name: `E2E launch binder ${suffix()}`,
    kind: 'TRADE',
    description: 'Fictional binder for the launch configuration E2E spec.',
  });
  await apiPublishBinder(api, collector.idToken, binder.id, 'UNTIL_DISABLED');
  const item = await apiCreateItem(api, collector.idToken, {
    printingId: await printingIdOf(api, collector.idToken, 'AZR-EN011'),
    binderId: binder.id,
    condition: 'NEAR_MINT',
    currency: 'CAD',
    acceptsOffers: true,
    quantity: 1,
    availability: 'TRADE_OR_SALE',
    askingPrice: 45,
    publicNotes: 'Fictional listing for the launch configuration E2E spec.',
  });
  return { collector, binderId: binder.id, card: item.card.name };
}

async function expectFeatureDisabled(
  api: APIRequestContext,
  token: string,
  method: 'get' | 'post',
  path: string,
  feature: string,
  data?: unknown,
): Promise<void> {
  const response = await api[method](`${API_URL}${path}`, { headers: authHeader(token), data });
  expect(response.status(), `${method.toUpperCase()} ${path}`).toBe(404);
  const problem = (await response.json()) as {
    errorCode: string;
    feature?: string;
    requestId?: string;
  };
  expect(problem.errorCode, path).toBe('FEATURE_DISABLED');
  expect(problem.feature, path).toBe(feature);
  expect(problem.requestId, `requestId of ${path}`).toBeTruthy();
}

async function expectRedirectedAway(page: Page, path: string, label: string, to: RegExp) {
  await page.goto(path);
  await expect(page).toHaveURL(to);
  await expect(page.getByText(`${label} is not available right now.`)).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('launch configuration: every money flag off', () => {
  requireStack();

  let admin: APIRequestContext;
  let adminToken: string;
  let previous: FeatureFlag[] = [];

  test.beforeAll(async () => {
    admin = await playwrightRequest.newContext();
    adminToken = await emulatorSignIn(admin, SUPER_ADMIN, SEED_PASSWORD);
    const listed = await admin.get(`${API_URL}/api/v1/admin/feature-flags`, {
      headers: authHeader(adminToken),
    });
    expect(listed.ok(), 'GET /admin/feature-flags').toBeTruthy();
    previous = ((await listed.json()) as FeatureFlag[]).filter((flag) =>
      (MONEY_FLAGS as readonly string[]).includes(flag.key),
    );
    expect(previous.map((flag) => flag.key).sort()).toEqual([...MONEY_FLAGS].sort());
    for (const key of MONEY_FLAGS) {
      await setFlag(admin, adminToken, { key, enabled: false, rolloutPercent: 100 });
    }
  });

  test.afterAll(async () => {
    // The other specs assume the seeded state (fake-provider flags on): put it back.
    for (const flag of previous) {
      await setFlag(admin, adminToken, flag);
    }
    await admin.dispose();
  });

  test('no screen offers to pay, subscribe, buy credits or donate; the API refuses; trading still works', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const publicFlags = await request.get(`${API_URL}/api/v1/public/feature-flags`);
    const flags = (await publicFlags.json()) as Record<string, boolean>;
    for (const key of MONEY_FLAGS) {
      expect(flags[key], `public flag ${key}`).toBe(false);
    }

    const { collector: seller, binderId, card } = await sellerWithListing(request);
    const buyer = await createOnboardedCollector(request, 'launchbuy', {
      displayName: `Bo Launch ${suffix()}`,
    });
    await forbidMapProviders(page);
    await stubCardImages(page);
    await signInThroughUi(page, buyer.email, buyer.password);

    // --- Map: no radius exists any more (ADR 0017), nothing is sold, no sponsored placement -----
    await expect(page).toHaveURL(/\/map/);
    await expect(page.getByTestId('boundary-map')).toBeVisible();
    await expect(page.getByTestId('radius-cap')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText(/\bkm\b/);
    await expect(page.locator('a[href="/premium"]')).toHaveCount(0);
    await expect(page.getByTestId('sponsored-ad')).toHaveCount(0);

    // --- Account menu and footer: no Premium, Credits or Support entries ----------------------
    await openAccountMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
    for (const name of ['Premium', 'Credits', 'Support OrenjiTrade']) {
      await expect(page.getByRole('menuitem', { name })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Trading safely' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Premium' })).toHaveCount(0);
    await expect(page.getByTestId('footer-support')).toHaveCount(0);

    // --- The premium page sells nothing; credits, support and payouts are unreachable -----------
    await page.goto('/premium');
    await expect(page.getByRole('heading', { level: 1, name: 'Premium' })).toBeVisible();
    await expect(page.getByText('Premium is not available yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /Upgrade/ })).toHaveCount(0);
    await expectRedirectedAway(page, '/credits', 'Credits', /\/map/);
    await expectRedirectedAway(page, '/support', 'Donations', /\/map/);
    await expectRedirectedAway(page, '/settings/payouts', 'Payouts', /\/settings\/profile$/);
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', {
        name: 'Payouts',
      }),
    ).toHaveCount(0);

    // --- An offer is a plain proposal: no payment protection to tick ---------------------------
    await page.goto(`/binders/${binderId}`);
    const listing = page.getByRole('article', { name: card });
    await listing.getByRole('button', { name: `Make an offer on ${card}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Make an offer' });
    await expect(dialog).toContainText('Asking $45.00');
    await expect(dialog.getByRole('checkbox', { name: /payment protection/i })).toHaveCount(0);
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('40');
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Offer sent to ${seller.displayName}.`)).toBeVisible();

    await page.goto('/offers?tab=sent');
    await page.getByRole('link', { name: new RegExp(`^Offer on ${card} to `) }).click();
    await expect(page).toHaveURL(/\/offers\/[\w-]+$/);
    const offerId = /\/offers\/([\w-]+)/.exec(page.url())![1];

    // The seller accepts (API): the trade opens as AGREED, nothing to pay, safety notice shown.
    const accepted = await request.post(`${API_URL}/api/v1/offers/${offerId}/accept`, {
      headers: authHeader(seller.idToken),
    });
    expect(accepted.ok(), 'POST /offers/{id}/accept').toBeTruthy();
    const tradeId = ((await accepted.json()) as { tradeId: string }).tradeId;
    await page.goto(`/trades/${tradeId}`);
    await expect(page.getByTestId('next-action')).toContainText('meet and exchange the cards');
    await expect(page.getByRole('button', { name: /^Pay /i })).toHaveCount(0);
    await expect(page.getByTestId('safety-notice')).toBeVisible();
    await expect(page.locator('a[href="/premium"]')).toHaveCount(0);

    // --- The money routes refuse with the existing Problem Details ----------------------------
    await expectFeatureDisabled(
      request,
      buyer.idToken,
      'post',
      '/api/v1/me/subscription/checkout',
      'premiumPlans',
      { planCode: 'PREMIUM' },
    );
    await expectFeatureDisabled(request, buyer.idToken, 'get', '/api/v1/me/credits', 'credits');
    await expectFeatureDisabled(request, buyer.idToken, 'get', '/api/v1/me/referrals', 'credits');
    await expectFeatureDisabled(
      request,
      buyer.idToken,
      'post',
      '/api/v1/donations/checkout',
      'donations',
      { amount: 5, currency: 'CAD' },
    );
    await expectFeatureDisabled(
      request,
      seller.idToken,
      'get',
      '/api/v1/me/seller-account',
      'protectedPayments',
    );
    await expectFeatureDisabled(
      request,
      buyer.idToken,
      'post',
      `/api/v1/trades/${tradeId}/pay`,
      'protectedPayments',
    );
    const ads = await request.get(`${API_URL}/api/v1/ads?placement=MAP_PANEL`);
    expect(ads.status()).toBe(200);
    expect(await ads.json()).toEqual([]);
  });
});
