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
 * Mobile Phase 10 (Premium, credits, donations, sponsored placements) against the real, isolated
 * stack with the local fake billing and donation providers (no card, no money) and fresh
 * fictional collectors.
 *
 * 1. A FREE collector at `binders.max` (5 of 5) is told so on "New binder" and led to Premium by
 *    "See Premium"; the fake billing checkout declines once ("Try again"), then succeeds: the
 *    member is welcomed, the sixth binder is created and the search shows no "Sponsored" result
 *    any more; "Cancel now" brings the free plan back.
 * 2. A new collector redeems another collector's referral code, unlocks "Wider map for a day"
 *    with credits and finds both entries in the append-only ledger; the referrer earned 100.
 * 3. A voluntary donation through Support and the fake donation checkout: the thank-you, the
 *    donation in "Your donations" and the opted-in name among the supporters (never an amount).
 * 4. A FREE collector's search shows a result labelled "Sponsored": the impression is recorded
 *    once (204) and a tap opens the API's click route, which lands on the advertiser's page.
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

test.describe('mobile Premium, credits, donations and ads', () => {
  requireStack();

  test('binders.max → See Premium → fake billing checkout → limit lifted, no ads → cancel', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const member = await createOnboardedCollector(request, 'prem', `Pat Premium ${suffix()}`);
    for (let i = 1; i <= 5; i++) {
      const created = await request.post(`${API_URL}/api/v1/binders`, {
        headers: authHeader(member.idToken),
        data: { name: `Binder ${i}` },
      });
      expect(created.status(), `binder ${i}`).toBe(201);
    }
    await signInThroughUi(page, member.email, member.password);

    // --- The limit, explained where it happens, leads to Premium ------------------------------
    await page.goto('/binders/new');
    let form = screen(page, 'new-binder');
    await form.getByLabel('Binder name').fill('One too many', { timeout: 30_000 });
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(form.getByTestId('binder-limit-message')).toHaveText(
      /^You have used 5 of 5 binders on the Free plan\./,
      { timeout: 30_000 }
    );
    await form.getByRole('button', { name: 'See Premium' }).click();

    const premium = screen(page, 'premium');
    await expect(premium.getByTestId('plan-FREE-badge')).toHaveText('Your plan', {
      timeout: 30_000,
    });
    await expect(premium.getByTestId('usage-binders.max')).toContainText('5 / 5');
    await expect(premium.getByTestId('premium-credits')).toBeVisible();
    await premium.getByRole('button', { name: 'Upgrade to Premium' }).click();

    // --- The fake billing checkout: a decline, then a payment --------------------------------
    const checkout = screen(page, 'billing-checkout');
    await expect(checkout.getByTestId('local-payment-banner')).toContainText('Local test payment', {
      timeout: 30_000,
    });
    await expect(checkout.getByTestId('checkout-amount')).toContainText('$4.99');
    await checkout.getByRole('button', { name: 'Simulate a failed payment' }).click();
    await expect(checkout.getByTestId('checkout-outcome')).toContainText(
      'The payment was declined. Nothing was charged.',
      { timeout: 60_000 }
    );
    await checkout.getByRole('button', { name: 'Try again' }).click();
    await expect(checkout.getByTestId('checkout-note')).toContainText(
      'The last attempt was declined'
    );
    await checkout.getByRole('button', { name: 'Pay $4.99' }).click();
    await expect(premium.getByTestId('premium-welcome')).toContainText('Welcome to Premium!', {
      timeout: 60_000,
    });
    await expect(premium.getByTestId('subscription-status')).toContainText('Active');
    await expect(premium.getByTestId('plan-PREMIUM-current')).toBeVisible();
    await expect(premium.getByTestId('premium-credits')).toHaveCount(0);
    const plan = await request.get(`${API_URL}/api/v1/me/plan`, {
      headers: authHeader(member.idToken),
    });
    expect(((await plan.json()) as { plan: { code: string } }).plan.code).toBe('PREMIUM');

    // --- The limit is lifted: a sixth binder ---------------------------------------------------
    await page.goto('/binders/new');
    form = screen(page, 'new-binder');
    await form.getByLabel('Binder name').fill('Premium binder', { timeout: 30_000 });
    await form.getByRole('button', { name: 'Create binder' }).click();
    await expect(snackbar(page)).toHaveText('Binder “Premium binder” created.', {
      timeout: 30_000,
    });

    // --- No ads for Premium ---------------------------------------------------------------------
    await page.goto('/search');
    const search = screen(page, 'search');
    await search.getByLabel('Find a card').fill('emberfang');
    await expect(search.getByTestId('search-count')).toContainText('for “emberfang”', {
      timeout: 30_000,
    });
    await expect(search.getByTestId('sponsored-ad')).toHaveCount(0);

    // --- Cancel now: the free plan again ------------------------------------------------------
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-premium').click();
    await premium.getByRole('button', { name: 'Cancel now' }).click({ timeout: 30_000 });
    await page
      .getByTestId('subscription-dialog')
      .getByRole('button', { name: 'Cancel now' })
      .click();
    await expect(snackbar(page)).toHaveText('Premium is cancelled. You are on the free plan now.', {
      timeout: 30_000,
    });
    await expect(premium.getByTestId('plan-FREE-badge')).toHaveText('Your plan', {
      timeout: 30_000,
    });
    const after = await request.get(`${API_URL}/api/v1/me/plan`, {
      headers: authHeader(member.idToken),
    });
    expect(((await after.json()) as { plan: { code: string } }).plan.code).toBe('FREE');
  });

  test('credits: redeem a referral code, unlock a feature for a day, the ledger', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const referrer = await createOnboardedCollector(request, 'refa', `Rae Referrer ${suffix()}`);
    const newcomer = await createOnboardedCollector(request, 'refb', `Nia Newcomer ${suffix()}`);
    const code = (
      (await (
        await request.get(`${API_URL}/api/v1/me/referrals`, {
          headers: authHeader(referrer.idToken),
        })
      ).json()) as { code: string }
    ).code;
    const balanceOf = async (token: string) =>
      (
        (await (
          await request.get(`${API_URL}/api/v1/me/credits`, { headers: authHeader(token) })
        ).json()) as { balance: number }
      ).balance;
    const referrerBefore = await balanceOf(referrer.idToken);
    const start = await balanceOf(newcomer.idToken);

    await signInThroughUi(page, newcomer.email, newcomer.password);
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-credits').click();
    const credits = screen(page, 'credits');
    await expect(credits.getByTestId('credit-balance')).toContainText(String(start), {
      timeout: 30_000,
    });
    await expect(credits.getByTestId('credit-balance-card')).toContainText(
      'never withdrawable or transferable'
    );

    // An unknown code, then the real one.
    await credits.getByLabel('Referral code').fill('NOPE-0000');
    await credits.getByRole('button', { name: 'Redeem' }).click();
    await expect(
      credits.getByText(
        'This code does not exist. Check the spelling with the collector who shared it.'
      )
    ).toBeVisible({ timeout: 30_000 });
    await credits.getByLabel('Referral code').fill(code);
    await credits.getByRole('button', { name: 'Redeem' }).click();
    await expect(snackbar(page)).toContainText('Code redeemed: you earned 50 credits.', {
      timeout: 30_000,
    });
    await expect(credits.getByTestId('credit-balance')).toContainText(String(start + 50), {
      timeout: 30_000,
    });
    await expect(credits.getByTestId('referral-redeemed')).toBeVisible();

    // Unlock "Wider map for a day" (30 credits).
    await credits.getByRole('button', { name: 'Unlock for 30 credits' }).last().click();
    const dialog = page.getByTestId('spend-dialog');
    await expect(dialog).toContainText('Unlock Wider map for a day?');
    await dialog.getByRole('button', { name: 'Unlock for 30 credits' }).click();
    await expect(snackbar(page)).toContainText(`Wider map for a day unlocked until`, {
      timeout: 30_000,
    });
    await expect(credits.getByTestId('credit-balance')).toContainText(String(start + 20), {
      timeout: 30_000,
    });
    await expect(credits.getByTestId('active-boost')).toContainText('Map radius up to 100 km');

    // The append-only ledger: newest first.
    const entries = credits.getByTestId('ledger-entry');
    await expect(entries.first()).toContainText('Wider map for a day');
    await expect(entries.first()).toContainText('−30');
    await expect(
      credits.getByTestId('ledger-entry').filter({ hasText: 'Referral reward' })
    ).toContainText('+50');
    expect(await balanceOf(referrer.idToken)).toBe(referrerBefore + 100);
  });

  test('a voluntary donation through the fake donation checkout and the supporters', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const donor = await createOnboardedCollector(request, 'dono', `Dora Donor ${suffix()}`);
    await signInThroughUi(page, donor.email, donor.password);
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-support').click();
    const support = screen(page, 'support');
    await expect(support.getByTestId('voluntary-label')).toContainText('Voluntary support', {
      timeout: 30_000,
    });
    await expect(support.getByTestId('my-donations-empty')).toBeVisible({ timeout: 30_000 });
    await support.getByRole('radio', { name: '$5', exact: true }).click();
    await support.getByLabel('Message (optional)').fill('Thanks for the map!');
    await support.getByRole('checkbox', { name: /Thank me publicly/ }).click();
    await support.getByRole('button', { name: 'Donate $5.00' }).click();

    const checkout = screen(page, 'donation-checkout');
    await expect(checkout.getByTestId('local-payment-banner')).toBeVisible({ timeout: 30_000 });
    await checkout.getByRole('button', { name: 'Donate $5.00' }).click();
    await expect(support.getByTestId('donation-thanks')).toContainText('Thank you!', {
      timeout: 60_000,
    });
    await expect(support.getByTestId('my-donation')).toContainText('$5.00', { timeout: 30_000 });
    await expect(support.getByTestId('my-donation')).toContainText('Thank you');
    const wall = support.getByTestId('supporter').filter({ hasText: donor.displayName });
    await expect(wall).toBeVisible({ timeout: 30_000 });
    await expect(wall).not.toContainText('$');
  });

  test('a FREE collector sees a "Sponsored" search result: impression once, click route', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const viewer = await createOnboardedCollector(request, 'adsv', `Ava Viewer ${suffix()}`);
    // The advertiser's (fictional) landing page is served from memory.
    await page
      .context()
      .route('https://maplesleeve.example/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Maple Sleeve Co.</h1>' })
      );
    await signInThroughUi(page, viewer.email, viewer.password);
    await openTab(page, 'Search');
    const search = screen(page, 'search');
    const impression = page.waitForResponse(
      (response) =>
        /\/api\/v1\/ads\/[\w-]+\/impression$/.test(response.url()) &&
        response.request().method() === 'POST'
    );
    await search.getByLabel('Find a card').fill('emberfang');
    const ad = search.getByTestId('sponsored-ad').first();
    await expect(ad).toBeVisible({ timeout: 30_000 });
    await expect(ad.getByTestId('sponsored-label')).toHaveText('Sponsored');
    await expect(ad).toContainText('Matte sleeves that shuffle like new');
    expect((await impression).status()).toBe(204);

    // The tap opens the API's click route in a new window: it records the click once and
    // redirects (302) to the advertiser's landing page.
    const click = page
      .context()
      .waitForEvent('response', (response) =>
        /\/api\/v1\/ads\/[\w-]+\/click\?token=/.test(response.url())
      );
    const landing = page
      .context()
      .waitForEvent(
        'request',
        (request) => request.url() === 'https://maplesleeve.example/sleeves'
      );
    await ad.getByTestId('sponsored-link').click();
    const redirect = await click;
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()['location']).toBe('https://maplesleeve.example/sleeves');
    expect((await landing).url()).toBe('https://maplesleeve.example/sleeves');
  });
});
