import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions, FlatList } from 'react-native';

import SetScreen from '@/app/sets/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  PRINTING_A,
  SET_ID,
  printingFixture,
  setDetailFixture,
} from '../support/fixtures';
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

const WINDOW = Dimensions.get('window');
/** Sets the system text size (Jest's React Native starts at 2); put back after each test. */
function textSize(fontScale: number) {
  act(() => {
    Dimensions.set({ window: { ...WINDOW, fontScale }, screen: { ...WINDOW, fontScale } });
  });
}
afterEach(() => {
  act(() => {
    Dimensions.set({ window: WINDOW, screen: WINDOW });
  });
});

describe('Set page', () => {
  it('shows the set, its printings, opens a card and the filtered search', async () => {
    const api = mockApi(signedInRoutes({ 'GET /api/v1/sets/{id}': ok(setDetailFixture()) }));
    render();
    expect(screen.getByTestId('set-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('set-name')).toHaveTextContent('Scarlet Expanse');
    expect(screen.getByTestId('set-meta')).toHaveTextContent(
      'SVX · Released Mar 1, 2026 · 2 printings'
    );
    // Mockup v50 screen 69: the top bar names the set, the game above its name.
    expect(screen.getAllByRole('header', { name: 'Scarlet Expanse' })).toHaveLength(2);
    expect(screen.getByText('POKÉMON')).toBeOnTheScreen();
    // A grid tile: the code and the rarity under the picture, named for VoiceOver.
    expect(screen.getByTestId(`set-printing-${PRINTING_A}`)).toHaveProp(
      'accessibilityHint',
      'Opens who has this card, at this printing'
    );
    expect(api.callsTo('GET /api/v1/sets/{id}')[0]?.query.get('size')).toBe('40');
    fireEvent.press(screen.getByTestId(`set-printing-${PRINTING_A}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: PRINTING_A },
    });
    expect(screen.getByTestId('set-search')).toHaveTextContent(/Who has cards of this set$/);
    fireEvent.press(screen.getByTestId('set-search'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { game: 'pokemon', set: 'SVX', setName: 'Scarlet Expanse', typing: '1' },
    });
  });

  it('lays the printings out in three columns, two at the largest text sizes (R14 review fix 1, F4)', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/sets/{id}': ok(setDetailFixture()) }));
    textSize(1);
    render();
    // Mockup v50 screen 69: a three-column grid at the default size.
    await screen.findByTestId('set-printings');
    expect(screen.UNSAFE_getByType(FlatList).props.numColumns).toBe(3);
    screen.unmount();

    // At the largest sizes two columns keep a printing's code whole.
    textSize(3.1);
    render();
    await screen.findByTestId('set-printings');
    expect(screen.UNSAFE_getByType(FlatList).props.numColumns).toBe(2);
  });

  it('loads the next page of printings at the end of the grid (R14 review fix 1, F1)', async () => {
    // A set of 42 printings: a page of 40, then 2 more (real sets hold over a hundred).
    const all = Array.from({ length: 42 }, (_, index) =>
      printingFixture({
        id: `svx-printing-${index}`,
        printingCode: `SVX-${String(index + 1).padStart(3, '0')}`,
        collectorNumber: String(index + 1).padStart(3, '0'),
      })
    );
    const page = (number: number) =>
      setDetailFixture({
        printings: {
          items: number === 0 ? all.slice(0, 40) : all.slice(40),
          page: number,
          size: 40,
          totalItems: 42,
          totalPages: 2,
        },
      });
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/sets/{id}': (request) => ok(page(request.query.get('page') === '1' ? 1 : 0)),
      })
    );
    render();
    const grid = await screen.findByTestId('set-printings');
    expect(grid.props.data).toHaveLength(40);
    expect(screen.getByTestId('set-meta')).toHaveTextContent(/42 printings$/);
    fireEvent(grid, 'endReached');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/sets/{id}').at(-1)?.query.get('page')).toBe('1')
    );
    await waitFor(() => expect(screen.getByTestId('set-printings').props.data).toHaveLength(42));
    expect(screen.getByTestId('set-printings').props.data.at(-1)?.id).toBe('svx-printing-41');
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
