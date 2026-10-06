import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import BillingCheckoutScreen from '@/app/checkout/fake-billing/[ref]';
import DonationCheckoutScreen from '@/app/checkout/fake-donation/[ref]';
import CollectorScreen from '@/app/collectors/[id]';
import CreditsScreen from '@/app/credits';
import PremiumScreen from '@/app/premium';
import SupportScreen from '@/app/support';
import { resetRecordedImpressions } from '@/src/api/hooks/billing';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { ApiError } from '@/src/api/ApiError';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  collectorFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import {
  PLANS,
  adFixture,
  billingCheckoutFixture,
  creditEntryFixture,
  creditsFixture,
  donationCheckoutFixture,
  donationFixture,
  flags,
  freePlanFixture,
  premiumPlanFixture,
  referralFixture,
  subscriptionFixture,
  supportersFixture,
} from '../support/paymentFixtures';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => 'native' }));

const port = () => new FakeAuthPort(testUser());

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/public/feature-flags': ok(flags()),
    'GET /api/v1/plans': ok(PLANS),
    'GET /api/v1/me/plan': ok(freePlanFixture()),
    'GET /api/v1/me/credits': ok(creditsFixture()),
    'GET /api/v1/me/referrals': ok(referralFixture()),
    'GET /api/v1/me/donations': ok([donationFixture()]),
    'GET /api/v1/public/donations/supporters': ok(supportersFixture()),
    'GET /api/v1/ads': ok([]),
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  resetRecordedImpressions();
});

describe('Premium', () => {
  it('compares the plans and opens the fake billing checkout', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/me/subscription/checkout': [
          problem(409, 'ALREADY_SUBSCRIBED', 'Live', { currentStatus: 'PENDING' }),
          ok({
            subscription: subscriptionFixture({ status: 'PENDING' }),
            url: '/checkout/fake-billing/fake_cs_test01',
            resumed: false,
          }),
        ],
      })
    );
    renderWithProviders(<PremiumScreen />, { port: port() });
    expect(await screen.findByTestId('plan-PREMIUM')).toHaveTextContent(/Most popular/);
    expect(screen.getByTestId('plan-FREE-badge')).toHaveTextContent('Your plan');
    expect(screen.getByTestId('plan-PREMIUM-price')).toHaveTextContent(/\$4\.99/);
    expect(screen.getByTestId('plan-FREE')).toHaveTextContent(/Sponsored placements shown/);
    expect(screen.getByTestId('plan-PREMIUM')).toHaveTextContent(/No ads/);
    expect(await screen.findByTestId('usage-binders.max')).toHaveTextContent(/Binders.*5 \/ 5/);
    expect(screen.getByTestId('premium-credits')).toHaveTextContent(/Only need it for a day\?/);

    fireEvent.press(screen.getByTestId('plan-PREMIUM-upgrade'));
    expect(await screen.findByTestId('premium-problem')).toHaveTextContent(
      /You already have a subscription \(checkout open\)/
    );
    fireEvent.press(screen.getByTestId('plan-PREMIUM-upgrade'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/checkout/fake-billing/[ref]',
        params: { ref: 'fake_cs_test01' },
      })
    );
    expect(api.callsTo('POST /api/v1/me/subscription/checkout')[1]?.body).toEqual({
      planCode: 'PREMIUM',
    });
  });

  it('welcomes a new member and cancels at the period end after a confirmation', async () => {
    mockParams.current = { checkout: 'success' };
    const api = mockApi(
      routes({
        'GET /api/v1/me/plan': ok(premiumPlanFixture()),
        'POST /api/v1/me/subscription/cancel': ok(subscriptionFixture({ cancelAtPeriodEnd: true })),
      })
    );
    renderWithProviders(<PremiumScreen />, { port: port() });
    expect(await screen.findByTestId('premium-welcome')).toHaveTextContent(/Welcome to Premium!/);
    expect(screen.getByTestId('subscription-text')).toHaveTextContent(
      /Premium renews automatically every month/
    );
    expect(screen.getByTestId('subscription-status')).toHaveTextContent(/Active/);
    expect(screen.getByTestId('plan-PREMIUM-current')).toBeOnTheScreen();
    expect(screen.queryByTestId('premium-credits')).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('subscription-cancel-end'));
    expect(screen.getByTestId('subscription-dialog')).toHaveTextContent(
      /Cancel Premium at the end of the period\?/
    );
    fireEvent.press(screen.getByTestId('subscription-dialog-confirm'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Premium is cancelled and ends on/
    );
    expect(api.callsTo('POST /api/v1/me/subscription/cancel')[0]?.body).toEqual({
      atPeriodEnd: true,
    });
  });

  it('continues or closes an open checkout', async () => {
    const pending = subscriptionFixture({
      status: 'PENDING',
      checkoutUrl: '/checkout/fake-billing/fake_cs_test01',
      failureCode: 'card_declined',
      activatedAt: undefined,
    });
    const api = mockApi(
      routes({
        'GET /api/v1/me/plan': ok(freePlanFixture({ subscription: pending })),
        'POST /api/v1/me/subscription/cancel': ok({ ...pending, status: 'CANCELLED' }),
      })
    );
    renderWithProviders(<PremiumScreen />, { port: port() });
    expect(await screen.findByTestId('subscription-text')).toHaveTextContent(
      /the last payment attempt was declined/
    );
    fireEvent.press(screen.getByTestId('plan-PREMIUM-continue'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/checkout/fake-billing/[ref]',
      params: { ref: 'fake_cs_test01' },
    });
    fireEvent.press(screen.getByTestId('subscription-close'));
    expect(screen.getByTestId('subscription-dialog')).toHaveTextContent(
      /Close the open checkout\?/
    );
    fireEvent.press(screen.getByTestId('subscription-dialog-confirm'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('The checkout is closed.');
    expect(api.callsTo('POST /api/v1/me/subscription/cancel')[0]?.body).toEqual({
      atPeriodEnd: false,
    });
  });

  it('is not available while premium plans are off, and retries plans that failed', async () => {
    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok(flags({ premiumPlans: false })) }));
    const view = renderWithProviders(<PremiumScreen />, { port: port() });
    expect(await screen.findByTestId('premium-unavailable')).toHaveTextContent(
      /Premium is not available yet/
    );
    view.unmount();

    mockApi(routes({ 'GET /api/v1/plans': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(PLANS)] }));
    renderWithProviders(<PremiumScreen />, { port: port() });
    const plansError = await screen.findByTestId('plans-error');
    fireEvent.press(within(plansError).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('plan-PREMIUM-upgrade')).toBeOnTheScreen();
  });
});

describe('Fake billing checkout', () => {
  beforeEach(() => {
    mockParams.current = { ref: 'fake_cs_test01' };
  });

  it('keeps a declined subscription open, then pays and welcomes the member', async () => {
    let attempt = 0;
    const api = mockApi(
      routes({
        'GET /api/v1/billing/fake/{ref}': () =>
          ok(
            attempt === 0
              ? billingCheckoutFixture()
              : attempt === 1
                ? billingCheckoutFixture({ failureCode: 'card_declined' })
                : billingCheckoutFixture({ status: 'ACTIVE' })
          ),
        'POST /api/v1/billing/fake/{ref}/confirm': () => {
          attempt++;
          return ok({ received: true }, 202);
        },
      })
    );
    renderWithProviders(<BillingCheckoutScreen />, { port: port() });
    expect(await screen.findByTestId('checkout-amount')).toHaveTextContent(/\$4\.99.*per month/);
    expect(screen.getByTestId('checkout-heading')).toHaveTextContent('Premium subscription');
    fireEvent.press(screen.getByTestId('checkout-decline'));
    expect(await screen.findByTestId('checkout-outcome')).toHaveTextContent(
      /The payment was declined\. Nothing was charged\./
    );
    fireEvent.press(screen.getByTestId('checkout-try-again'));
    expect(await screen.findByTestId('checkout-note')).toHaveTextContent(
      /The last attempt was declined/
    );
    fireEvent.press(screen.getByTestId('checkout-pay'));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/premium',
        params: { checkout: 'success' },
      })
    );
    expect(api.callsTo('POST /api/v1/billing/fake/{ref}/confirm').map((call) => call.body)).toEqual(
      [{ outcome: 'FAILED' }, { outcome: 'SUCCEEDED' }]
    );
  });

  it('shows not-found for another member’s checkout', async () => {
    mockApi(routes({ 'GET /api/v1/billing/fake/{ref}': problem(404, 'NOT_FOUND', 'Nope') }));
    renderWithProviders(<BillingCheckoutScreen />, { port: port() });
    expect(await screen.findByTestId('checkout-not-found')).toBeOnTheScreen();
  });
});

describe('Credits', () => {
  it('shows the balance, unlocks a product with an idempotency key, and the ledger', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/me/credits': [
          ok(
            creditsFixture({
              entries: { items: [creditEntryFixture()], nextCursor: 'c2', hasMore: true },
            })
          ),
          ok(
            creditsFixture({
              entries: {
                items: [
                  creditEntryFixture({
                    id: 'e-old',
                    amount: 100,
                    balanceAfter: 100,
                    type: 'EARN',
                    reason: 'REFERRAL',
                  }),
                ],
                nextCursor: null,
                hasMore: false,
              },
            })
          ),
        ],
        'POST /api/v1/me/credits/spend': [
          problem(409, 'INSUFFICIENT_CREDITS', 'Short', { balance: 20, cost: 50 }),
          ok({
            entry: creditEntryFixture({ id: 'e-spend', amount: -50, type: 'SPEND' }),
            balance: 150,
            entitlement: { expiresAt: '2026-10-06T12:00:00Z' },
          }),
        ],
      })
    );
    renderWithProviders(<CreditsScreen />, { port: port() });
    expect(screen.getByTestId('credits-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('credit-balance')).toHaveTextContent(/200.*credits/);
    expect(screen.getByTestId('credit-balance-card')).toHaveTextContent(
      /never withdrawable or transferable/
    );
    expect(screen.getByTestId('product-premium_search_day')).toHaveTextContent(
      /You need 300 credits more\./
    );
    expect(screen.getAllByTestId('ledger-entry')).toHaveLength(1);
    expect(screen.getAllByTestId('ledger-amount')[0]).toHaveTextContent('+200');

    fireEvent.press(screen.getByTestId('product-map_radius_day-unlock'));
    expect(screen.getByTestId('spend-dialog')).toHaveTextContent(/Unlock Wider map for a day\?/);
    expect(screen.getByTestId('spend-cost')).toHaveTextContent(/50 credits/);
    fireEvent.press(screen.getByTestId('spend-dialog-confirm'));
    expect(await screen.findByTestId('spend-problem')).toHaveTextContent(
      /You have 20 credits and this costs 50 credits\./
    );
    fireEvent.press(screen.getByTestId('spend-dialog-confirm'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Wider map for a day unlocked until .*Balance: 150 credits\./
    );
    const spends = api.callsTo('POST /api/v1/me/credits/spend');
    expect(spends).toHaveLength(2);
    // The same key for both attempts of one dialog: a retry never spends twice.
    expect(spends[0]?.body).toEqual(spends[1]?.body);
    expect((spends[0]?.body as { featureKey: string }).featureKey).toBe('map_radius_day');
    expect((spends[0]?.body as { idempotencyKey: string }).idempotencyKey).toMatch(/^spend:/);
  });

  it('loads older ledger entries on demand', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/credits': (request) =>
          ok(
            request.query.get('cursor') === 'c2'
              ? creditsFixture({
                  entries: {
                    items: [creditEntryFixture({ id: 'e-old', reason: 'REFERRAL', type: 'EARN' })],
                    nextCursor: null,
                    hasMore: false,
                  },
                })
              : creditsFixture({
                  entries: { items: [creditEntryFixture()], nextCursor: 'c2', hasMore: true },
                })
          ),
      })
    );
    renderWithProviders(<CreditsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('ledger-more'));
    await waitFor(() => expect(screen.getAllByTestId('ledger-entry')).toHaveLength(2));
    expect(screen.getByText('Referral reward')).toBeOnTheScreen();
    expect(screen.queryByTestId('ledger-more')).not.toBeOnTheScreen();
  });

  it('redeems a referral code and explains a refusal on the field', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/me/referrals/redeem': [
          problem(409, 'REFERRAL_NOT_ALLOWED', 'No', { reason: 'SELF' }),
          ok({ redemptionId: 'r1', reward: 50, referrerReward: 100, balance: 250 }),
        ],
      })
    );
    renderWithProviders(<CreditsScreen />, { port: port() });
    expect(await screen.findByTestId('referral-code')).toHaveTextContent('MAIKA42');
    fireEvent.press(screen.getByTestId('referral-redeem'));
    expect(screen.getByText('Enter the code another collector shared with you.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('referral-input'), 'MAIKA42');
    fireEvent.press(screen.getByTestId('referral-redeem'));
    expect(
      await screen.findByText('This is your own code: share it with other collectors instead.')
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('referral-input'), 'NOE-2026');
    fireEvent.press(screen.getByTestId('referral-redeem'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Code redeemed: you earned 50 credits/
    );
    expect(api.callsTo('POST /api/v1/me/referrals/redeem')[1]?.body).toEqual({ code: 'NOE-2026' });
  });

  it('is unavailable while credits are off, and shows an error with retry', async () => {
    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok(flags({ credits: false })) }));
    const view = renderWithProviders(<CreditsScreen />, { port: port() });
    expect(await screen.findByTestId('credits-disabled')).toBeOnTheScreen();
    view.unmount();

    mockApi(
      routes({
        'GET /api/v1/me/credits': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(creditsFixture())],
      })
    );
    renderWithProviders(<CreditsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('credit-balance')).toBeOnTheScreen();
  });
});

describe('Support OrenjiTrade', () => {
  it('donates a preset amount through the fake donation checkout', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/donations/checkout': ok({
          donation: donationFixture({ status: 'PENDING' }),
          url: '/checkout/fake-donation/fake_dn_test01',
        }),
      })
    );
    renderWithProviders(<SupportScreen />, { port: port() });
    expect(screen.getByTestId('voluntary-label')).toHaveTextContent(/Voluntary support/);
    expect(await screen.findByTestId('supporter')).toHaveTextContent(/Noé Verdun.*October 2026/);
    expect(await screen.findByTestId('my-donation')).toHaveTextContent(
      /\$10\.00.*thanked publicly/
    );
    fireEvent.press(screen.getByTestId('donation-preset-25'));
    fireEvent.changeText(screen.getByTestId('donation-message'), ' Keep it up! ');
    fireEvent.press(screen.getByTestId('donation-public-thanks'));
    expect(screen.getByTestId('donation-submit')).toHaveTextContent(/Donate \$25\.00/);
    fireEvent.press(screen.getByTestId('donation-submit'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/checkout/fake-donation/[ref]',
        params: { ref: 'fake_dn_test01' },
      })
    );
    expect(api.callsTo('POST /api/v1/donations/checkout')[0]?.body).toEqual({
      amount: 25,
      currency: 'CAD',
      message: 'Keep it up!',
      publicThanks: true,
    });
  });

  it('validates a custom amount and shows the API range on the field', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/donations/checkout': problem(400, 'VALIDATION_FAILED', 'Invalid', {
          fieldErrors: [{ field: 'amount', message: 'must be between 2.00 and 500.00' }],
        }),
      })
    );
    renderWithProviders(<SupportScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('donation-preset-other'));
    fireEvent.press(screen.getByTestId('donation-submit'));
    expect(screen.getByText('Enter an amount.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('donation-custom-amount'), '7.555');
    fireEvent.press(screen.getByTestId('donation-submit'));
    expect(
      screen.getByText('Enter a positive amount with at most two decimals.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/donations/checkout')).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('donation-custom-amount'), '1,5');
    fireEvent.press(screen.getByTestId('donation-submit'));
    expect(await screen.findByTestId('donation-problem')).toHaveTextContent(
      /Check the amount and the currency\./
    );
    expect(api.callsTo('POST /api/v1/donations/checkout')[0]?.body).toMatchObject({ amount: 1.5 });
  });

  it('thanks the donor and is unavailable while donations are off', async () => {
    mockParams.current = { donation: 'thanks' };
    mockApi(
      routes({
        'GET /api/v1/public/donations/supporters': ok(supportersFixture({ supporters: [] })),
      })
    );
    const view = renderWithProviders(<SupportScreen />, { port: port() });
    expect(await screen.findByTestId('donation-thanks')).toHaveTextContent(/Thank you!/);
    expect(await screen.findByTestId('supporters-empty')).toBeOnTheScreen();
    view.unmount();

    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok(flags({ donations: false })) }));
    renderWithProviders(<SupportScreen />, { port: port() });
    expect(await screen.findByTestId('support-disabled')).toBeOnTheScreen();
  });

  it('pays a donation checkout and goes back to Support', async () => {
    mockParams.current = { ref: 'fake_dn_test01' };
    mockApi(
      routes({
        'GET /api/v1/donations/fake/{ref}': [
          ok(donationCheckoutFixture()),
          ok(donationCheckoutFixture({ status: 'SUCCEEDED' })),
        ],
        'POST /api/v1/donations/fake/{ref}/confirm': ok({ received: true }, 202),
      })
    );
    renderWithProviders(<DonationCheckoutScreen />, { port: port() });
    expect(await screen.findByTestId('checkout-pay')).toHaveTextContent(/Donate \$10\.00/);
    fireEvent.press(screen.getByTestId('checkout-pay'));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/support',
        params: { donation: 'thanks' },
      })
    );
  });
});

describe('Sponsored placements', () => {
  const collectorRoutes = (extra: MockRoutes = {}) =>
    routes({
      'GET /api/v1/collectors/{handle}/binders': ok([publicBinderSummaryFixture()]),
      'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([publicItemFixture()])),
      'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture()),
      'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
      'GET /api/v1/collectors/{handle}': ok(
        collectorFixture({ id: '00000000-0000-4000-8000-0000000000b1', handle: 'collector2' })
      ),
      ...extra,
    });

  it('labels the ad "Sponsored", records one impression and opens the click route', async () => {
    mockParams.current = { id: 'collector2' };
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const api = mockApi(
      collectorRoutes({
        'GET /api/v1/ads': ok([adFixture()]),
        'POST /api/v1/ads/{creativeId}/impression': { status: 204 },
      })
    );
    renderWithProviders(<CollectorScreen />, { port: port() });
    const ad = await screen.findByTestId('sponsored-ad');
    expect(within(ad).getByTestId('sponsored-label')).toHaveTextContent('Sponsored');
    expect(ad).toHaveTextContent(/Sleeves that survive every trade/);
    expect(within(ad).getByTestId('sponsored-remove-ads')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/ads')[0]?.query.get('placement')).toBe('COLLECTOR_PROFILE');
    fireEvent(ad, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    fireEvent(ad, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } });
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/ads/{creativeId}/impression')).toHaveLength(1)
    );
    expect(api.callsTo('POST /api/v1/ads/{creativeId}/impression')[0]?.body).toEqual({
      token: 'tok-1',
    });
    fireEvent.press(within(ad).getByTestId('sponsored-link'));
    expect(open).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/ads/00000000-0000-4000-a300-000000000001/click?token=tok-1'
    );
    fireEvent.press(within(ad).getByTestId('sponsored-remove-ads'));
    expect(mockRouter.push).toHaveBeenCalledWith('/premium');
    open.mockRestore();
  });

  it('shows nothing while advertising is off, for Premium ([]), on the own profile or unsafe links', async () => {
    mockParams.current = { id: 'collector2' };
    const api = mockApi(
      collectorRoutes({
        'GET /api/v1/public/feature-flags': ok(flags({ advertising: false })),
        'GET /api/v1/ads': ok([adFixture()]),
      })
    );
    let view = renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('collector-about')).toBeOnTheScreen();
    expect(screen.queryByTestId('sponsored-ad')).not.toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/ads')).toHaveLength(0);
    view.unmount();

    mockApi(
      collectorRoutes({ 'GET /api/v1/ads': ok([adFixture({ clickUrl: 'javascript:alert(1)' })]) })
    );
    view = renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('collector-about')).toBeOnTheScreen();
    expect(screen.queryByTestId('sponsored-ad')).not.toBeOnTheScreen();
    view.unmount();

    mockParams.current = { id: 'maika' };
    const own = mockApi(
      collectorRoutes({
        'GET /api/v1/collectors/{handle}': ok(collectorFixture()),
        'GET /api/v1/ads': ok([adFixture()]),
      })
    );
    renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('public-preview-banner')).toBeOnTheScreen();
    expect(screen.queryByTestId('sponsored-ad')).not.toBeOnTheScreen();
    expect(own.callsTo('GET /api/v1/ads')).toHaveLength(0);
  });
});

describe('Entry points', () => {
  it('lists Premium, Credits and Support in the Profile tab only while their flags are on', async () => {
    mockApi(routes());
    const view = renderWithProviders(<ProfileScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('profile-premium'));
    expect(mockRouter.push).toHaveBeenCalledWith('/premium');
    fireEvent.press(screen.getByTestId('profile-credits'));
    expect(mockRouter.push).toHaveBeenCalledWith('/credits');
    fireEvent.press(screen.getByTestId('profile-support'));
    expect(mockRouter.push).toHaveBeenCalledWith('/support');
    view.unmount();

    mockApi(
      routes({
        'GET /api/v1/public/feature-flags': ok(
          flags({ premiumPlans: false, credits: false, donations: false })
        ),
      })
    );
    renderWithProviders(<ProfileScreen />, { port: port() });
    expect(await screen.findByTestId('profile-trades')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-premium')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('profile-credits')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('profile-support')).not.toBeOnTheScreen();
  });

  it('leads a reached plan limit to Premium while premium plans are sold', async () => {
    const limit = new ApiError({
      status: 429,
      errorCode: 'LIMIT_REACHED',
      message: 'Limit',
      problem: { limitKey: 'binders.max', limit: 5, used: 5, planCode: 'FREE' },
    });
    mockApi(routes());
    const view = renderWithProviders(<LimitReachedNotice error={limit} />, { port: port() });
    fireEvent.press(await screen.findByTestId('limit-reached-premium'));
    expect(mockRouter.push).toHaveBeenCalledWith('/premium');
    view.unmount();

    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok(flags({ premiumPlans: false })) }));
    renderWithProviders(<LimitReachedNotice error={limit} />, { port: port() });
    expect(await screen.findByTestId('limit-reached-message')).toHaveTextContent(
      /You have used 5 of 5 binders on the Free plan/
    );
    await waitFor(() =>
      expect(screen.queryByTestId('limit-reached-premium')).not.toBeOnTheScreen()
    );
  });
});
