import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import SearchScreen from '@/app/(tabs)/search';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import { BROWSING_REGION_STORAGE_KEY } from '@/src/features/regions/browsingRegion';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  PUBLIC_BINDER_ID,
  cardPage,
  cardSummaryFixture,
  markerFixture,
  meFixture,
  searchBinderFixture,
  unifiedSearchFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockAnswer } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(async () => {
  resetRouterMock();
  resetAppState();
  await AsyncStorage.clear();
  useRecentSearchesStore.setState({ byUser: {} });
});

function render() {
  return renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
}

const CARDS = signedInRoutes({ 'GET /api/v1/cards': ok(cardPage([cardSummaryFixture()])) });

describe('Search tab segments (the web /search tabs)', () => {
  it('finds collectors by name or handle with their state or province, never a distance', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/search': (request) =>
        ok(
          unifiedSearchFixture({
            query: request.query.get('q') ?? '',
            collectors: request.query.get('q') === 'noé' ? [markerFixture()] : [],
          })
        ),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    expect(await screen.findByTestId('search-collectors-invite')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé');
    const row = await screen.findByTestId('collector-result-collector2');
    expect(row).toHaveTextContent(/Noé Verdun/);
    expect(row).toHaveTextContent(/@collector2 · Ontario, Canada/);
    expect(row).toHaveTextContent(/4\.8 \(12 ratings\) · 1 public binder · 14 cards/);
    expect(screen.getByTestId('search-collectors-count')).toHaveTextContent(
      '1 collector for “noé”'
    );
    // The home region scopes the search (ADR 0017); only the collectors section is asked for.
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('region')).toBe('americas-north');
    expect(query?.get('lat')).toBeNull();
    expect(query?.getAll('types')).toEqual(['collectors']);
    expect(screen.queryByText(/km/)).toBeNull();

    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
    // The search is remembered for the Collectors segment only.
    expect(useRecentSearchesStore.getState().byUser['uid-maika/collectors']).toEqual(['noé']);
    expect(useRecentSearchesStore.getState().byUser['uid-maika']).toBeUndefined();
  });

  it('searches the default region without a location, and explains no match', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(
        meFixture({
          homeRegion: undefined,
          onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
        })
      ),
      'GET /api/v1/search': ok(unifiedSearchFixture({ query: 'zzz' })),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    fireEvent.changeText(await screen.findByTestId('search-collectors-input'), 'zzz');
    expect(await screen.findByText('No collectors match')).toBeOnTheScreen();
    expect(
      screen.getByText('Collectors appear when they are on the map and allow name search.')
    ).toBeOnTheScreen();
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('region')).toBe('americas-north');
    expect(query?.has('lat')).toBe(false);
    expect(query?.has('lng')).toBe(false);
  });

  it("searches the region the switcher shows, and says which one when it is not the collector's own", async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
      'GET /api/v1/search': (request) =>
        ok(
          unifiedSearchFixture({
            query: request.query.get('q') ?? '',
            region: request.query.get('region') ?? '',
            collectors: request.query.get('region') === 'europe' ? [] : [markerFixture()],
          })
        ),
    });
    render();
    // The switcher sits on top of the tab, whatever the segment.
    expect(
      await screen.findByRole('button', { name: 'Region: Americas (North)' })
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    expect(await screen.findByText('Who trades in your region?')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé');
    expect(await screen.findByTestId('collector-result-collector2')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search').at(-1)?.query.get('region')).toBe('americas-north');

    // Another region: the same search is asked again there, at once.
    fireEvent.press(screen.getByTestId('search-region'));
    fireEvent.press(screen.getByTestId('search-region-option-europe'));
    expect(await screen.findByText('No collectors match')).toBeOnTheScreen();
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('region')).toBe('europe');
    expect(query?.get('q')).toBe('noé');
    expect(screen.getByRole('button', { name: 'Region: Europe' })).toBeOnTheScreen();
    expect(screen.getByTestId('search-region-away')).toHaveTextContent(/Not your region/);

    // The invitation names the region being browsed.
    fireEvent.changeText(screen.getByTestId('search-collectors-input'), '');
    expect(await screen.findByText('Who trades in Europe?')).toBeOnTheScreen();
    expect(screen.getByText('Search a collector of Europe by name or handle.')).toBeOnTheScreen();
    // The invitation has the height of what is left of the tab: without one it collapsed on iOS
    // and only its icon showed, over the field.
    expect(screen.getByTestId('search-collectors-idle')).toHaveStyle({ flex: 1 });

    // Back home in one press.
    fireEvent.press(screen.getByRole('button', { name: 'Back to Americas (North)' }));
    expect(await screen.findByText('Who trades in your region?')).toBeOnTheScreen();
    expect(screen.queryByTestId('search-region-away')).toBeNull();
  });

  it('never leaves the results of the region before under the name of the new one', async () => {
    // The answer of Europe is slow: what is on screen meanwhile must not be Ontario's collector
    // under "Region: Europe".
    let answerEurope: (answer: MockAnswer) => void = () => undefined;
    const europe = new Promise<MockAnswer>((resolve) => {
      answerEurope = resolve;
    });
    mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
      'GET /api/v1/search': (request) =>
        request.query.get('region') === 'europe'
          ? europe
          : ok(
              unifiedSearchFixture({
                query: request.query.get('q') ?? '',
                collectors:
                  request.query.get('q') === 'zzz' ? [] : [markerFixture({ handle: 'collector2' })],
              })
            ),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    fireEvent.changeText(await screen.findByTestId('search-collectors-input'), 'noé');
    expect(await screen.findByTestId('collector-result-collector2')).toBeOnTheScreen();

    // In the same region, the rows stay while another text is searched (no flash of skeleton).
    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé v');
    await waitFor(() =>
      expect(screen.getByTestId('search-collectors-count')).toHaveTextContent(/for “noé v”/)
    );
    expect(screen.queryByTestId('search-collectors-loading')).toBeNull();
    expect(screen.getByTestId('collector-result-collector2')).toBeOnTheScreen();

    // Another region: nothing of the region before stays, the list shows its skeleton.
    fireEvent.press(screen.getByTestId('search-region'));
    fireEvent.press(screen.getByTestId('search-region-option-europe'));
    expect(await screen.findByTestId('search-collectors-loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Region: Europe' })).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-result-collector2')).toBeNull();
    expect(screen.queryByTestId('search-collectors-count')).toBeNull();
    expect(screen.queryByText(/Ontario/)).toBeNull();

    answerEurope(
      ok(
        unifiedSearchFixture({
          query: 'noé v',
          region: 'europe',
          collectors: [
            markerFixture({
              handle: 'collector8',
              displayName: 'Noé Vasseur',
              place: {
                regionCode: 'europe',
                countryCode: 'FR',
                countryName: 'France',
                subdivisionCode: 'FR-BRE',
                subdivisionName: 'Brittany',
                label: 'Brittany, France',
              },
            }),
          ],
        })
      )
    );
    expect(await screen.findByTestId('collector-result-collector8')).toHaveTextContent(
      /Brittany, France/
    );
    expect(screen.queryByTestId('search-collectors-loading')).toBeNull();
  });

  it('asks nothing in Americas (North) first when the device kept another region for a collector without a location', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(
        meFixture({
          homeRegion: undefined,
          onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
        })
      ),
      'GET /api/v1/search': ok(unifiedSearchFixture({ query: 'zzz', region: 'americas-south' })),
    });
    // The device answers late: the search is typed before the region is settled.
    const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
    let release: () => void = () => undefined;
    storage.getItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve('americas-south');
        })
    );
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    fireEvent.changeText(await screen.findByTestId('search-collectors-input'), 'zzz');
    // The query is debounced and `/me` answered long before this: still nothing is asked.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(api.callsTo('GET /api/v1/me').length).toBeGreaterThan(0);
    expect(api.callsTo('GET /api/v1/search')).toHaveLength(0);

    release();
    expect(await screen.findByText('No collectors match')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search').map((call) => call.query.get('region'))).toEqual([
      'americas-south',
    ]);
    expect(screen.getByRole('button', { name: 'Region: Americas (South)' })).toBeOnTheScreen();
  });

  it('keeps only the region switcher and the segments above the list: the field scrolls with the results', async () => {
    mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
      'GET /api/v1/search': [
        problem(503, 'SERVICE_UNAVAILABLE', 'down'),
        ok(unifiedSearchFixture({ query: 'noé', collectors: [markerFixture()] })),
      ],
    });
    render();
    // What stays on screen follows the system text size only a little (at the largest sizes it
    // took the whole screen): the switcher and its "not your region" line, and the segments.
    const pill = await screen.findByRole('button', { name: 'Region: Americas (North)' });
    expect(within(pill).getByText('Region: Americas (North)').props.maxFontSizeMultiplier).toBe(
      1.35
    );
    expect(pill.props.accessibilityShowsLargeContentViewer).toBe(true);
    fireEvent.press(screen.getByTestId('search-region'));
    await waitFor(() =>
      expect(screen.getByTestId('search-region-option-americas-north')).toHaveTextContent(
        /Your region/
      )
    );
    fireEvent.press(screen.getByTestId('search-region-option-europe'));
    const away = await screen.findByTestId('search-region-away');
    expect(within(away).getByText('Not your region.').props.maxFontSizeMultiplier).toBe(1.35);
    expect(within(away).getByText('Back to Americas (North)').props.maxFontSizeMultiplier).toBe(
      1.35
    );

    // Everything else is one list, whatever it shows: the invitation ...
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    const list = () => screen.getByTestId('search-collectors-results');
    expect(within(list()).getByTestId('search-collectors-input')).toBeOnTheScreen();
    expect(within(list()).getByTestId('search-collectors-invite')).toBeOnTheScreen();
    expect(within(list()).queryByTestId('search-region')).toBeNull();
    expect(within(list()).queryByTestId('search-segment')).toBeNull();
    // ... an error with its retry ...
    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé');
    expect(await within(list()).findByTestId('search-collectors-error')).toBeOnTheScreen();
    expect(within(list()).getByTestId('search-collectors-input')).toBeOnTheScreen();
    // ... then the rows. The field is the same one throughout: it keeps what was typed.
    fireEvent.press(screen.getByTestId('search-collectors-error-retry'));
    expect(await within(list()).findByTestId('collector-result-collector2')).toBeOnTheScreen();
    expect(within(list()).getByTestId('search-collectors-input').props.value).toBe('noé');
    // The content is at least as tall as the tab, so an empty list centres what it says.
    expect(list().props.contentContainerStyle).toEqual(expect.objectContaining({ flexGrow: 1 }));
  });

  it('keeps the keyboard while the first results arrive: the lists have their refresh control from the start', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
      'GET /api/v1/search': ok(
        unifiedSearchFixture({ query: 'noé', collectors: [markerFixture()] })
      ),
    });
    render();
    // React Native builds the content of a list again when a refresh control is added to it or
    // taken away (another place among the scroll view's children on iOS, a wrapper on Android):
    // a control that came with the first results took the keyboard from the field in the list's
    // head after one letter. So the control is there whatever the list shows.
    const refreshOf = (testID: string) =>
      screen.getByTestId(testID).props.refreshControl as
        { props: { refreshing: boolean; onRefresh: () => void } } | undefined;
    await screen.findByTestId('search-input');
    expect(refreshOf('search-results')).toBeDefined();
    await screen.findByTestId('search-count');
    expect(refreshOf('search-results')).toBeDefined();

    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    await screen.findByTestId('search-collectors-invite');
    const idle = refreshOf('search-collectors-results');
    expect(idle).toBeDefined();
    expect(idle?.props.refreshing).toBe(false);
    // Pulling a list that searched nothing asks nothing.
    act(() => idle?.props.onRefresh());
    expect(api.callsTo('GET /api/v1/search')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé');
    expect(await screen.findByTestId('collector-result-collector2')).toBeOnTheScreen();
    const listed = refreshOf('search-collectors-results');
    expect(listed).toBeDefined();
    // Pulling the results asks for them again, in the same region.
    act(() => listed?.props.onRefresh());
    await waitFor(() => expect(api.callsTo('GET /api/v1/search')).toHaveLength(2));
    expect(api.callsTo('GET /api/v1/search').map((call) => call.query.get('region'))).toEqual([
      'americas-north',
      'americas-north',
    ]);
  });

  it('finds public binders by name with their owner, and opens the public view', async () => {
    mockApi({
      ...CARDS,
      'GET /api/v1/search': ok(
        unifiedSearchFixture({ query: 'magic', binders: [searchBinderFixture()] })
      ),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-binders'));
    fireEvent.changeText(await screen.findByTestId('search-binders-input'), 'magic');
    const row = await screen.findByTestId(`binder-result-${PUBLIC_BINDER_ID}`);
    expect(row).toHaveTextContent(/Magic trades/);
    expect(row).toHaveTextContent(/Trade binder · 14 cards · Magic: The Gathering/);
    expect(row).toHaveTextContent(/Noé Verdun · Ontario, Canada/);
    expect(screen.getByTestId('search-binders-count')).toHaveTextContent(
      '1 public binder for “magic”'
    );
    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: PUBLIC_BINDER_ID, view: 'public' },
    });
  });

  it('shows the recent searches of a segment and searches again from one', async () => {
    useRecentSearchesStore.setState({ byUser: { 'uid-maika/binders': ['deck'] } });
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/search': ok(unifiedSearchFixture({ query: 'deck' })),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-binders'));
    fireEvent.press(await screen.findByRole('button', { name: 'Search again for deck' }));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/search').at(-1)?.query.get('q')).toBe('deck')
    );
    expect(await screen.findByText('No public binders match')).toBeOnTheScreen();
  });

  it('shows an error with retry', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/search': [
        problem(503, 'SERVICE_UNAVAILABLE', 'down'),
        ok(unifiedSearchFixture({ query: 'noé', collectors: [markerFixture()] })),
      ],
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    fireEvent.changeText(await screen.findByTestId('search-collectors-input'), 'noé');
    expect(await screen.findByTestId('search-collectors-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-collectors-error-retry'));
    expect(await screen.findByTestId('collector-result-collector2')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search')).toHaveLength(2);
  });

  it('opens a segment from a link (?tab=) and keeps the cards segment as before', async () => {
    mockParams.current = { tab: 'binders' };
    mockApi({ ...CARDS, 'GET /api/v1/search': ok(unifiedSearchFixture()) });
    render();
    expect(await screen.findByTestId('search-binders-invite')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-segment-cards'));
    expect(await screen.findByTestId('card-result-emberfang-fox-vmax')).toBeOnTheScreen();
  });
});
