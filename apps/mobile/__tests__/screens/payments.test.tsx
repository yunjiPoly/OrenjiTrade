import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import CheckoutScreen from '@/app/checkout/fake/[ref]';
import DisputeScreen from '@/app/disputes/[id]';
import PayoutSettingsScreen from '@/app/settings/payouts';
import SettingsScreen from '@/app/settings/index';
import TradeScreen from '@/app/trades/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { TRADE_ID, eligibilityFixture } from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import {
  CHECKOUT_REF,
  DISPUTE_ID,
  disputeFixture,
  fakeCheckoutFixture,
  flags,
  paymentFixture,
  protectedTradeFixture,
  sellerAccountFixture,
  shipmentFixture,
} from '../support/paymentFixtures';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const port = () => new FakeAuthPort(testUser());

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/public/feature-flags': ok(flags()),
    'GET /api/v1/trades/{id}': ok(protectedTradeFixture()),
    'GET /api/v1/ratings/eligibility': ok(eligibilityFixture()),
    'GET /api/v1/me/seller-account': ok(sellerAccountFixture({ status: 'ACTIVE', ready: true })),
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('Trade with payment protection', () => {
  beforeEach(() => {
    mockParams.current = { id: TRADE_ID };
  });

  it('lets the buyer pay through the fake checkout and explains SELLER_NOT_ONBOARDED', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/trades/{id}/pay': [
          problem(409, 'SELLER_NOT_ONBOARDED', 'Not ready'),
          ok({
            paymentId: 'p1',
            tradeId: TRADE_ID,
            provider: 'fake',
            status: 'REQUIRES_ACTION',
            amount: 40,
            currency: 'CAD',
            platformFee: 2,
            sellerAmount: 38,
            checkoutUrl: `/checkout/fake/${CHECKOUT_REF}`,
          }),
        ],
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-next-title')).toHaveTextContent(
      'Your move: pay with payment protection'
    );
    const pay = await screen.findByTestId('trade-pay');
    expect(pay).toHaveTextContent(/Pay \$40\.00/);
    expect(screen.queryByTestId('trade-protected-web')).not.toBeOnTheScreen();
    expect(screen.getByTestId('trade-meetup-button')).toHaveTextContent(/Meet in person instead/);

    fireEvent.press(pay);
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /Noé Verdun has not set up payouts yet/
    );
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('trade-pay'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/checkout/fake/[ref]',
        params: { ref: CHECKOUT_REF },
      })
    );
    expect(api.callsTo('POST /api/v1/trades/{id}/pay')).toHaveLength(2);
  });

  it('hides the protected steps while the flag is off, and missing trades', async () => {
    mockApi(
      routes({ 'GET /api/v1/public/feature-flags': ok(flags({ protectedPayments: false })) })
    );
    const view = renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-protection-paused')).toHaveTextContent(
      /Payment protection is not available right now/
    );
    expect(screen.queryByTestId('trade-pay')).not.toBeOnTheScreen();
    expect(screen.getByTestId('step-paid')).toBeOnTheScreen();
    view.unmount();

    mockApi(routes({ 'GET /api/v1/trades/{id}': problem(404, 'NOT_FOUND', 'Nope') }));
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-not-found')).toBeOnTheScreen();
  });

  it('tells how the checkout ended (?payment=secured|failed)', async () => {
    mockParams.current = { id: TRADE_ID, payment: 'secured' };
    mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          protectedTradeFixture({
            status: 'PAID',
            nextAction: { actor: 'SELLER', action: 'SHIP' },
            allowedOperations: ['OPEN_DISPUTE', 'CANCEL'],
            payment: paymentFixture({ status: 'SECURED', securedAt: '2026-10-05T13:00:00Z' }),
          })
        ),
      })
    );
    const view = renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /Payment secured\. The payment provider holds it until you confirm receipt; Noé Verdun was asked to ship\./
    );
    expect(screen.getByTestId('trade-next-title')).toHaveTextContent(
      'Waiting for Noé Verdun to ship'
    );
    expect(screen.getByTestId('payment-card-status')).toHaveTextContent(/Payment secured/);
    expect(screen.getByTestId('payment-amount')).toHaveTextContent(/You pay.*\$40\.00/);
    expect(screen.getByTestId('payment-seller-amount')).toHaveTextContent(
      /Seller receives.*\$38\.00/
    );
    view.unmount();

    mockParams.current = { id: TRADE_ID, payment: 'failed' };
    mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          protectedTradeFixture({ payment: paymentFixture({ status: 'FAILED' }) })
        ),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /The payment did not go through\. Nothing was charged/
    );
    expect(screen.getByTestId('trade-next-title')).toHaveTextContent(
      'Your payment did not go through'
    );
  });

  it('reminds a seller to set up payouts while the buyer cannot pay yet', async () => {
    mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          protectedTradeFixture({
            viewerRole: 'SELLER',
            nextAction: { actor: 'BUYER', action: 'PAY' },
            allowedOperations: ['MARK_MEETUP', 'CANCEL'],
          })
        ),
        'GET /api/v1/me/seller-account': ok(sellerAccountFixture()),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('payout-setup')).toHaveTextContent(
      /Noé Verdun can pay with payment protection as soon as your payout account is ready/
    );
    expect(screen.queryByTestId('trade-pay')).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('payout-setup-open'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/settings/payouts',
      params: { returnTo: `/trades/${TRADE_ID}` },
    });
  });

  it('lets the seller mark the card as shipped with tracking', async () => {
    const shipped = protectedTradeFixture({
      viewerRole: 'SELLER',
      status: 'SHIPPED',
      nextAction: { actor: 'BUYER', action: 'CONFIRM_RECEIPT' },
      allowedOperations: [],
      payment: paymentFixture({
        status: 'SECURED',
        disputeWindowEndsAt: '2026-10-12T14:00:00Z',
      }),
      shipment: shipmentFixture(),
    });
    const api = mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          protectedTradeFixture({
            viewerRole: 'SELLER',
            status: 'PAID',
            nextAction: { actor: 'SELLER', action: 'SHIP' },
            allowedOperations: ['SHIP', 'CANCEL'],
            payment: paymentFixture({ status: 'SECURED' }),
          })
        ),
        'POST /api/v1/trades/{id}/ship': ok(shipped),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('trade-ship'));
    const dialog = screen.getByTestId('ship-dialog');
    expect(dialog).toHaveTextContent(/Ship Azure-Eyes Sky Dragon to Noé Verdun/);
    expect(screen.getByTestId('ship-tip')).toHaveTextContent(/Without tracking/);
    fireEvent.changeText(screen.getByTestId('ship-carrier'), ' Canada Post ');
    fireEvent.changeText(screen.getByTestId('ship-tracking'), 'CP123456789CA');
    expect(screen.queryByTestId('ship-tip')).not.toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('ship-notes'), 'x'.repeat(501));
    fireEvent.press(screen.getByTestId('ship-dialog-confirm'));
    expect(screen.getByText('Keep the note under 500 characters.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/trades/{id}/ship')).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('ship-notes'), '');
    fireEvent.press(screen.getByTestId('ship-dialog-confirm'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/trades/{id}/ship')[0]?.body).toEqual({
        carrier: 'Canada Post',
        trackingNumber: 'CP123456789CA',
      })
    );
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /Marked as shipped\. Noé Verdun was notified and can follow the tracking\./
    );
    expect(screen.getByTestId('shipment-tracking')).toHaveTextContent(/CP123456789CA/);
    expect(screen.getByTestId('payment-window')).toHaveTextContent(/Dispute window ends/);
  });

  it('lets the buyer confirm receipt, which releases the payout', async () => {
    const shipped = protectedTradeFixture({
      status: 'SHIPPED',
      nextAction: { actor: 'BUYER', action: 'CONFIRM_RECEIPT' },
      allowedOperations: ['CONFIRM_RECEIPT', 'OPEN_DISPUTE'],
      payment: paymentFixture({ status: 'SECURED', disputeWindowEndsAt: '2026-10-12T14:00:00Z' }),
      shipment: shipmentFixture(),
    });
    const api = mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(shipped),
        'POST /api/v1/trades/{id}/confirm-receipt': ok(
          protectedTradeFixture({
            status: 'COMPLETED',
            nextAction: { action: 'NONE' },
            allowedOperations: [],
            completedAt: '2026-10-06T10:00:00Z',
            payment: paymentFixture({
              status: 'PAID_OUT',
              payoutAmount: 38,
              payoutReleasedAt: '2026-10-06T10:00:00Z',
            }),
            shipment: shipmentFixture(),
          })
        ),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-next-title')).toHaveTextContent(
      'Your move: confirm you received the card'
    );
    expect(screen.getByTestId('trade-next-description')).toHaveTextContent(/Open a dispute before/);
    fireEvent.press(screen.getByTestId('trade-confirm-receipt'));
    expect(screen.getByTestId('receipt-dialog')).toHaveTextContent(
      /The payout \(\$38\.00\) is released to Noé Verdun/
    );
    fireEvent.press(screen.getByTestId('receipt-dialog-confirm'));
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /Receipt confirmed: the payout was released to Noé Verdun/
    );
    expect(api.callsTo('POST /api/v1/trades/{id}/confirm-receipt')).toHaveLength(1);
    expect(screen.getByTestId('trade-next-title')).toHaveTextContent('Trade completed');
    expect(screen.getByTestId('payment-payout')).toHaveTextContent(
      /Payout released to the seller.*\$38\.00/
    );
  });

  it('opens a dispute with a reason and a description, or explains the closed window', async () => {
    const shipped = protectedTradeFixture({
      status: 'SHIPPED',
      nextAction: { actor: 'BUYER', action: 'CONFIRM_RECEIPT' },
      allowedOperations: ['CONFIRM_RECEIPT', 'OPEN_DISPUTE'],
      payment: paymentFixture({ status: 'SECURED', disputeWindowEndsAt: '2026-10-12T14:00:00Z' }),
      shipment: shipmentFixture(),
    });
    const api = mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(shipped),
        'POST /api/v1/trades/{id}/disputes': [
          problem(409, 'DISPUTE_WINDOW_CLOSED', 'Closed', {
            disputeWindowEndsAt: '2026-10-12T14:00:00Z',
          }),
          ok(disputeFixture(), 201),
        ],
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('trade-open-dispute'));
    expect(screen.getByTestId('dispute-dialog')).toHaveTextContent(
      /The payout to Noé Verdun goes on hold/
    );
    fireEvent.press(screen.getByTestId('dispute-dialog-confirm'));
    expect(screen.getByTestId('dispute-reason-error')).toHaveTextContent('Choose what went wrong.');
    expect(screen.getByText('Describe what is wrong so an admin can review it.')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('dispute-reason-DAMAGED'));
    fireEvent.changeText(screen.getByTestId('dispute-description'), 'Bent');
    fireEvent.press(screen.getByTestId('dispute-dialog-confirm'));
    expect(screen.getByText('Add a few more details (at least 10 characters).')).toBeOnTheScreen();
    fireEvent.changeText(
      screen.getByTestId('dispute-description'),
      ' The card arrived with a crease across the art. '
    );
    fireEvent.press(screen.getByTestId('dispute-dialog-confirm'));
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /The dispute window closed on .*Message Noé Verdun or contact OrenjiTrade support/
    );
    expect(api.callsTo('POST /api/v1/trades/{id}/disputes')[0]?.body).toEqual({
      reason: 'DAMAGED',
      description: 'The card arrived with a crease across the art.',
    });

    fireEvent.press(screen.getByTestId('trade-open-dispute'));
    fireEvent.press(screen.getByTestId('dispute-reason-NOT_AS_DESCRIBED'));
    fireEvent.changeText(screen.getByTestId('dispute-description'), 'Wrong printing entirely.');
    fireEvent.press(screen.getByTestId('dispute-dialog-confirm'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/disputes/[id]',
        params: { id: DISPUTE_ID, opened: '1' },
      })
    );
  });

  it('shows the dispute of a disputed trade with a link to it', async () => {
    mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          protectedTradeFixture({
            status: 'DISPUTED',
            nextAction: { action: 'NONE' },
            allowedOperations: [],
            payment: paymentFixture({ status: 'SECURED', payoutFrozen: true }),
            shipment: shipmentFixture(),
            dispute: {
              id: DISPUTE_ID,
              status: 'OPEN',
              reason: 'DAMAGED',
              openedAt: '2026-10-05T15:00:00Z',
            },
          })
        ),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('dispute-card')).toHaveTextContent(/Damaged in transit/);
    expect(screen.getByTestId('payment-hold')).toHaveTextContent(/The payout is on hold/);
    fireEvent.press(screen.getByTestId('trade-view-dispute'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/disputes/[id]',
      params: { id: DISPUTE_ID },
    });
  });
});

describe('Fake payment checkout', () => {
  beforeEach(() => {
    mockParams.current = { ref: CHECKOUT_REF };
  });

  it('pays through the synthetic webhook and goes back to the trade', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/payments/fake/{ref}': [
          ok(fakeCheckoutFixture()),
          ok(fakeCheckoutFixture({ status: 'SECURED' })),
        ],
        'POST /api/v1/payments/fake/{ref}/confirm': ok({ received: true }, 202),
      })
    );
    renderWithProviders(<CheckoutScreen />, { port: port() });
    expect(screen.getByTestId('local-payment-banner')).toHaveTextContent(/Local test payment/);
    expect(await screen.findByTestId('checkout-amount')).toHaveTextContent('$40.00');
    expect(screen.getByTestId('checkout-heading')).toHaveTextContent(
      'Azure-Eyes Silver Dragon from Noé Verdun'
    );
    expect(screen.getByTestId('checkout-status')).toHaveTextContent(/Waiting for payment/);
    expect(screen.getByTestId('protection-explainer-steps')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('checkout-pay'));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/trades/[id]',
        params: { id: TRADE_ID, payment: 'secured' },
      })
    );
    expect(api.callsTo('POST /api/v1/payments/fake/{ref}/confirm')[0]?.body).toEqual({
      outcome: 'SUCCEEDED',
    });
  });

  it('simulates a declined payment', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/payments/fake/{ref}': [
          ok(fakeCheckoutFixture()),
          ok(fakeCheckoutFixture({ status: 'FAILED' })),
        ],
        'POST /api/v1/payments/fake/{ref}/confirm': ok({ received: true }, 202),
      })
    );
    renderWithProviders(<CheckoutScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('checkout-decline'));
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith({
        pathname: '/trades/[id]',
        params: { id: TRADE_ID, payment: 'failed' },
      })
    );
    expect(api.callsTo('POST /api/v1/payments/fake/{ref}/confirm')[0]?.body).toEqual({
      outcome: 'FAILED',
    });
  });

  it('shows a paid checkout as done, a stranger not-found, and an error with retry', async () => {
    mockApi(
      routes({ 'GET /api/v1/payments/fake/{ref}': ok(fakeCheckoutFixture({ status: 'SECURED' })) })
    );
    let view = renderWithProviders(<CheckoutScreen />, { port: port() });
    expect(await screen.findByTestId('checkout-outcome')).toHaveTextContent(
      /This payment is secured/
    );
    expect(screen.queryByTestId('checkout-pay')).not.toBeOnTheScreen();
    view.unmount();

    mockApi(routes({ 'GET /api/v1/payments/fake/{ref}': problem(404, 'NOT_FOUND', 'Nope') }));
    view = renderWithProviders(<CheckoutScreen />, { port: port() });
    expect(await screen.findByTestId('checkout-not-found')).toBeOnTheScreen();
    view.unmount();

    mockApi(
      routes({
        'GET /api/v1/payments/fake/{ref}': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(fakeCheckoutFixture()),
        ],
      })
    );
    renderWithProviders(<CheckoutScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('checkout-pay')).toBeOnTheScreen();
  });
});

describe('Dispute', () => {
  beforeEach(() => {
    mockParams.current = { id: DISPUTE_ID };
  });

  it('shows the dispute, adds a statement and posts a message', async () => {
    mockParams.current = { id: DISPUTE_ID, opened: '1' };
    const withMessage = disputeFixture({
      messages: [
        ...disputeFixture().messages,
        {
          id: 'm-new',
          authorRole: 'BUYER',
          authorName: 'Maïka Test',
          body: 'Here is what I received.',
          createdAt: '2026-10-05T16:00:00Z',
        },
      ],
    });
    let posted = false;
    const api = mockApi(
      routes({
        // The dispute as the API reads it again after each change.
        'GET /api/v1/disputes/{id}': () => ok(posted ? withMessage : disputeFixture()),
        'POST /api/v1/disputes/{id}/evidence': ok(
          {
            id: 'e-new',
            kind: 'TEXT',
            role: 'BUYER',
            body: 'The sleeve was empty.',
            createdAt: '2026-10-05T16:00:00Z',
          },
          201
        ),
        'POST /api/v1/disputes/{id}/messages': () => {
          posted = true;
          return ok(withMessage.messages[1], 201);
        },
      })
    );
    renderWithProviders(<DisputeScreen />, { port: port() });
    expect(await screen.findByTestId('dispute-notice')).toHaveTextContent(
      /Dispute opened\. The payout to Noé Verdun is on hold/
    );
    expect(screen.getByTestId('dispute-reason')).toHaveTextContent('Damaged in transit');
    expect(screen.getByTestId('dispute-status')).toHaveTextContent(/Open/);
    expect(screen.getByTestId('dispute-payout-hold')).toBeOnTheScreen();
    expect(screen.getByTestId('dispute-fact-buyer')).toHaveTextContent(
      /Maïka Test \(@maika\) · you/
    );
    expect(screen.getByTestId('dispute-fact-tracking')).toHaveTextContent(/CP123456789CA/);
    expect(screen.getAllByTestId('evidence-item')).toHaveLength(1);
    expect(
      within(screen.getByTestId('dispute-timeline')).getByText(
        'You opened the dispute: Damaged in transit'
      )
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('evidence-mode-statement'));
    fireEvent.press(screen.getByTestId('evidence-add'));
    expect(screen.getByText('Write what you want the admin to know.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('evidence-statement'), 'The sleeve was empty.');
    fireEvent.press(screen.getByTestId('evidence-add'));
    expect(await screen.findByTestId('dispute-notice')).toHaveTextContent(
      /Statement added\. Noé Verdun and OrenjiTrade can see it\./
    );
    expect(api.callsTo('POST /api/v1/disputes/{id}/evidence')[0]?.body).toEqual({
      kind: 'TEXT',
      body: 'The sleeve was empty.',
    });

    fireEvent.press(screen.getByTestId('dispute-message-send'));
    expect(screen.getByText('Write a message first.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('dispute-message-input'), 'Here is what I received.');
    fireEvent.press(screen.getByTestId('dispute-message-send'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/disputes/{id}/messages')[0]?.body).toEqual({
        body: 'Here is what I received.',
      })
    );
    expect(await screen.findByText('Here is what I received.')).toBeOnTheScreen();
  });

  it('adds a photo from the library and explains the evidence limit', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///crease.jpg',
          mimeType: 'image/jpeg',
          fileName: 'crease.jpg',
          fileSize: 240_000,
          width: 800,
          height: 600,
        },
      ],
    } as never);
    const api = mockApi(
      routes({
        'GET /api/v1/disputes/{id}': ok(disputeFixture()),
        'POST /api/v1/disputes/{id}/evidence': problem(409, 'EVIDENCE_LIMIT_REACHED', 'Full', {
          limit: 10,
        }),
      })
    );
    renderWithProviders(<DisputeScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('evidence-pick'));
    expect(await screen.findByTestId('evidence-preview')).toHaveTextContent(/crease\.jpg/);
    expect(screen.getByTestId('evidence-preview')).toHaveTextContent(/234 KB/);
    fireEvent.changeText(screen.getByTestId('evidence-caption'), 'Crease under a lamp');
    fireEvent.press(screen.getByTestId('evidence-add'));
    expect(await screen.findByTestId('dispute-notice')).toHaveTextContent(
      /You already added 10 pieces of evidence/
    );
    expect(api.callsTo('POST /api/v1/disputes/{id}/evidence')).toHaveLength(1);
  });

  it('refuses unsupported photos and a denied permission', async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    mockApi(routes({ 'GET /api/v1/disputes/{id}': ok(disputeFixture()) }));
    renderWithProviders(<DisputeScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('evidence-pick'));
    expect(await screen.findByTestId('evidence-problem')).toHaveTextContent(
      /Allow access to your photos to add one\./
    );
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif', fileSize: 100 }],
    } as never);
    fireEvent.press(screen.getByTestId('evidence-pick'));
    await waitFor(() =>
      expect(screen.getByTestId('evidence-problem')).toHaveTextContent(
        /Use a photo \(JPEG, PNG or WebP\)\./
      )
    );
  });

  it('closes evidence and messages while on hold, shows a decision, and not-found', async () => {
    mockApi(
      routes({
        'GET /api/v1/disputes/{id}': ok(
          disputeFixture({ status: 'FROZEN', canAddEvidence: false, canPostMessage: false })
        ),
      })
    );
    let view = renderWithProviders(<DisputeScreen />, { port: port() });
    expect(await screen.findByTestId('dispute-hold')).toBeOnTheScreen();
    expect(screen.getByTestId('dispute-evidence-closed')).toHaveTextContent(/on hold/);
    expect(screen.getByTestId('dispute-thread-closed')).toHaveTextContent(/on hold/);
    expect(screen.queryByTestId('evidence-composer')).not.toBeOnTheScreen();
    view.unmount();

    mockApi(
      routes({
        'GET /api/v1/disputes/{id}': ok(
          disputeFixture({
            status: 'RESOLVED_BUYER',
            resolvedAt: '2026-10-07T10:00:00Z',
            refundAmount: 40,
            resolutionNote: 'The photos show transit damage.',
            canAddEvidence: false,
            canPostMessage: false,
          })
        ),
      })
    );
    view = renderWithProviders(<DisputeScreen />, { port: port() });
    expect(await screen.findByTestId('dispute-decision')).toHaveTextContent(
      /Resolved for the buyer.*Refund to the buyer: \$40\.00.*The photos show transit damage/
    );
    expect(screen.getByTestId('dispute-thread-closed')).toHaveTextContent(/decided/);
    view.unmount();

    mockApi(routes({ 'GET /api/v1/disputes/{id}': problem(404, 'NOT_FOUND', 'Nope') }));
    renderWithProviders(<DisputeScreen />, { port: port() });
    expect(await screen.findByTestId('dispute-not-found')).toBeOnTheScreen();
  });
});

describe('Settings → Payouts', () => {
  it('sets up payouts with the fake provider and returns to the trade', async () => {
    mockParams.current = { returnTo: `/trades/${TRADE_ID}` };
    const api = mockApi(
      routes({
        'GET /api/v1/me/seller-account': ok(sellerAccountFixture()),
        'POST /api/v1/me/seller-account/onboarding': ok({
          url: `/settings/payouts?returnTo=%2Ftrades%2F${TRADE_ID}&onboarding=complete`,
          account: sellerAccountFixture({ status: 'ACTIVE', ready: true, payoutsEnabled: true }),
        }),
      })
    );
    const view = renderWithProviders(<PayoutSettingsScreen />, { port: port() });
    expect(await screen.findByTestId('payout-status')).toHaveTextContent(/Not set up/);
    expect(screen.getByTestId('payouts-local')).toHaveTextContent(/Local test provider/);
    fireEvent.press(screen.getByTestId('payouts-start'));
    await waitFor(() =>
      expect(mockRouter.setParams).toHaveBeenCalledWith({
        returnTo: `/trades/${TRADE_ID}`,
        onboarding: 'complete',
      })
    );
    expect(api.callsTo('POST /api/v1/me/seller-account/onboarding')[0]?.body).toEqual({
      returnUrl: `/settings/payouts?returnTo=${encodeURIComponent(`/trades/${TRADE_ID}`)}`,
    });
    expect(await screen.findByTestId('payout-status')).toHaveTextContent(/Ready for payouts/);
    expect(screen.queryByTestId('payouts-start')).not.toBeOnTheScreen();
    view.unmount();

    mockParams.current = { returnTo: `/trades/${TRADE_ID}`, onboarding: 'complete' };
    mockApi(
      routes({
        'GET /api/v1/me/seller-account': ok(
          sellerAccountFixture({ status: 'ACTIVE', ready: true, payoutsEnabled: true })
        ),
      })
    );
    renderWithProviders(<PayoutSettingsScreen />, { port: port() });
    expect(await screen.findByTestId('payouts-complete')).toHaveTextContent(/Payouts are set up/);
    fireEvent.press(screen.getByTestId('payouts-back-to-trade'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(`/trades/${TRADE_ID}`);
  });

  it('explains a switched-off feature and retries an error', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/seller-account': problem(404, 'FEATURE_DISABLED', 'Off'),
      })
    );
    const view = renderWithProviders(<PayoutSettingsScreen />, { port: port() });
    expect(await screen.findByTestId('payouts-disabled')).toHaveTextContent(/nothing to set up/);
    view.unmount();

    mockApi(
      routes({
        'GET /api/v1/me/seller-account': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(sellerAccountFixture({ status: 'PENDING' })),
        ],
      })
    );
    renderWithProviders(<PayoutSettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('payouts-start')).toHaveTextContent(/Continue the setup/);
  });

  it('lists Payouts in Settings only while payment protection is on', async () => {
    mockApi(routes());
    const view = renderWithProviders(<SettingsScreen />, { port: port() });
    expect(await screen.findByTestId('settings-link-payouts')).toBeOnTheScreen();
    view.unmount();
    mockApi(
      routes({ 'GET /api/v1/public/feature-flags': ok(flags({ protectedPayments: false })) })
    );
    renderWithProviders(<SettingsScreen />, { port: port() });
    expect(await screen.findByTestId('settings-link-offers')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings-link-payouts')).not.toBeOnTheScreen();
  });
});
