import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import TradeScreen from '@/app/trades/[id]';
import TradesScreen from '@/app/trades/index';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  OFFER_ID,
  OTHER_ID,
  TRADE_ID,
  eligibilityFixture,
  tradeFixture,
  tradePage,
  tradeSummaryFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const port = () => new FakeAuthPort(testUser());

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/trades': ok(tradePage()),
    'GET /api/v1/trades/{id}': ok(tradeFixture()),
    'GET /api/v1/ratings/eligibility': ok(eligibilityFixture()),
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('Trades list', () => {
  it('lists trades with the next move and filters by status', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/trades': ok(
          tradePage([
            tradeSummaryFixture(),
            tradeSummaryFixture({
              id: 't-done',
              status: 'COMPLETED',
              meetup: true,
              nextAction: { action: 'NONE' },
            }),
          ])
        ),
      })
    );
    renderWithProviders(<TradesScreen />, { port: port() });
    expect(screen.getByTestId('trades-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId(`trade-row-next-${TRADE_ID}`)).toHaveTextContent(
      'Your move: meet and confirm'
    );
    expect(screen.getByTestId('trade-row-next-t-done')).toHaveTextContent('Completed');
    expect(screen.getByTestId('trade-row-t-done')).toHaveTextContent(/In-person meetup/);
    expect(api.callsTo('GET /api/v1/trades')[0]?.query.getAll('status')).toEqual([]);
    fireEvent.press(screen.getByTestId(`trade-row-${TRADE_ID}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trades/[id]',
      params: { id: TRADE_ID },
    });
    fireEvent.press(screen.getByTestId('trades-filter-completed'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ status: 'completed' });
  });

  it('shows the empty states and an error with retry', async () => {
    mockParams.current = { status: 'active' };
    const api = mockApi(
      routes({
        'GET /api/v1/trades': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(tradePage([]))],
      })
    );
    renderWithProviders(<TradesScreen />, { port: port() });
    expect(await screen.findByTestId('trades-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('trades-empty-filter')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/trades')[0]?.query.getAll('status')).toContain('AGREED');
  });
});

describe('One trade', () => {
  beforeEach(() => {
    mockParams.current = { id: TRADE_ID };
  });

  it('confirms the exchange after a confirmation and marks the meetup', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/trades/{id}/complete': ok(
          tradeFixture({
            buyerConfirmedAt: '2026-10-05T12:00:00Z',
            nextAction: { actor: 'SELLER', action: 'MEET' },
            allowedOperations: ['MARK_MEETUP', 'CANCEL'],
          })
        ),
        'POST /api/v1/trades/{id}/meetup': ok(tradeFixture({ buyerMarkedMeetup: true })),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(screen.getByTestId('trade-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('trade-next-title')).toHaveTextContent(
      'Your move: meet and exchange the cards'
    );
    expect(screen.getByTestId('trade-eyebrow')).toHaveTextContent('Trade with Noé Verdun');
    expect(screen.getByTestId('trade-counterparty')).toHaveTextContent(
      /Plateau-Mont-Royal, Montréal · 1–5 km/
    );
    expect(
      within(screen.getByTestId('trade-timeline')).getByText(
        'Noé Verdun accepted the offer: the trade is open'
      )
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('trade-meetup-button'));
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /Marked as an in-person meetup\. Noé Verdun will be asked to agree\./
    );
    expect(api.callsTo('POST /api/v1/trades/{id}/meetup')).toHaveLength(1);

    fireEvent.press(screen.getByTestId('trade-confirm'));
    expect(screen.getByTestId('complete-dialog')).toHaveTextContent(/Confirm the exchange\?/);
    fireEvent.press(screen.getByTestId('complete-dialog-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('trade-notice')).toHaveTextContent(
        /You confirmed the exchange\. Waiting for Noé Verdun to confirm\./
      )
    );
    expect(screen.getByTestId('trade-next-title')).toHaveTextContent('Waiting for Noé Verdun');
    expect(screen.getByTestId('step-confirmed-you')).toHaveTextContent(/You: done/);
    expect(screen.queryByTestId('trade-confirm')).not.toBeOnTheScreen();
  });

  it('needs a reason to cancel, and explains a refusal', async () => {
    const api = mockApi(
      routes({
        'POST /api/v1/trades/{id}/cancel': [
          problem(409, 'INVALID_STATE_TRANSITION', 'No', { currentStatus: 'COMPLETED' }),
        ],
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('trade-cancel'));
    fireEvent.press(screen.getByTestId('cancel-trade-dialog-confirm'));
    expect(await screen.findByText('Give a short reason.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/trades/{id}/cancel')).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('cancel-trade-dialog-reason'), 'Card got damaged');
    fireEvent.press(screen.getByTestId('cancel-trade-dialog-confirm'));
    expect(await screen.findByTestId('trade-notice')).toHaveTextContent(
      /This can no longer be done: it was already completed\./
    );
    expect(api.callsTo('POST /api/v1/trades/{id}/cancel')[0]?.body).toEqual({
      reason: 'Card got damaged',
    });
  });

  it('offers to rate the other collector and to add the received card once completed', async () => {
    mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          tradeFixture({
            status: 'COMPLETED',
            buyerConfirmedAt: '2026-10-05T12:00:00Z',
            sellerConfirmedAt: '2026-10-05T13:00:00Z',
            nextAction: { action: 'NONE' },
            allowedOperations: [],
          })
        ),
      })
    );
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-next-title')).toHaveTextContent('Trade completed');
    fireEvent.press(await screen.findByTestId('trade-rate'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/ratings/rate',
      params: { userId: OTHER_ID, handle: 'collector2', name: 'Noé Verdun', kind: 'TRADE' },
    });
    expect(screen.getByTestId('trade-received')).toHaveTextContent(/Azure-Eyes Sky Dragon/);
    fireEvent.press(screen.getByLabelText('Add Azure-Eyes Sky Dragon to my inventory'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/items/new' })
    );
    fireEvent.press(screen.getByTestId('trade-offer-link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/[id]',
      params: { id: OFFER_ID },
    });
    expect(screen.queryByTestId('trade-cancel')).not.toBeOnTheScreen();
  });

  it('explains the payment protection steps done on the website, and missing trades', async () => {
    mockApi(
      routes({
        'GET /api/v1/trades/{id}': ok(
          tradeFixture({
            status: 'AWAITING_PAYMENT',
            protectionEnabled: true,
            nextAction: { actor: 'BUYER', action: 'PAY' },
            allowedOperations: ['PAY', 'MARK_MEETUP', 'CANCEL'],
          })
        ),
      })
    );
    const view = renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-protected-web')).toHaveTextContent(
      /done on orenjitrade\.com for now/
    );
    expect(screen.getByTestId('trade-meetup-button')).toHaveTextContent(/Meet in person instead/);
    expect(screen.getByTestId('step-paid')).toBeOnTheScreen();
    view.unmount();

    mockApi(routes({ 'GET /api/v1/trades/{id}': problem(404, 'NOT_FOUND', 'Nope') }));
    renderWithProviders(<TradeScreen />, { port: port() });
    expect(await screen.findByTestId('trade-not-found')).toBeOnTheScreen();
  });
});
