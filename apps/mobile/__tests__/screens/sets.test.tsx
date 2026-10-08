import { fireEvent, screen } from '@testing-library/react-native';

import SetScreen from '@/app/sets/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { CARD_ID, PRINTING_A, SET_ID, setDetailFixture } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: SET_ID };
});

const render = () => renderWithProviders(<SetScreen />, { port: new FakeAuthPort(testUser()) });

describe('Set page', () => {
  it('shows the set, its printings, opens a card and the filtered search', async () => {
    const api = mockApi(signedInRoutes({ 'GET /api/v1/sets/{id}': ok(setDetailFixture()) }));
    render();
    expect(screen.getByTestId('set-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('set-name')).toHaveTextContent('Scarlet Expanse');
    expect(screen.getByTestId('set-meta')).toHaveTextContent(
      'SVX · Released 2026-03-01 · 2 printings'
    );
    expect(api.callsTo('GET /api/v1/sets/{id}')[0]?.query.get('size')).toBe('40');
    fireEvent.press(screen.getByTestId(`set-printing-${PRINTING_A}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
    fireEvent.press(screen.getByTestId('set-search'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { game: 'pokemon', set: 'SVX', q: '', tab: 'cards' },
    });
  });

  it('explains an unknown set and a failure with retry', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/sets/{id}': [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(setDetailFixture()),
        ],
      })
    );
    render();
    expect(await screen.findByTestId('set-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('set-error-retry'));
    expect(await screen.findByTestId('set-name')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/sets/{id}')).toHaveLength(2);

    mockApi(signedInRoutes({ 'GET /api/v1/sets/{id}': problem(404, 'NOT_FOUND', 'gone') }));
    render();
    expect(await screen.findByTestId('set-not-found')).toBeOnTheScreen();
  });
});
