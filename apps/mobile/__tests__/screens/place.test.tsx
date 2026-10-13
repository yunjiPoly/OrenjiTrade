import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import PlaceBindersScreen from '@/app/regions/[region]/[code]';
import { placeBinderLabel } from '@/src/features/map/PlaceBinderRow';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  OTHER_ID,
  PUBLIC_BINDER_ID,
  QUEBEC,
  binderCountsFixture,
  meFixture,
  placeBindersPage,
  publicBinderSummaryFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const BINDERS = 'GET /api/v1/regions/{region}/subdivisions/{code}/binders';
const SECOND_BINDER = '00000000-0000-4000-8b00-0000000000c2';
const THIRD_BINDER = '00000000-0000-4000-8b00-0000000000c3';

/** A binder of a Quebec collector as the state list answers it: owner block with the place. */
function quebecBinder(overrides: Parameters<typeof publicBinderSummaryFixture>[0] = {}) {
  return publicBinderSummaryFixture({
    name: 'Pokémon holo binder',
    kind: 'SALE',
    itemCount: 4,
    games: ['pokemon'],
    owner: {
      id: OTHER_ID,
      handle: 'collector1',
      displayName: 'Maïka Tremblay',
      avatarUrl: null,
      place: QUEBEC,
    },
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-09T12:00:00Z',
      updatedAt: '2026-10-09T12:00:00Z',
      label: 'Updated 3 days ago',
    },
    ...overrides,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { region: 'americas-north', code: 'CA-QC' };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
    'GET /api/v1/regions/{region}/binder-counts': ok(binderCountsFixture()),
    [BINDERS]: ok(placeBindersPage([quebecBinder()])),
    ...extra,
  });
}

const render = () =>
  renderWithProviders(<PlaceBindersScreen />, { port: new FakeAuthPort(testUser()) });

describe('The public binders of a state or province', () => {
  it('shows a skeleton, then the place, its count and each binder with its owner, place and last update', async () => {
    const api = mockApi(routes());
    render();
    expect(screen.getByTestId('place-loading')).toBeOnTheScreen();
    const row = await screen.findByTestId(`place-binder-${PUBLIC_BINDER_ID}`);
    expect(screen.getByRole('header', { name: 'Quebec, Canada' })).toBeOnTheScreen();
    expect(screen.getByTestId('place-title').props.maxFontSizeMultiplier).toBe(2);
    // The place and its count are the head of the list: they scroll away with the binders.
    expect(within(screen.getByTestId('place-binders')).getByTestId('place-title')).toBeTruthy();
    expect(screen.getByText('Americas (North)')).toBeOnTheScreen();
    expect(await screen.findByTestId('place-count')).toHaveTextContent('2 public binders');

    // The binder name, the owner by name and handle, the state or province and the country, the
    // number of cards and when it was last updated.
    expect(row).toHaveTextContent(/Pokémon holo binder/);
    expect(row).toHaveTextContent(/For sale · 4 cards · Pokémon/);
    expect(screen.getByTestId(`place-binder-owner-${PUBLIC_BINDER_ID}`)).toHaveTextContent(
      'Maïka Tremblay @collector1'
    );
    expect(screen.getByTestId(`place-binder-place-${PUBLIC_BINDER_ID}`)).toHaveTextContent(
      'Quebec, Canada'
    );
    expect(screen.getByTestId(`place-binder-updated-${PUBLIC_BINDER_ID}`)).toHaveTextContent(
      'Updated 3 days ago'
    );
    // One link with a name that says it all, in that order.
    expect(
      screen.getByRole('link', {
        name: 'Pokémon holo binder, For sale, 4 cards, by Maïka Tremblay, @collector1, Quebec, Canada, Updated 3 days ago',
      })
    ).toBe(row);
    expect(row.props.accessibilityHint).toBe('Opens the public binder');

    // The region and the code are in the path, the page size in the query, nothing else.
    const call = api.callsTo(BINDERS)[0];
    expect(call?.path).toBe('/api/v1/regions/americas-north/subdivisions/CA-QC/binders');
    expect([...(call?.query.keys() ?? [])]).toEqual(['limit']);
    expect(call?.query.get('limit')).toBe('20');

    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: PUBLIC_BINDER_ID, view: 'public' },
    });
  });

  it('never shows a city, even if an answer carried one', async () => {
    // Not something the API sends (GeoPrivacyContractTest): the row only ever reads `place.label`.
    const leaky = quebecBinder();
    Object.assign(leaky.owner ?? {}, { city: 'Montréal', location: { city: 'Montréal' } });
    Object.assign(leaky.owner?.place ?? {}, { city: 'Montréal' });
    mockApi(routes({ [BINDERS]: ok(placeBindersPage([leaky])) }));
    render();
    const row = await screen.findByTestId(`place-binder-${PUBLIC_BINDER_ID}`);
    expect(row).toHaveTextContent(/Quebec, Canada/);
    expect(screen.queryByText(/Montréal/)).toBeNull();
    expect(row.props.accessibilityLabel).not.toMatch(/Montréal/);
    // Without a place the row says nothing about where (never a guess).
    expect(placeBinderLabel(quebecBinder({ owner: undefined }))).toBe(
      'Pokémon holo binder, For sale, 4 cards, Updated 3 days ago'
    );
  });

  it('reads the next pages by cursor, and offers a retry when one fails', async () => {
    const api = mockApi(
      routes({
        [BINDERS]: (request) => {
          const cursor = request.query.get('cursor');
          if (cursor === null) {
            return ok(placeBindersPage([quebecBinder()], 'cursor-2'));
          }
          if (cursor === 'cursor-2') {
            return api.callsTo(BINDERS).length === 2
              ? problem(503, 'SERVICE_UNAVAILABLE', 'down')
              : ok(
                  placeBindersPage(
                    [quebecBinder({ id: SECOND_BINDER, name: 'Second binder' })],
                    'cursor-3'
                  )
                );
          }
          return ok(placeBindersPage([quebecBinder({ id: THIRD_BINDER, name: 'Third binder' })]));
        },
      })
    );
    render();
    await screen.findByTestId(`place-binder-${PUBLIC_BINDER_ID}`);
    const list = screen.getByTestId('place-binders');

    fireEvent(list, 'endReached');
    // The second page fails once: the list keeps what it has and its footer offers a retry.
    fireEvent.press(await screen.findByTestId('place-more-retry'));
    expect(await screen.findByTestId(`place-binder-${SECOND_BINDER}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`place-binder-${PUBLIC_BINDER_ID}`)).toBeOnTheScreen();

    fireEvent(list, 'endReached');
    expect(await screen.findByTestId(`place-binder-${THIRD_BINDER}`)).toBeOnTheScreen();
    expect(api.callsTo(BINDERS).map((call) => call.query.get('cursor'))).toEqual([
      null,
      'cursor-2',
      'cursor-2',
      'cursor-3',
    ]);

    // The last page: nothing more is asked.
    fireEvent(list, 'endReached');
    await waitFor(() => expect(screen.queryByTestId('place-more-loading')).toBeNull());
    expect(api.callsTo(BINDERS)).toHaveLength(4);
  });

  it('says so when a place has no public binder', async () => {
    mockParams.current = { region: 'americas-north', code: 'us-wy' };
    const api = mockApi(routes({ [BINDERS]: ok(placeBindersPage([])) }));
    render();
    expect(await screen.findByTestId('place-empty')).toHaveTextContent(
      /No public binders here yet.*while their owner is discoverable and keeps them public and fresh/
    );
    expect(screen.getByRole('header', { name: 'Wyoming, United States' })).toBeOnTheScreen();
    expect(await screen.findByTestId('place-count')).toHaveTextContent('No public binders');
    // The code of a link is upper-cased before it is asked for.
    expect(api.callsTo(BINDERS)[0]?.path).toBe(
      '/api/v1/regions/americas-north/subdivisions/US-WY/binders'
    );
  });

  it('shows an error with a retry', async () => {
    const api = mockApi(
      routes({
        [BINDERS]: [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(placeBindersPage([quebecBinder()])),
        ],
      })
    );
    render();
    expect(await screen.findByTestId('place-error')).toHaveTextContent(
      /We could not load these binders/
    );
    fireEvent.press(screen.getByTestId('place-error-retry'));
    expect(await screen.findByTestId(`place-binder-${PUBLIC_BINDER_ID}`)).toBeOnTheScreen();
    expect(api.callsTo(BINDERS)).toHaveLength(2);
  });

  it('lets the server judge a place it does not know', async () => {
    mockParams.current = { region: 'europe', code: 'CA-QC' };
    mockApi(
      routes({
        [BINDERS]: problem(404, 'NOT_FOUND', 'This state or province is not in the region.'),
      })
    );
    render();
    expect(await screen.findByTestId('place-error')).toBeOnTheScreen();
    // Europe does not list Quebec: the title falls back to the code, never to a guess.
    expect(screen.getByTestId('place-title')).toHaveTextContent('CA-QC');
    expect(screen.getByText('Europe')).toBeOnTheScreen();
  });

  it('asks nothing for a link that names no place', async () => {
    mockParams.current = { region: 'americas-north', code: 'montreal-45.5' };
    const api = mockApi(routes());
    render();
    expect(await screen.findByTestId('place-unknown')).toHaveTextContent(
      /This place is not on the map/
    );
    fireEvent.press(screen.getByRole('button', { name: 'Open the map' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/');
    expect(api.callsTo(BINDERS)).toHaveLength(0);
  });
});
