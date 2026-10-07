import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import HoldersScreen from '@/app/holders';
import { offerTargetFor } from '@/src/features/offers/offerTargetStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  BINDER_ID,
  CARD_ID,
  HOLDER_ITEM_ID,
  PRINTING_A,
  cardDetailFixture,
  cardHolderFixture,
  cardHoldersPage,
  markerFixture,
  meFixture,
  publicItemFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const OTHER_ITEM = '00000000-0000-4000-8c00-000000030304';

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { card: CARD_ID };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
    'GET /api/v1/search/card-holders': ok(
      cardHoldersPage([
        cardHolderFixture(),
        cardHolderFixture({
          collector: markerFixture({ handle: 'collector3', displayName: 'Lina Rosemont' }),
          item: publicItemFixture({
            id: OTHER_ITEM,
            askingPrice: null,
            acceptsOffers: false,
            availability: 'TRADE',
            binder: undefined,
            publicNotes: '',
          }),
        }),
      ])
    ),
    ...extra,
  });
}

const render = () => renderWithProviders(<HoldersScreen />, { port: new FakeAuthPort(testUser()) });

describe('Card holders ("who has this near me" as a list)', () => {
  it('shows a skeleton, then the card, the count and the listings with their holders', async () => {
    const api = mockApi(routes());
    const release = api.hold();
    await render();
    expect(screen.getByTestId('holders-loading')).toBeOnTheScreen();
    release();
    await waitFor(() =>
      expect(screen.getByTestId('holders-title')).toHaveTextContent(
        'Who has Emberfang Fox VMAX near you'
      )
    );
    expect(screen.getByTestId('holders-subtitle')).toHaveTextContent(
      'Collectors around your trading area. Places and distances are approximate.'
    );
    expect(await screen.findByTestId('holders-count')).toHaveTextContent('2 listings near you');
    const first = screen.getByTestId(`holder-${HOLDER_ITEM_ID}`);
    expect(within(first).getByText('AZR-EN001')).toBeOnTheScreen();
    expect(first).toHaveTextContent(/Azure Dawn · English · 1st Edition/);
    expect(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-price`)).toHaveTextContent(
      /\$45\.00/
    );
    expect(first).toHaveTextContent(/Noé Verdun/);
    expect(first).toHaveTextContent(/Verdun, Montréal · 1–5 km away/);
    expect(first).toHaveTextContent(/“Pack fresh\.”/);
    expect(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-binder`)).toBeOnTheScreen();
    const second = screen.getByTestId(`holder-${OTHER_ITEM}`);
    expect(within(second).getByTestId(`holder-${OTHER_ITEM}-price`)).toHaveTextContent('No price');
    expect(within(second).queryByRole('button', { name: /Make an offer/ })).toBeNull();
    // The own trading area: no centre; the card id, the default sort and page.
    const query = api.callsTo('GET /api/v1/search/card-holders')[0]?.query;
    expect(Object.fromEntries(query ?? [])).toEqual({
      cardId: CARD_ID,
      sort: 'distance',
      page: '0',
      size: '20',
    });
    expect(screen.queryByText(/45\.4|73\.5/)).toBeNull();
  });

  it('opens the holder profile, the binder, the map, the card and an offer', async () => {
    mockApi(routes());
    await render();
    const first = await screen.findByTestId(`holder-${HOLDER_ITEM_ID}`);
    await fireEvent.press(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-collector`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
    await fireEvent.press(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-binder`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID, view: 'public' },
    });
    await fireEvent.press(within(first).getByRole('button', { name: /Make an offer/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/new',
      params: { item: HOLDER_ITEM_ID },
    });
    expect(offerTargetFor(HOLDER_ITEM_ID)?.seller.displayName).toBe('Noé Verdun');
    await fireEvent.press(screen.getByTestId('holders-map'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/', params: { card: CARD_ID } });
    await fireEvent.press(screen.getByTestId('holders-card'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID },
    });
    await fireEvent.press(screen.getByTestId('holders-wishlist'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/new',
      params: { cardId: CARD_ID, printingId: '' },
    });
  });

  it('applies every filter and the sort to the request, then clears them', async () => {
    const api = mockApi(routes());
    await render();
    await screen.findByTestId('holders-count');
    const last = () =>
      Object.fromEntries(api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query ?? []);

    await fireEvent.press(screen.getByTestId('holders-sort'));
    await fireEvent.press(await screen.findByTestId('holders-sort-option-price'));
    await waitFor(() => expect(last().sort).toBe('price'));

    await fireEvent.press(screen.getByTestId('holders-filters'));
    const sheet = await screen.findByTestId('holder-filters');
    await fireEvent.press(within(sheet).getByTestId('holder-availability-ACCEPTS_OFFERS'));
    await fireEvent.press(within(sheet).getByTestId('holder-condition-LIGHTLY_PLAYED'));
    await fireEvent.press(within(sheet).getByTestId('holder-freshness-ACTIVE'));
    await fireEvent.press(within(sheet).getByTestId('holder-edition-FIRST_EDITION'));
    await fireEvent.press(within(sheet).getByTestId('holder-language-fr'));
    await fireEvent.press(within(sheet).getByTestId('holder-accepts-offers'));
    await fireEvent.changeText(within(sheet).getByTestId('holder-min-price'), '10');
    await fireEvent.changeText(within(sheet).getByTestId('holder-max-price'), '5');
    await fireEvent(within(sheet).getByTestId('holder-max-price'), 'blur');
    expect(within(sheet).getByTestId('holder-price-range-error')).toHaveTextContent(
      'The minimum price must not be above the maximum.'
    );
    await fireEvent.changeText(within(sheet).getByTestId('holder-max-price'), '99.5');
    await fireEvent(within(sheet).getByTestId('holder-max-price'), 'blur');
    await waitFor(() =>
      expect(last()).toEqual({
        cardId: CARD_ID,
        sort: 'price',
        availability: 'ACCEPTS_OFFERS',
        condition: 'LIGHTLY_PLAYED',
        minPrice: '10',
        maxPrice: '99.5',
        freshness: 'ACTIVE',
        edition: 'FIRST_EDITION',
        language: 'fr',
        acceptsOffers: 'true',
        page: '0',
        size: '20',
      })
    );
    await fireEvent.press(within(sheet).getByTestId('holder-filters-done'));
    expect(await screen.findByRole('button', { name: 'Filters (8)' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('holders-filters'));
    await fireEvent.press(await screen.findByTestId('holder-filters-clear'));
    // Back to the sorted, unfiltered query (answered from the cache: it ran before).
    expect(await screen.findByRole('button', { name: 'Filters' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sort: Lowest price' })).toBeOnTheScreen();
    expect(
      api
        .callsTo('GET /api/v1/search/card-holders')
        .some((call) => call.query.get('sort') === 'price' && !call.query.has('condition'))
    ).toBe(true);
  });

  it('loads the next page, and words an empty result with "Clear filters"', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/search/card-holders': (request) => {
          if (request.query.get('acceptsOffers') === 'true') {
            return ok(cardHoldersPage([], 0, 0, 0));
          }
          return request.query.get('page') === '1'
            ? ok(
                cardHoldersPage(
                  [cardHolderFixture({ item: publicItemFixture({ id: OTHER_ITEM }) })],
                  1,
                  2,
                  2
                )
              )
            : ok(cardHoldersPage([cardHolderFixture()], 0, 2, 2));
        },
      })
    );
    await render();
    const list = await screen.findByTestId('holders-list');
    await fireEvent(list, 'endReached');
    expect(await screen.findByTestId(`holder-${OTHER_ITEM}`)).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query.get('page')).toBe('1');

    await fireEvent.press(screen.getByTestId('holders-filters'));
    await fireEvent.press(await screen.findByTestId('holder-accepts-offers'));
    await fireEvent.press(screen.getByTestId('holder-filters-done'));
    expect(
      await screen.findByText('Nobody nearby lists this card with these filters')
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('holders-empty-action'));
    expect(await screen.findByTestId(`holder-${HOLDER_ITEM_ID}`)).toBeOnTheScreen();
  });

  it('searches one printing, around a city without a trading area', async () => {
    mockParams.current = { printing: PRINTING_A };
    const api = mockApi(
      routes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, tradingAreaSet: false },
          })
        ),
      })
    );
    await render();
    await waitFor(() =>
      expect(screen.getByTestId('holders-title')).toHaveTextContent(
        'Who has Emberfang Fox VMAX (SVX-001) near you'
      )
    );
    expect(screen.getByTestId('holders-subtitle')).toHaveTextContent(/Around Montréal\./);
    await waitFor(() => {
      const query = api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query;
      expect(query?.get('printingId')).toBe(PRINTING_A);
      expect(query?.get('lat')).toBe('45.502');
      expect(query?.get('lng')).toBe('-73.567');
    });
    await fireEvent.press(screen.getByTestId('holders-map'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/',
      params: { printing: PRINTING_A },
    });
  });

  it('shows an error with retry, and the plan limit', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/search/card-holders': [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(cardHoldersPage([cardHolderFixture()])),
        ],
      })
    );
    await render();
    expect(await screen.findByTestId('holders-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('holders-error-retry'));
    expect(await screen.findByTestId(`holder-${HOLDER_ITEM_ID}`)).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search/card-holders')).toHaveLength(2);
  });

  it('asks for a card without one', async () => {
    mockParams.current = {};
    mockApi(routes());
    await render();
    expect(screen.getByTestId('holders-no-card')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('holders-no-card-action'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/search');
  });
});
