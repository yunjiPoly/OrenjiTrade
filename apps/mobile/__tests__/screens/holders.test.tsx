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

describe('Card holders ("who has this in my region" as a list)', () => {
  it('shows a skeleton, then the card, the count and the listings with their holders', async () => {
    const api = mockApi(routes());
    render();
    expect(screen.getByTestId('holders-loading')).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByTestId('holders-title')).toHaveTextContent(
        'Who has Emberfang Fox VMAX in your region'
      )
    );
    expect(screen.getByTestId('holders-subtitle')).toHaveTextContent(
      'Collectors of Americas (North). Only their state or province is shown.'
    );
    expect(await screen.findByTestId('holders-count')).toHaveTextContent(
      '2 listings in your region'
    );
    const first = screen.getByTestId(`holder-${HOLDER_ITEM_ID}`);
    expect(within(first).getByText('AZR-EN001')).toBeOnTheScreen();
    expect(first).toHaveTextContent(/Azure Dawn · English · 1st Edition/);
    expect(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-price`)).toHaveTextContent(
      /\$45\.00/
    );
    expect(first).toHaveTextContent(/Noé Verdun/);
    expect(first).toHaveTextContent(/Ontario, Canada/);
    expect(first).not.toHaveTextContent(/km/);
    expect(first).toHaveTextContent(/“Pack fresh\.”/);
    expect(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-binder`)).toBeOnTheScreen();
    const second = screen.getByTestId(`holder-${OTHER_ITEM}`);
    expect(within(second).getByTestId(`holder-${OTHER_ITEM}-price`)).toHaveTextContent('No price');
    expect(within(second).queryByRole('button', { name: /Make an offer/ })).toBeNull();
    // The home region (ADR 0017): no position; the card id, the default sort and page.
    const query = api.callsTo('GET /api/v1/search/card-holders')[0]?.query;
    expect(Object.fromEntries(query ?? [])).toEqual({
      region: 'americas-north',
      cardId: CARD_ID,
      sort: 'freshness',
      page: '0',
      size: '20',
    });
  });

  it('opens the holder profile, the binder, the card and an offer', async () => {
    mockApi(routes());
    render();
    const first = await screen.findByTestId(`holder-${HOLDER_ITEM_ID}`);
    fireEvent.press(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-collector`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
    fireEvent.press(within(first).getByTestId(`holder-${HOLDER_ITEM_ID}-binder`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID, view: 'public' },
    });
    fireEvent.press(within(first).getByRole('button', { name: /Make an offer/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/new',
      params: { item: HOLDER_ITEM_ID },
    });
    expect(offerTargetFor(HOLDER_ITEM_ID)?.seller.displayName).toBe('Noé Verdun');
    expect(screen.queryByTestId('holders-map')).toBeNull();
    fireEvent.press(screen.getByTestId('holders-card'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID },
    });
    fireEvent.press(screen.getByTestId('holders-wishlist'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/new',
      params: { cardId: CARD_ID, printingId: '' },
    });
  });

  it('applies every filter and the sort to the request, then clears them', async () => {
    const api = mockApi(routes());
    render();
    await screen.findByTestId('holders-count');
    const last = () =>
      Object.fromEntries(api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query ?? []);

    fireEvent.press(screen.getByTestId('holders-sort'));
    fireEvent.press(await screen.findByTestId('holders-sort-option-price'));
    await waitFor(() => expect(last().sort).toBe('price'));

    fireEvent.press(screen.getByTestId('holders-filters'));
    const sheet = await screen.findByTestId('holder-filters');
    fireEvent.press(within(sheet).getByTestId('holder-availability-ACCEPTS_OFFERS'));
    fireEvent.press(within(sheet).getByTestId('holder-condition-LIGHTLY_PLAYED'));
    fireEvent.press(within(sheet).getByTestId('holder-freshness-ACTIVE'));
    fireEvent.press(within(sheet).getByTestId('holder-edition-FIRST_EDITION'));
    fireEvent.press(within(sheet).getByTestId('holder-language-fr'));
    fireEvent.press(within(sheet).getByTestId('holder-accepts-offers'));
    fireEvent.changeText(within(sheet).getByTestId('holder-min-price'), '10');
    fireEvent.changeText(within(sheet).getByTestId('holder-max-price'), '5');
    fireEvent(within(sheet).getByTestId('holder-max-price'), 'blur');
    expect(within(sheet).getByTestId('holder-price-range-error')).toHaveTextContent(
      'The minimum price must not be above the maximum.'
    );
    fireEvent.changeText(within(sheet).getByTestId('holder-max-price'), '99.5');
    fireEvent(within(sheet).getByTestId('holder-max-price'), 'blur');
    await waitFor(() =>
      expect(last()).toEqual({
        region: 'americas-north',
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
    fireEvent.press(within(sheet).getByTestId('holder-filters-done'));
    expect(await screen.findByRole('button', { name: 'Filters (8)' })).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('holders-filters'));
    fireEvent.press(await screen.findByTestId('holder-filters-clear'));
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
    render();
    const list = await screen.findByTestId('holders-list');
    fireEvent(list, 'endReached');
    expect(await screen.findByTestId(`holder-${OTHER_ITEM}`)).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query.get('page')).toBe('1');

    fireEvent.press(screen.getByTestId('holders-filters'));
    fireEvent.press(await screen.findByTestId('holder-accepts-offers'));
    fireEvent.press(screen.getByTestId('holder-filters-done'));
    expect(
      await screen.findByText('Nobody in your region lists this card with these filters')
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('holders-empty-action'));
    expect(await screen.findByTestId(`holder-${HOLDER_ITEM_ID}`)).toBeOnTheScreen();
  });

  it('searches one printing in the home region of the collector', async () => {
    mockParams.current = { printing: PRINTING_A };
    const api = mockApi(routes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })) }));
    render();
    await waitFor(() =>
      expect(screen.getByTestId('holders-title')).toHaveTextContent(
        'Who has Emberfang Fox VMAX (SVX-001) in your region'
      )
    );
    expect(screen.getByTestId('holders-subtitle')).toHaveTextContent(/Collectors of Europe\./);
    await waitFor(() => {
      const query = api.callsTo('GET /api/v1/search/card-holders').at(-1)?.query;
      expect(query?.get('printingId')).toBe(PRINTING_A);
      expect(query?.get('region')).toBe('europe');
    });
    for (const call of api.callsTo('GET /api/v1/search/card-holders')) {
      expect(call.query.has('lat')).toBe(false);
      expect(call.query.has('lng')).toBe(false);
      expect(call.query.get('region')).toBe('europe');
    }
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
    render();
    expect(await screen.findByTestId('holders-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('holders-error-retry'));
    expect(await screen.findByTestId(`holder-${HOLDER_ITEM_ID}`)).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search/card-holders')).toHaveLength(2);
  });

  it('asks for a card without one', () => {
    mockParams.current = {};
    mockApi(routes());
    render();
    expect(screen.getByTestId('holders-no-card')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('holders-no-card-action'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/search');
  });
});
