import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { coordinateLeaks, watchCoordinates } from './support/inventory';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  createStaffMember,
  openAccountMenu,
  requireStack,
  signInThroughUi,
  stubCardImages,
  forbidMapProviders,
  WEB_URL,
} from './support/stack';

/**
 * Credits, sponsored placements and voluntary donations (Phase 10) against the real local stack
 * (fake billing and donation providers, internal ad campaigns; nothing costs money):
 *
 * 1. A fresh collector redeems another fresh collector's referral code (an unknown code is
 *    explained first), then spends the earned credits on a 24 h unlock: the balance, the ledger
 *    and the active boosts follow; the referrer earned their reward.
 * 2. A signed-out visitor sees the map panel's "Sponsored" house ad (impression recorded) whose
 *    click lands on its target; a FREE collector sees a "Sponsored" search result; once Premium
 *    (through the fake billing provider) the same search shows no ad at all.
 * 3. A collector gives through the footer's "Support OrenjiTrade": the API's accepted range is
 *    explained on the field, the local fake donation checkout confirms the voluntary donation and
 *    the opted-in display name appears among the supporters.
 * 4. An admin grants credits to a member and creates, edits, targets and ends an ad campaign;
 *    the audit log lists every write.
 *
 * No JSON response carries a coordinate (ADR 0017).
 */

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/**
 * Waits until a just-opened dialog took its initial focus (after its opening animation), so
 * typing never races the focus trap moving focus to the first field.
 */
async function dialogSettled(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('mat-dialog-container')))
    .toBe(true);
}

/** Subscribes a collector to Premium through the fake billing provider (checkout + webhook). */
async function apiUpgradeToPremium(api: APIRequestContext, token: string): Promise<void> {
  const checkout = await api.post(`${API_URL}/api/v1/me/subscription/checkout`, {
    headers: authHeader(token),
    data: { planCode: 'PREMIUM' },
  });
  expect(checkout.ok(), 'POST /me/subscription/checkout').toBeTruthy();
  const url = ((await checkout.json()) as { url: string }).url;
  const ref = url.split('/').pop();
  const confirm = await api.post(`${API_URL}/api/v1/billing/fake/${ref}/confirm`, {
    headers: authHeader(token),
    data: { outcome: 'SUCCEEDED' },
  });
  expect(confirm.status(), 'POST /billing/fake/{ref}/confirm').toBe(202);
  await expect
    .poll(
      async () => {
        const plan = await api.get(`${API_URL}/api/v1/me/plan`, { headers: authHeader(token) });
        return ((await plan.json()) as { plan: { code: string } }).plan.code;
      },
      { message: 'the subscription becomes active', timeout: 30_000 },
    )
    .toBe('PREMIUM');
}

test.describe('credits, ads and donations', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('a new collector redeems a referral code and unlocks a feature for a day', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const referrer = await createOnboardedCollector(request, 'referrer');
    const referral = await request.get(`${API_URL}/api/v1/me/referrals`, {
      headers: authHeader(referrer.idToken),
    });
    const code = ((await referral.json()) as { code: string }).code;
    expect(code).toMatch(/^[A-Z0-9]{4,}$/);
    const referee = await createOnboardedCollector(request, 'referee');

    const watcher = watchCoordinates(page);
    await signInThroughUi(page, referee.email, referee.password);
    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Credits' }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Credits' })).toBeVisible();
    await expect(page.getByTestId('credit-balance')).toContainText('0 credits');
    await expect(page.getByText('never withdrawable or transferable').first()).toBeVisible();
    await expect(page.getByTestId('referral-code')).not.toHaveText(code);

    // An unknown code is explained on the field.
    const codeField = page.getByLabel('Referral code');
    await codeField.fill('NOPE-0000-ZZ');
    await page.getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByText('This code does not exist.')).toBeVisible();

    // The referrer's code (case and dashes do not matter) earns the new collector credits.
    await codeField.fill(`${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`);
    await page.getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByText(/Code redeemed: you earned 50 credits/)).toBeVisible();
    await expect(page.getByTestId('credit-balance')).toContainText('50 credits');
    await expect(page.getByText('You already redeemed a referral code.')).toBeVisible();
    const history = page.getByRole('list', { name: 'Credit history' });
    await expect(history.getByTestId('ledger-entry').first()).toContainText('Referral reward');
    await expect(history.getByTestId('ledger-amount').first()).toHaveText('+50');

    // Spend the credits on "Advanced search for a day" (50 credits, 24 hours).
    const product = page.locator('[data-product="premium_search_day"]');
    await expect(
      page
        .locator('[data-product="binder_views_day"]')
        .getByRole('button', { name: /^Unlock for/ }),
    ).toBeEnabled();
    await product.getByRole('button', { name: 'Unlock for 50 credits' }).click();
    const dialog = page.getByRole('dialog', { name: /^Unlock .+\?$/ });
    await expect(dialog.getByTestId('spend-cost')).toHaveText('50 credits');
    await dialog.getByRole('button', { name: 'Unlock for 50 credits' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/unlocked until .* Balance: 0 credits\./)).toBeVisible();
    await expect(page.getByTestId('credit-balance')).toContainText('0 credits');
    await expect(page.getByTestId('active-boost')).toContainText('Advanced search filters');
    await expect(page.getByTestId('active-boost')).toContainText('Unlocked with credits');
    await expect(history.getByTestId('ledger-amount').first()).toHaveText('−50');
    await expect(
      page
        .locator('[data-product="binder_views_day"]')
        .getByRole('button', { name: /^Unlock for/ }),
    ).toBeDisabled();
    await expect(page.locator('[data-product="binder_views_day"]')).toContainText(
      'You need 30 credits more.',
    );

    // The referrer earned the referrer reward; credits never become cash.
    const credits = await request.get(`${API_URL}/api/v1/me/credits`, {
      headers: authHeader(referrer.idToken),
    });
    const body = (await credits.json()) as {
      balance: number;
      withdrawable: boolean;
      transferable: boolean;
    };
    expect(body).toMatchObject({ balance: 100, withdrawable: false, transferable: false });

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });

  test('sponsored placements are labelled, click through, and disappear with Premium', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const watcher = watchCoordinates(page);
    await forbidMapProviders(page);

    // Signed out: the map's side panel carries the house ad, labelled "Sponsored".
    const impression = page.waitForResponse(
      (response) =>
        /\/api\/v1\/ads\/[\w-]+\/impression$/.test(response.url()) &&
        response.request().method() === 'POST',
    );
    await page.goto('/map');
    const mapAd = page.locator('[data-slot="MAP_PANEL"] [data-testid="sponsored-ad"]').first();
    await expect(mapAd).toBeVisible();
    await expect(mapAd.getByTestId('sponsored-label')).toHaveText('Sponsored');
    expect((await impression).status()).toBe(204);

    // The click goes through the API's click route and lands on the ad's target (new tab).
    const link = mapAd.getByTestId('sponsored-link');
    await expect(link).toHaveAttribute('href', /\/api\/v1\/ads\/[\w-]+\/click\?token=/);
    await expect(link).toHaveAttribute('rel', /sponsored/);
    const [landing] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
    await landing.waitForLoadState('domcontentloaded');
    // House ads land on the web app the API was configured for (ADS_WEB_BASE_URL: the E2E web app).
    expect(
      landing.url() === `${WEB_URL}/premium` || /^https:\/\/[^/]+\.example\//.test(landing.url()),
      `landing ${landing.url()}`,
    ).toBe(true);
    await landing.close();

    // A FREE collector (interested in Pokémon) sees a sponsored search result.
    const collector = await createOnboardedCollector(request, 'adviewer');
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/search?q=fox');
    const searchAd = page.locator('[data-slot="SEARCH_SPONSORED"] [data-testid="sponsored-ad"]');
    await expect(searchAd.first()).toBeVisible();
    await expect(searchAd.first().getByTestId('sponsored-label')).toHaveText('Sponsored');
    await expect(searchAd.first().getByRole('link', { name: 'Remove ads' })).toBeVisible();

    // Premium removes the ads: the API serves [] and nothing is rendered, not even a label.
    await apiUpgradeToPremium(request, collector.idToken);
    const direct = await request.get(`${API_URL}/api/v1/ads?placement=SEARCH_SPONSORED`, {
      headers: authHeader(collector.idToken),
    });
    expect(await direct.json()).toEqual([]);
    // The reloaded page asks again (counted from the moment the new document commits, so a late
    // answer of the old page never counts) and renders nothing for the [] it gets.
    await page.reload({ waitUntil: 'commit' });
    const answers: number[] = [];
    page.on('response', (response) => {
      if (
        response.url().includes('/api/v1/ads?placement=SEARCH_SPONSORED') &&
        response.request().method() === 'GET'
      ) {
        answers.push(response.status());
      }
    });
    await expect(page.getByRole('heading', { name: 'Cards for “fox”' })).toBeVisible();
    await expect.poll(() => answers.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(answers.every((status) => status === 200)).toBe(true);
    await expect(page.locator('[data-testid="sponsored-ad"]')).toHaveCount(0);
    await expect(page.getByText('Sponsored', { exact: true })).toHaveCount(0);

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });

  test('a voluntary donation through the fake checkout thanks the donor publicly', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const displayName = `E2E Supporter ${suffix()}`;
    const donor = await createOnboardedCollector(request, 'donor', { displayName });
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, donor.email, donor.password);

    // The footer leads to the clearly labelled voluntary support page.
    await page.getByTestId('footer-support').click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByTestId('voluntary-label')).toContainText('Voluntary support');
    await expect(
      page.getByText('never change ratings, search ranking or trust').first(),
    ).toBeVisible();
    await expect(page.getByText('You have not donated yet.')).toBeVisible();

    // The API's accepted range is explained on the custom amount.
    await page.getByRole('radio', { name: 'Other' }).click();
    await page.getByTestId('donation-custom-amount').fill('1');
    await page.getByRole('button', { name: 'Donate $1.00' }).click();
    await expect(page.getByText('The amount must be between 2.00 and 500.00.')).toBeVisible();

    // $25 with a private message and public thanks → the local fake checkout.
    await page.getByRole('radio', { name: '$25' }).click();
    await page.getByLabel('Message (optional)').fill('Thanks for the trade nights (E2E).');
    await page.getByRole('checkbox', { name: /Thank me publicly/ }).check();
    await page.getByRole('button', { name: 'Donate $25.00' }).click();
    await expect(page).toHaveURL(/\/checkout\/fake-donation\/fake_dn_[\w-]+$/);
    await expect(page.getByTestId('local-payment-banner')).toContainText('Local test payment');
    await expect(page.getByTestId('checkout-amount')).toContainText('$25.00');
    await page.getByRole('button', { name: 'Donate $25.00' }).click();

    // Back on the support page: thanks, the history and the public supporters list.
    await expect(page).toHaveURL(/\/support\?donation=thanks$/, { timeout: 45_000 });
    await expect(page.getByTestId('donation-thanks')).toContainText('Thank you!');
    const mine = page.getByTestId('my-donation').first();
    await expect(mine).toContainText('$25.00');
    await expect(mine).toContainText('Thank you');
    await expect(mine).toContainText('thanked publicly');
    await expect(
      page.getByRole('list', { name: 'Supporters' }).getByText(displayName, { exact: true }),
    ).toBeVisible();

    // The public list never shows amounts or messages.
    const supporters = await request.get(`${API_URL}/api/v1/public/donations/supporters`);
    const text = await supporters.text();
    expect(text).toContain(displayName);
    expect(text).not.toContain('Thanks for the trade nights');
    expect(text).not.toContain('25.00');

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });

  test('an admin grants credits and edits an ad campaign; the audit log lists both', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const member = await createOnboardedCollector(request, 'granted');
    const staff = await createStaffMember(request, 'billingadmin', ['ADMIN']);
    const tag = suffix();
    try {
      await signInThroughUi(page, staff.email, staff.password);

      // Credits: grant 25 to the member from their ledger.
      await page.goto(`/admin/credits?userId=${member.id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Credits' })).toBeVisible();
      await expect(page.getByTestId('admin-credit-balance')).toHaveText('0 credits');
      await page.getByRole('button', { name: 'Grant credits' }).click();
      const grant = page.getByRole('dialog', { name: 'Grant or adjust credits' });
      await dialogSettled(page);
      await expect(grant.getByLabel('Account id')).toHaveValue(member.id);
      await grant.getByLabel('Amount').fill('25');
      await grant.getByLabel('Note').fill(`E2E goodwill credits ${tag}`);
      await grant.getByRole('button', { name: 'Grant 25 credits' }).click();
      await expect(
        page.getByText('25 credits granted. The action is in the audit log.'),
      ).toBeVisible();
      await expect(page.getByTestId('admin-credit-balance')).toHaveText('25 credits');
      await expect(page.getByTestId('admin-ledger-row').first()).toContainText(
        `E2E goodwill credits ${tag}`,
      );

      // Ads: a new advertiser and a draft campaign.
      await page.goto('/admin/ads?tab=advertisers');
      await page.getByRole('button', { name: 'New advertiser' }).click();
      const advertiserDialog = page.getByRole('dialog', { name: 'New advertiser' });
      await dialogSettled(page);
      await advertiserDialog.getByLabel('Name').fill(`E2E Advertiser ${tag}`);
      await advertiserDialog.getByRole('button', { name: 'Create advertiser' }).click();
      await expect(page.getByText(`Advertiser “E2E Advertiser ${tag}” created.`)).toBeVisible();

      await page.getByRole('tab', { name: 'Campaigns' }).click();
      await page.getByRole('button', { name: 'New campaign' }).click();
      const campaignDialog = page.getByRole('dialog', { name: 'New campaign' });
      await dialogSettled(page);
      await campaignDialog.getByLabel('Advertiser').click();
      await page.getByRole('option', { name: `E2E Advertiser ${tag}` }).click();
      await campaignDialog.getByLabel('Campaign name').fill(`E2E campaign ${tag}`);
      await campaignDialog.getByLabel('Total budget').fill('50.00');
      await campaignDialog.getByLabel('Price per 1000 views').fill('2.50');
      await campaignDialog.getByRole('button', { name: 'Create campaign' }).click();
      await expect(page).toHaveURL(/\/admin\/ads\/campaigns\/[0-9a-f-]{36}$/);
      const campaignId = page.url().split('/').pop()!;
      await expect(
        page.getByRole('heading', { level: 1, name: `E2E campaign ${tag}` }),
      ).toBeVisible();
      await expect(page.getByTestId('campaign-status')).toHaveText('Draft');

      // Edit the budget.
      await page.getByRole('button', { name: 'Edit campaign' }).click();
      const editDialog = page.getByRole('dialog', { name: 'Edit campaign' });
      await dialogSettled(page);
      await editDialog.getByLabel('Total budget').fill('75.00');
      await editDialog.getByRole('button', { name: 'Save campaign' }).click();
      await expect(
        page.getByText('The campaign is saved. The action is in the audit log.'),
      ).toBeVisible();
      await expect(page.getByTestId('campaign-budget')).toContainText('$75.00');

      // Targeting: Pokémon pages only (never coordinates).
      await page.getByRole('button', { name: 'Add rule' }).click();
      await page
        .getByRole('list', { name: 'Targeting rules' })
        .getByLabel('Value')
        .fill('45.5081, -73.5661');
      await expect(page.getByText('Coordinates are never used for targeting')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save targeting' })).toBeDisabled();
      await page.getByRole('list', { name: 'Targeting rules' }).getByLabel('Value').fill('pokemon');
      await page.getByRole('button', { name: 'Save targeting' }).click();
      await expect(page.getByText('The targeting is saved.')).toBeVisible();
      await expect(page.getByTestId('targeting-summary')).toHaveText('Shown when game is pokemon.');

      // A creative, then end the campaign so it never serves.
      await page.getByRole('button', { name: 'Add creative' }).click();
      const creative = page.getByRole('dialog', { name: 'New creative' });
      await dialogSettled(page);
      await creative.getByLabel('Headline').fill(`E2E sleeves ${tag}`);
      await creative.getByLabel('Call to action').fill('See more');
      await creative.getByLabel('Landing page').fill('/premium');
      await creative.getByRole('button', { name: 'Add creative' }).click();
      await expect(page.getByText('The creative is added.')).toBeVisible();
      await expect(page.getByRole('list', { name: 'Creatives' })).toContainText(
        `E2E sleeves ${tag}`,
      );
      await page.getByRole('button', { name: 'End campaign' }).click();
      await page
        .getByRole('dialog', { name: 'End this campaign?' })
        .getByRole('button', { name: 'End campaign' })
        .click();
      await expect(page.getByTestId('campaign-status')).toHaveText('Ended');

      // The audit log lists the campaign's writes (creatives are audited on the creative) …
      await page.getByRole('link', { name: 'Audit log', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/audit-logs\\?.*targetId=${campaignId}`));
      const entries = page.getByRole('table', { name: 'Audit entries' });
      await expect(entries.getByText('Created an ad campaign')).toBeVisible();
      await expect(entries.getByText('Changed ad targeting')).toBeVisible();
      await expect(entries.getByText('Changed an ad campaign').first()).toBeVisible();

      // … and the credit grant on the member.
      await page.goto(`/admin/audit-logs?targetId=${member.id}`);
      await expect(entries.getByText('Granted or adjusted credits')).toBeVisible();
      await expect(entries.getByText('credits.grant', { exact: true })).toBeVisible();

      // Entitlements on the member's page: an override beats the plan until revoked.
      await page.goto(`/admin/users/${member.id}`);
      const panel = page.getByRole('region', { name: 'Entitlements' });
      await panel.getByRole('button', { name: 'Grant entitlement' }).click();
      const entitlementDialog = page.getByRole('dialog', { name: /^Grant an entitlement to @/ });
      await dialogSettled(page);
      await entitlementDialog.getByLabel('Limit or feature').click();
      await page.getByRole('option', { name: 'Wishlist items' }).click();
      await entitlementDialog.getByLabel('Value').fill('unlimited');
      await entitlementDialog.getByLabel('Note').fill(`E2E override ${tag}`);
      await entitlementDialog.getByRole('button', { name: 'Grant entitlement' }).click();
      await expect(
        page.getByText('The entitlement is granted. The action is in the audit log.'),
      ).toBeVisible();
      const override = panel.getByTestId('entitlement-row').first();
      await expect(override).toContainText('Wishlist items: unlimited');
      await expect(override).toContainText('Active');
      const plan = await request.get(`${API_URL}/api/v1/me/plan`, {
        headers: authHeader(member.idToken),
      });
      const limits = (
        (await plan.json()) as {
          limits: { key: string; limit?: number | null; overridden?: boolean }[];
        }
      ).limits;
      expect(limits.find((limit) => limit.key === 'wishlist.items.max')).toMatchObject({
        overridden: true,
      });
      await override.getByRole('button', { name: /^Revoke / }).click();
      await page
        .getByRole('dialog', { name: /^Revoke / })
        .getByRole('button', { name: 'Revoke' })
        .click();
      await expect(override).toContainText('Revoked');
    } finally {
      await staff.demote();
    }
  });
});
