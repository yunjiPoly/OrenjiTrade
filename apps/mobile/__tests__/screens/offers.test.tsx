import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import OfferScreen from '@/app/offers/[id]';
import CounterOfferScreen from '@/app/offers/counter';
import OffersScreen from '@/app/offers/index';
import NewOfferScreen from '@/app/offers/new';
import OfferSettingsScreen from '@/app/settings/offers';
import { offerTargetFromItem, sellerFromParty } from '@/src/features/offers/offerTarget';
import { useOfferTargets } from '@/src/features/offers/offerTargetStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  BUYER_ITEM_ID,
  OFFER_ID,
  TRADE_ID,
  inventoryPage,
  itemFixture,
  offerFixture,
  offerPage,
  offerPartyFixture,
  offerSummaryFixture,
  publicItemFixture,
  SELF_PARTY,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const port = () => new FakeAuthPort(testUser());
const ITEM = publicItemFixture();
const TARGET = offerTargetFromItem(ITEM, sellerFromParty(offerPartyFixture()));
const COUNTERED_ID = '00000000-0000-4000-9c00-000000000002';

/** The same negotiation seen by the seller: the signed-in collector, whose turn it is. */
const sellerView = offerFixture({
  viewerRole: 'SELLER',
  seller: SELF_PARTY,
  buyer: offerPartyFixture(),
  allowedActions: ['ACCEPT', 'COUNTER', 'DECLINE'],
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/offers': ok(offerPage()),
    'GET /api/v1/offers/{id}': ok(offerFixture()),
    'POST /api/v1/offers': ok(offerFixture(), 201),
    'GET /api/v1/inventory/items': ok(
      inventoryPage([itemFixture({ id: BUYER_ITEM_ID, quantity: 2 })])
    ),
    'GET /api/v1/me/settings/offers': ok({ acceptsMixed: true }),
    'PUT /api/v1/me/settings/offers': ok({ acceptsMixed: false }),
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useOfferTargets.getState().clear();
});

describe('Offers inbox', () => {
  it('lists the received negotiations with the turn, links and filters', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/offers': ok(
          offerPage([
            offerSummaryFixture(),
            offerSummaryFixture({
              id: 'o-expired',
              status: 'EXPIRED',
              yourTurn: false,
              allowedActions: [],
              kind: 'TRADE',
              cashAmount: null,
              tradeItemCount: 2,
            }),
          ])
        ),
      })
    );
    renderWithProviders(<OffersScreen />, { port: port() });
    expect(screen.getByTestId('offers-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId(`offer-row-${OFFER_ID}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`offer-row-terms-${OFFER_ID}`)).toHaveTextContent('$40.00');
    expect(screen.getByTestId(`offer-row-turn-${OFFER_ID}`)).toHaveTextContent(/Your turn/);
    expect(screen.getByTestId('offer-row-terms-o-expired')).toHaveTextContent('2 cards');
    expect(screen.getByLabelText('Status: Expired')).toBeOnTheScreen();
    expect(screen.getByTestId('offers-your-turn')).toHaveTextContent(
      /1 offer waits for your answer/
    );
    expect(api.callsTo('GET /api/v1/offers')[0]?.query.get('role')).toBe('seller');

    fireEvent.press(screen.getByTestId(`offer-row-${OFFER_ID}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/[id]',
      params: { id: OFFER_ID },
    });
    fireEvent.press(screen.getByTestId('offers-tab-sent'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ tab: 'sent', status: 'all' });
    fireEvent.press(screen.getByTestId('offers-filter-closed'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ tab: 'received', status: 'closed' });
    fireEvent.press(screen.getByTestId('offers-trades'));
    expect(mockRouter.push).toHaveBeenCalledWith('/trades');
    fireEvent.press(screen.getByTestId('offers-settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/offers');
  });

  it('asks the API for the sent tab and a status, and shows its empty states', async () => {
    mockParams.current = { tab: 'sent', status: 'closed' };
    const api = mockApi(routes({ 'GET /api/v1/offers': ok(offerPage([])) }));
    renderWithProviders(<OffersScreen />, { port: port() });
    expect(await screen.findByTestId('offers-empty-filter')).toBeOnTheScreen();
    const query = api.callsTo('GET /api/v1/offers')[0]?.query;
    expect(query?.get('role')).toBe('buyer');
    expect(query?.getAll('status')).toEqual(['DECLINED', 'CANCELLED', 'EXPIRED']);
    fireEvent.press(screen.getByText('Show all offers'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ tab: 'sent', status: 'all' });
  });

  it('shows the empty sent tab and an error with retry', async () => {
    mockParams.current = { tab: 'sent' };
    mockApi(
      routes({ 'GET /api/v1/offers': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(offerPage([]))] })
    );
    renderWithProviders(<OffersScreen />, { port: port() });
    expect(await screen.findByTestId('offers-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('offers-empty-sent')).toHaveTextContent(
      /You have not made any offer yet/
    );
  });
});

describe('Make an offer', () => {
  it('explains that the card has to be chosen again after a reload', () => {
    mockParams.current = { item: ITEM.id };
    mockApi(routes());
    renderWithProviders(<NewOfferScreen />, { port: port() });
    expect(screen.getByTestId('offer-new-missing')).toHaveTextContent(/Choose the card again/);
  });

  it('validates, then sends a cash offer once with an idempotency key', async () => {
    useOfferTargets.getState().put(TARGET);
    mockParams.current = { item: ITEM.id };
    const api = mockApi(routes());
    renderWithProviders(<NewOfferScreen />, { port: port() });
    expect(screen.getByTestId('offer-target-name')).toHaveTextContent('Azure-Eyes Sky Dragon');
    expect(screen.getByText('Asking $45.00')).toBeOnTheScreen();
    // TRADE_OR_SALE accepts the three kinds.
    expect(screen.getByTestId('offer-kind-CASH')).toBeChecked();
    expect(screen.getByTestId('offer-kind-MIXED')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('offer-submit'));
    expect(await screen.findByText('Enter the amount you offer.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('offer-amount'), '40.555');
    expect(screen.getByText('Use at most 2 decimals.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('offer-amount'), '40');
    fireEvent.press(screen.getByTestId('offer-expiry-24'));
    fireEvent.changeText(screen.getByTestId('offer-message'), 'Café on Saturday?');
    expect(screen.getByTestId('offer-summary')).toHaveTextContent(
      /You offer \$40\.00 for Azure-Eyes Sky Dragon/
    );
    fireEvent.press(screen.getByTestId('offer-submit'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/offers/[id]',
        params: { id: OFFER_ID },
      })
    );
    const call = api.callsTo('POST /api/v1/offers')[0];
    expect(call?.body).toEqual({
      itemId: ITEM.id,
      kind: 'CASH',
      cashAmount: 40,
      currency: 'CAD',
      message: 'Café on Saturday?',
      expiresInHours: 24,
    });
    expect(call?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByTestId('snackbar')).toHaveTextContent('Offer sent to Noé Verdun.');
  });

  it('asks for payment protection on a cash offer while the flag is on', async () => {
    useOfferTargets.getState().put(TARGET);
    mockParams.current = { item: ITEM.id };
    const api = mockApi(
      routes({
        'GET /api/v1/public/feature-flags': ok({ protectedPayments: true }),
        'POST /api/v1/offers': ok(offerFixture({ protectionRequested: true }), 201),
      })
    );
    renderWithProviders(<NewOfferScreen />, { port: port() });
    expect(await screen.findByTestId('protection-option')).toHaveTextContent(
      /Noé Verdun is paid only once you confirm it arrived/
    );
    fireEvent.press(screen.getByTestId('offer-protection'));
    fireEvent.changeText(screen.getByTestId('offer-amount'), '40');
    expect(screen.getByTestId('offer-summary')).toHaveTextContent(/with payment protection/);
    // A trade offer has no cash part: no protection.
    fireEvent.press(screen.getByTestId('offer-kind-TRADE'));
    expect(screen.queryByTestId('protection-option')).not.toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('offer-kind-CASH'));
    fireEvent.press(screen.getByTestId('offer-submit'));
    await waitFor(() => expect(api.callsTo('POST /api/v1/offers')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/offers')[0]?.body).toMatchObject({
      kind: 'CASH',
      cashAmount: 40,
      protectionRequested: true,
    });
  });

  it('offers no payment protection while the flag is off', async () => {
    useOfferTargets.getState().put(TARGET);
    mockParams.current = { item: ITEM.id };
    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok({ protectedPayments: false }) }));
    renderWithProviders(<NewOfferScreen />, { port: port() });
    expect(await screen.findByTestId('offer-amount')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('protection-option')).not.toBeOnTheScreen());
  });

  it('picks cards of the caller for a trade offer', async () => {
    useOfferTargets.getState().put({ ...TARGET, availability: 'TRADE' });
    mockParams.current = { item: ITEM.id };
    const api = mockApi(routes());
    renderWithProviders(<NewOfferScreen />, { port: port() });
    expect(screen.getByTestId('offer-kind-single')).toHaveTextContent(/this card is for trade/);
    fireEvent.press(screen.getByTestId('offer-submit'));
    expect(await screen.findByTestId('cards-error')).toHaveTextContent(
      'Pick at least one of your cards to trade.'
    );
    fireEvent.press(await screen.findByTestId(`offer-pick-${BUYER_ITEM_ID}`));
    expect(screen.getByTestId(`offer-line-${BUYER_ITEM_ID}`)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`offer-line-quantity-${BUYER_ITEM_ID}-increase`));
    fireEvent.press(screen.getByTestId('offer-submit'));
    await waitFor(() => expect(api.callsTo('POST /api/v1/offers')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/offers')[0]?.body).toMatchObject({
      kind: 'TRADE',
      tradeItemIds: [{ inventoryItemId: BUYER_ITEM_ID, quantity: 2 }],
    });
  });

  it('links to the open offer, and explains plan limits and refused kinds', async () => {
    useOfferTargets.getState().put(TARGET);
    mockParams.current = { item: ITEM.id };
    mockApi(
      routes({
        'POST /api/v1/offers': [problem(409, 'OFFER_ALREADY_OPEN', 'Open', { offerId: OFFER_ID })],
      })
    );
    renderWithProviders(<NewOfferScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('offer-amount'), '40');
    fireEvent.press(screen.getByTestId('offer-submit'));
    expect(await screen.findByTestId('offer-error')).toHaveTextContent(
      /already have an open offer on this card/
    );
    expect(screen.getByTestId('offer-submit')).toBeDisabled();
    fireEvent.press(screen.getByTestId('offer-error-open'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/offers/[id]',
      params: { id: OFFER_ID },
    });
  });

  it('explains a reached daily limit and an offer kind the seller refuses', async () => {
    useOfferTargets.getState().put(TARGET);
    mockParams.current = { item: ITEM.id };
    mockApi(
      routes({
        'POST /api/v1/offers': [
          problem(429, 'LIMIT_REACHED', 'Limit', {
            limitKey: 'offers.per_day',
            limit: 10,
            used: 10,
            planCode: 'FREE',
          }),
          problem(422, 'OFFERS_NOT_ACCEPTED', 'This seller does not accept mixed offers.'),
        ],
      })
    );
    renderWithProviders(<NewOfferScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('offer-amount'), '40');
    fireEvent.press(screen.getByTestId('offer-submit'));
    expect(await screen.findByTestId('offer-error')).toHaveTextContent(
      /You have used 10 of 10 offers today on the Free plan/
    );
    fireEvent.press(screen.getByTestId('offer-submit'));
    expect(
      await screen.findByText(/does not accept mixed offers\. Try another kind/)
    ).toBeOnTheScreen();
  });
});

describe('One offer', () => {
  it('lets the buyer withdraw with a reason while it waits for the seller', async () => {
    mockParams.current = { id: OFFER_ID };
    const api = mockApi(
      routes({
        'POST /api/v1/offers/{id}/cancel': ok(
          offerFixture({ status: 'CANCELLED', allowedActions: [] })
        ),
      })
    );
    renderWithProviders(<OfferScreen />, { port: port() });
    expect(screen.getByTestId('offer-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('offer-eyebrow')).toHaveTextContent(
      'Your offer to Noé Verdun'
    );
    expect(screen.getByTestId('offer-turn')).toHaveTextContent('Waiting for Noé Verdun');
    expect(screen.getByTestId('offer-expiry')).toHaveTextContent(/Expires in/);
    expect(screen.getByTestId('deal-cash')).toHaveTextContent('$40.00');
    expect(screen.getByTestId('deal-message')).toHaveTextContent(/Could we meet at the café\?/);
    expect(screen.getByTestId('offer-seller')).toHaveTextContent(
      /Plateau-Mont-Royal, Montréal · 1–5 km/
    );
    expect(
      within(screen.getByTestId('offer-history')).getByText('You made the offer')
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('offer-accept')).not.toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('offer-withdraw'));
    expect(screen.getByTestId('withdraw-dialog')).toHaveTextContent(/Withdraw your offer\?/);
    fireEvent.changeText(screen.getByTestId('withdraw-dialog-reason'), 'Found another copy');
    fireEvent.press(screen.getByTestId('withdraw-dialog-confirm'));
    expect(await screen.findByTestId('offer-notice')).toHaveTextContent(
      /Offer withdrawn\. Noé Verdun was notified\./
    );
    expect(api.callsTo('POST /api/v1/offers/{id}/cancel')[0]?.body).toEqual({
      reason: 'Found another copy',
      version: 0,
    });
    expect(screen.getByLabelText('Status: Withdrawn')).toBeOnTheScreen();
  });

  it('lets the seller accept after a confirmation and links to the trade', async () => {
    mockParams.current = { id: OFFER_ID };
    const api = mockApi(
      routes({
        'GET /api/v1/offers/{id}': ok(sellerView),
        'POST /api/v1/offers/{id}/accept': ok({
          ...sellerView,
          status: 'ACCEPTED',
          allowedActions: [],
          tradeId: TRADE_ID,
        }),
      })
    );
    renderWithProviders(<OfferScreen />, { port: port() });
    expect(await screen.findByTestId('offer-turn')).toHaveTextContent('Your turn to answer');
    expect(screen.getByTestId('offer-eyebrow')).toHaveTextContent('Offer from Noé Verdun');
    fireEvent.press(screen.getByTestId('offer-accept'));
    expect(screen.getByTestId('accept-dialog')).toHaveTextContent(
      /You agree to trade Azure-Eyes Sky Dragon for \$40\.00 with Noé Verdun/
    );
    fireEvent.press(screen.getByTestId('accept-dialog-confirm'));
    expect(await screen.findByTestId('offer-notice')).toHaveTextContent(
      /Offer accepted\. The trade is open/
    );
    expect(api.callsTo('POST /api/v1/offers/{id}/accept')[0]?.body).toEqual({ version: 0 });
    fireEvent.press(screen.getByTestId('offer-trade-link-action'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trades/[id]',
      params: { id: TRADE_ID },
    });
  });

  it('declines with an optional reason, and counters on another screen', async () => {
    mockParams.current = { id: OFFER_ID };
    const api = mockApi(
      routes({
        'GET /api/v1/offers/{id}': ok(sellerView),
        'POST /api/v1/offers/{id}/decline': ok({
          ...sellerView,
          status: 'DECLINED',
          allowedActions: [],
        }),
      })
    );
    renderWithProviders(<OfferScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('offer-counter'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/counter',
      params: { id: OFFER_ID },
    });
    fireEvent.press(screen.getByTestId('offer-decline'));
    fireEvent.press(screen.getByTestId('decline-dialog-confirm'));
    expect(await screen.findByTestId('offer-notice')).toHaveTextContent(/Offer declined/);
    expect(api.callsTo('POST /api/v1/offers/{id}/decline')[0]?.body).toEqual({ version: 0 });
    expect(screen.getByTestId('offer-turn')).toHaveTextContent('This negotiation is closed');
  });

  it('moves to the latest proposal when the offer changed meanwhile', async () => {
    mockParams.current = { id: OFFER_ID };
    mockApi(
      routes({
        'GET /api/v1/offers/{id}': ok(sellerView),
        'POST /api/v1/offers/{id}/accept': problem(409, 'STALE_OFFER', 'Stale', {
          latestOfferId: COUNTERED_ID,
        }),
      })
    );
    renderWithProviders(<OfferScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('offer-accept'));
    fireEvent.press(screen.getByTestId('accept-dialog-confirm'));
    expect(await screen.findByTestId('offer-notice')).toHaveTextContent(
      /This offer changed while you were looking at it/
    );
    expect(mockRouter.setParams).toHaveBeenCalledWith({ id: COUNTERED_ID });
  });

  it('links a replaced proposal to the live one, and explains missing offers', async () => {
    mockParams.current = { id: OFFER_ID };
    mockApi(
      routes({
        'GET /api/v1/offers/{id}': ok(
          offerFixture({ superseded: true, status: 'COUNTERED', latestOfferId: COUNTERED_ID })
        ),
      })
    );
    const view = renderWithProviders(<OfferScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('offer-superseded-action'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ id: COUNTERED_ID });
    expect(screen.queryByTestId('offer-action-bar')).not.toBeOnTheScreen();
    view.unmount();

    mockApi(routes({ 'GET /api/v1/offers/{id}': problem(404, 'NOT_FOUND', 'Nope') }));
    renderWithProviders(<OfferScreen />, { port: port() });
    expect(await screen.findByTestId('offer-not-found')).toBeOnTheScreen();
  });
});

describe('Counter-offer', () => {
  it('answers with another amount and refuses the same deal', async () => {
    mockParams.current = { id: OFFER_ID };
    const counter = offerFixture({ id: COUNTERED_ID, status: 'COUNTERED', cashAmount: 44 });
    const api = mockApi(
      routes({
        'GET /api/v1/offers/{id}': ok(sellerView),
        'POST /api/v1/offers/{id}/counter': ok(counter),
      })
    );
    renderWithProviders(<CounterOfferScreen />, { port: port() });
    expect(await screen.findByTestId('current-proposal')).toHaveTextContent(
      /Current proposal: \$40\.00/
    );
    // The buyer offered no cards: a seller can only answer with cash.
    expect(screen.getByTestId('offer-kind-single')).toHaveTextContent(/the buyer offered no cards/);
    expect(screen.getByTestId('offer-amount').props.value).toBe('40');
    fireEvent.press(screen.getByTestId('offer-submit'));
    expect(await screen.findByTestId('offer-error')).toHaveTextContent(
      /A counter-offer must change the amount or the cards/
    );
    expect(api.callsTo('POST /api/v1/offers/{id}/counter')).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('offer-amount'), '44');
    fireEvent.press(screen.getByTestId('offer-submit'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/offers/[id]',
        params: { id: COUNTERED_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/offers/{id}/counter')[0]?.body).toEqual({
      kind: 'CASH',
      cashAmount: 44,
      currency: 'CAD',
      tradeItemIds: [],
      expiresInHours: 72,
      version: 0,
    });
  });

  it('goes back to the offer when it changed meanwhile', async () => {
    mockParams.current = { id: OFFER_ID };
    mockApi(
      routes({
        'GET /api/v1/offers/{id}': ok(sellerView),
        'POST /api/v1/offers/{id}/counter': problem(409, 'NOT_YOUR_TURN', 'Not your turn'),
      })
    );
    renderWithProviders(<CounterOfferScreen />, { port: port() });
    fireEvent.changeText(await screen.findByTestId('offer-amount'), '50');
    fireEvent.press(screen.getByTestId('offer-submit'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/offers/[id]',
        params: { id: OFFER_ID },
      })
    );
    expect(screen.getByTestId('snackbar')).toHaveTextContent(/It is Noé Verdun's turn/);
  });

  it('refuses to counter when it is not the caller’s turn', async () => {
    mockParams.current = { id: OFFER_ID };
    mockApi(routes());
    renderWithProviders(<CounterOfferScreen />, { port: port() });
    expect(await screen.findByTestId('counter-not-allowed')).toBeOnTheScreen();
  });
});

describe('Offer settings', () => {
  it('saves the mixed offers switch at once', async () => {
    const api = mockApi(routes());
    renderWithProviders(<OfferSettingsScreen />, { port: port() });
    const toggle = await screen.findByTestId('offer-settings-mixed');
    expect(toggle).toBeChecked();
    fireEvent.press(toggle);
    await waitFor(() =>
      expect(api.callsTo('PUT /api/v1/me/settings/offers')[0]?.body).toEqual({
        acceptsMixed: false,
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId('offer-settings-status')).toHaveTextContent(/Saved/)
    );
    expect(screen.getByTestId('offer-settings-mixed')).not.toBeChecked();
  });
});
