import { fireEvent, screen } from '@testing-library/react-native';

import CardScreen from '@/app/cards/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { cardDetailFixture, CARD_ID, PRINTING_A, PRINTING_B } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: CARD_ID };
});

function render() {
  return renderWithProviders(<CardScreen />, { port: new FakeAuthPort(testUser()) });
}

describe('Card detail', () => {
  it('shows a skeleton, then the card, its attributes, printings and price', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture()) }));
    render();
    expect(screen.getByTestId('card-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('card-name')).toHaveTextContent('Emberfang Fox VMAX');
    expect(screen.getByText('Pokémon · VMAX')).toBeOnTheScreen();
    expect(screen.getByTestId('card-text')).toHaveTextContent('A fictional Fire creature.');
    // Attributes in schema order, then undeclared keys.
    // Labels from the game schema (GET /games may answer after the card).
    expect(await screen.findByText('HP')).toBeOnTheScreen();
    expect(screen.getByText('320')).toBeOnTheScreen();
    expect(screen.getByText('Weakness')).toBeOnTheScreen();
    // The first printing is selected: its market price.
    expect(screen.getByTestId('card-price')).toHaveTextContent(/38\.00/);
    expect(screen.getByText('Printings (2)')).toBeOnTheScreen();
    // The picture is the API's (never a provider URL), with the card name as its label.
    expect(screen.getByLabelText('Emberfang Fox VMAX, printing SVX-001')).toBeOnTheScreen();
  });

  it('selects a printing from the list', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture()) }));
    render();
    await screen.findByTestId('card-name');
    fireEvent.press(screen.getByTestId(`printing-${PRINTING_B}`));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ printing: PRINTING_B });
  });

  it('shows the printing from the link, without a market price', async () => {
    mockParams.current = { id: CARD_ID, printing: PRINTING_B };
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture()) }));
    render();
    expect(await screen.findByText('No market price for this printing yet.')).toBeOnTheScreen();
    expect(screen.getByTestId(`printing-${PRINTING_B}`)).toBeChecked();
    expect(screen.getByText('French')).toBeOnTheScreen();
  });

  it('opens the add flow, the holders list, the map and the set', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture()) }));
    render();
    await screen.findByTestId('card-name');
    fireEvent.press(screen.getByTestId('card-add-to-inventory'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/new',
      params: { cardId: CARD_ID, printingId: PRINTING_A },
    });
    fireEvent.press(screen.getByTestId('card-holders'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/holders',
      params: { card: CARD_ID },
    });
    fireEvent.press(screen.getByTestId('card-who-has-it'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/', params: { card: CARD_ID } });
    fireEvent.press(screen.getByTestId('card-set-link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/sets/[id]',
      params: { id: '00000000-0000-4000-8a20-000000000001' },
    });
  });

  it('adds the card to the wishlist: any printing, or the printing of the link', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture()) }));
    const first = render();
    await screen.findByTestId('card-name');
    fireEvent.press(screen.getByTestId('card-add-to-wishlist'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/new',
      params: { cardId: CARD_ID, printingId: '' },
    });
    first.unmount();

    mockParams.current = { id: CARD_ID, printing: PRINTING_B };
    render();
    await screen.findByTestId('card-name');
    fireEvent.press(screen.getByTestId('card-add-to-wishlist'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/wishlist/new',
      params: { cardId: CARD_ID, printingId: PRINTING_B },
    });
  });

  it('shows the provider credit for Yu-Gi-Oh! pictures', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture({ game: 'yugioh', metadata: {} })),
      })
    );
    render();
    expect(await screen.findByTestId('card-data-credit')).toBeOnTheScreen();
    expect(screen.getByText('No attributes recorded for this card.')).toBeOnTheScreen();
  });

  it('says when a card does not exist', async () => {
    mockApi(
      signedInRoutes({ 'GET /api/v1/cards/{id}': problem(404, 'NOT_FOUND', 'Card not found') })
    );
    render();
    expect(await screen.findByText('Card not found')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('card-not-found-action'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/search');
  });

  it('shows an error with retry', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': [problem(503, 'UNAVAILABLE', 'down'), ok(cardDetailFixture())],
      })
    );
    render();
    expect(await screen.findByText('This card could not load')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('card-error-retry'));
    expect(await screen.findByTestId('card-name')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/cards/{id}')).toHaveLength(2);
  });

  it('handles a card without printings', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards/{id}': ok(cardDetailFixture({ printings: [] })) }));
    render();
    expect(
      await screen.findByText('No printings are recorded for this card yet.')
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('card-selected-printing')).toBeNull();
  });
});
