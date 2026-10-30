import { APIRequestContext, expect, request as playwrightRequest, test } from '@playwright/test';
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
 * Launch configuration (2026-10-05): OrenjiTrade launches as "discovery + messaging only"; since
 * stage F1 (2026-10-14) Premium, credits, donations and ads are gone altogether. This spec
 * switches the remaining money flag off on the real E2E stack — the state a production database
 * has after the migrations (V105) — and checks that no screen offers to pay, subscribe, buy credits
 * or donate, that the removed paid pages and routes do not exist, that protected payments refuse
 * with the feature-disabled Problem Details, and that the ordinary journey (map, public binder, an offer as a plain proposal, the agreed trade) still
 * works. It changes shared state, so it is its own Playwright project (`launch-config`) that runs
 * alone after the `chromium` project; the flags are restored afterwards. Run it on its own with
 * `npm run test:e2e -- e2e/launch-config.spec.ts --no-deps`.
 */

const SUPER_ADMIN = 'superadmin@orenjitrade.test';
const MONEY_FLAGS = ['protectedPayments', 'mlScanning'] as const;
/** The flags of the paid features removed by stage F1 (migrations V120 to V123). */
const REMOVED_FLAGS = ['premiumPlans', 'credits', 'donations', 'advertising'] as const;

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
): Promise<{ collector: OnboardedCollector; binderId: string; card: string; itemId: string }> {
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
  return { collector, binderId: binder.id, card: item.card.name, itemId: item.id };
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
    expect(publicFlags.ok(), 'GET /public/feature-flags').toBeTruthy();
    const flags = (await publicFlags.json()) as Record<string, boolean>;
    for (const key of MONEY_FLAGS) {
      expect(flags[key], `public flag ${key}`).toBe(false);
    }
    for (const key of REMOVED_FLAGS) {
      expect(key in flags, `removed flag ${key}`).toBe(false);
    }

    const { collector: seller, binderId, card, itemId } = await sellerWithListing(request);
    const buyer = await createOnboardedCollector(request, 'launchbuy', {
      displayName: `Bo Launch ${suffix()}`,
    });
    await forbidMapProviders(page);
    await stubCardImages(page);
    await signInThroughUi(page, buyer.email, buyer.password);

    // --- Home's map: no radius exists any more (ADR 0017), nothing is sold, no sponsored place ---
    await expect(page).toHaveURL(/:\d+\/(\?region=[a-z-]+(&game=[a-z-]+)?)?$/);
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
    // The footer ends reading pages (spec 4.10): Home is a workspace page without one.
    await page.goto('/legal');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Trading safely' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Premium' })).toHaveCount(0);
    await expect(page.getByTestId('footer-support')).toHaveCount(0);

    // --- Legal hides the payment policies while protectedPayments is off (decision 23) ---------
    await expect(page.getByRole('link', { name: /Terms of Service/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Payment Protection Policy/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Refund and Dispute Policy/ })).toHaveCount(0);

    // --- Premium, credits and support do not exist any more; payouts are unreachable -----------
    for (const path of ['/premium', '/credits', '/support']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    }
    // Offers and payouts left the web (decision 2): the old settings pages lead to Settings.
    for (const path of ['/settings/payouts', '/settings/offers']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/settings\/profile$/);
    }
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', {
        name: /Payouts|Offers/,
      }),
    ).toHaveCount(0);

    // --- No offer on the web any more (decision 2): no button, no chip, old links to Messages ---
    await page.goto(`/binders/${binderId}`);
    // The binder page's cards (web stage WD, board W9).
    const listing = page.getByTestId('binder-card').filter({ hasText: card });
    await expect(listing).toBeVisible();
    await expect(listing.getByRole('button', { name: /Make an offer/ })).toHaveCount(0);
    await expect(listing).not.toContainText(/Accepting offers|Make an offer/);

    // An offer the API still records (the paused web's server modules stay, ADR 0018): its old
    // links land in Messages with the toast.
    const created = await request.post(`${API_URL}/api/v1/offers`, {
      headers: authHeader(buyer.idToken),
      data: { itemId, kind: 'CASH', cashAmount: 40, currency: 'CAD' },
    });
    expect(created.ok(), 'POST /offers').toBeTruthy();
    const offerId = ((await created.json()) as { id: string }).id;
    const accepted = await request.post(`${API_URL}/api/v1/offers/${offerId}/accept`, {
      headers: authHeader(seller.idToken),
    });
    expect(accepted.ok(), 'POST /offers/{id}/accept').toBeTruthy();
    const tradeId = ((await accepted.json()) as { tradeId: string }).tradeId;
    for (const path of [`/offers/${offerId}`, `/trades/${tradeId}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/messages$/);
      await expect(
        page.getByText('Offers are no longer available. Deals happen in the chat.'),
      ).toBeVisible();
    }
    await expect(page.locator('a[href="/premium"]')).toHaveCount(0);

    // --- The removed paid routes are gone; protected payments refuse with the Problem Details ---
    for (const path of [
      '/api/v1/me/plan',
      '/api/v1/me/credits',
      '/api/v1/me/referrals',
      '/api/v1/ads',
    ]) {
      const gone = await request.get(`${API_URL}${path}`, { headers: authHeader(buyer.idToken) });
      expect(gone.status(), `GET ${path}`).toBe(404);
    }
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
  });
});
