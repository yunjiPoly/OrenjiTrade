import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import MapScreen from '@/app/(tabs)/index';
import { baseWindow } from '@/src/features/map/mapWindow';
import { loadRegionOutline } from '@/src/features/map/regionOutline';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { binderCountsFixture, meFixture, regionsFixture } from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

// The frame the page of these tests gives the map: 58% of its 669 points.
const FRAME = { width: 360, height: 388 };
const COUNTS = 'GET /api/v1/regions/{region}/binder-counts';

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
    [COUNTS]: ok(binderCountsFixture()),
    ...extra,
  });
}

const render = () => renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });

/**
 * The page, then the map, have a size once they are laid out (jest lays nothing out by itself).
 * The map waits for the page: it is drawn once, at its real size.
 */
async function layOutMap() {
  fireEvent(screen.getByTestId('map-scroll'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 392, height: 669 } },
  });
  fireEvent(screen.getByTestId('region-map-frame'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, ...FRAME } },
  });
  return screen.findByTestId('map-drawing');
}

/** Where the middle of a state's box is on the laid-out map, at the first view. */
async function pointOf(region: string, code: string) {
  const outline = await loadRegionOutline(region);
  const window = baseWindow(outline, FRAME);
  const [left = 0, top = 0, right = 0, bottom = 0] =
    outline.shapes.find((shape) => shape.code === code)?.box ?? [];
  return {
    x: (((left + right) / 2 - window.x) * FRAME.width) / window.width,
    y: (((top + bottom) / 2 - window.y) * FRAME.height) / window.height,
  };
}

/** The map sits 20 points from the left and 100 from the top of the screen in these touches. */
function touch(x: number, y: number) {
  const pageX = x + 20;
  const pageY = y + 100;
  return {
    nativeEvent: { pageX, pageY, locationX: x, locationY: y, touches: [{ pageX, pageY }] },
  };
}

function tap(x: number, y: number) {
  const map = screen.getByTestId('region-map');
  fireEvent(map, 'responderGrant', touch(x, y));
  fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
}

const viewBox = () => {
  const { minX, minY, vbWidth, vbHeight } = screen.getByTestId('map-drawing').props;
  return {
    x: minX as number,
    y: minY as number,
    width: vbWidth as number,
    height: vbHeight as number,
  };
};

const placeRoute = (region: string, code: string) => ({
  pathname: '/regions/[region]/[code]',
  params: { region, code },
});

describe('Map tab: the region map (ADR 0017)', () => {
  it('names the browsed region, counts its binders and draws it shaded from the bundled borders', async () => {
    const api = mockApi(routes());
    render();
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (North)');
    expect(screen.getByRole('header', { name: 'Binders in Americas (North)' })).toBeOnTheScreen();
    // The title follows the system text size up to twice its size: beyond, "Americas" no longer
    // fits the width of a phone and is cut in two.
    expect(screen.getByTestId('map-title').props.maxFontSizeMultiplier).toBe(2);
    expect(api.callsTo(COUNTS).map((call) => call.path)).toEqual([
      '/api/v1/regions/americas-north/binder-counts',
    ]);
    expect(screen.getByRole('button', { name: 'Region: Americas (North)' })).toBeOnTheScreen();

    // One image for screen readers, which choose a place from the list.
    const map = screen.getByRole('image', {
      name: 'Map of Americas (North): states and provinces shaded by their number of public binders',
    });
    expect(map.props.accessibilityHint).toBe('To choose a state or province, use the list.');

    await layOutMap();
    // Every state in one path, the country borders in another, one more per shaded state.
    expect(screen.getByTestId('map-states').props.d).toMatch(/^M\d+ \d+l/);
    expect(screen.getByTestId('map-countries').props.fill).toBeFalsy();
    expect(screen.getByTestId('map-shape-CA-QC').props.fillOpacity).toBe(0.48);
    expect(screen.getByTestId('map-shape-CA-ON').props.fillOpacity).toBe(0.28);
    expect(screen.queryByTestId('map-shape-US-WY')).toBeNull();
    expect(screen.queryAllByTestId(/^map-shape-/)).toHaveLength(2);
    expect(screen.queryByTestId(/^map-selected-/)).toBeNull();
    // The first view, in the shape of the frame.
    const first = viewBox();
    expect(first.width / first.height).toBeCloseTo(FRAME.width / FRAME.height, 2);

    // The legend is for the eye; the privacy note stays.
    expect(screen.queryByTestId('map-legend')).toBeNull();
    expect(screen.getByTestId('map-legend', { includeHiddenElements: true })).toHaveTextContent(
      /None.*2–4.*10\+.*Natural Earth/
    );
    expect(screen.getByTestId('map-privacy-note')).toHaveTextContent(
      /never uses your GPS: collectors choose their state or province/
    );
    // No collector position is asked for, no map provider, and no location prompt for a
    // collector who has one.
    expect(api.calls.some((call) => /collectors\/nearby|preview|tile/.test(call.path))).toBe(false);
    expect(screen.queryByTestId('map-choose-location')).toBeNull();
  });

  it('opens the state or province under a tap, and outlines it', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();

    const wyoming = await pointOf('americas-north', 'US-WY');
    tap(wyoming.x, wyoming.y);
    expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('americas-north', 'US-WY'));
    expect(await screen.findByTestId('map-selected-US-WY')).toBeOnTheScreen();

    // The sea opens nothing.
    mockRouter.push.mockClear();
    tap(4, FRAME.height - 4);
    expect(mockRouter.push).not.toHaveBeenCalled();

    // A drag is not a tap, nor is a pinch.
    const map = screen.getByTestId('region-map');
    fireEvent(map, 'responderGrant', touch(wyoming.x, wyoming.y));
    fireEvent(map, 'responderMove', touch(wyoming.x + 30, wyoming.y + 12));
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('zooms with the buttons and with two fingers, moves with one, and comes back', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    const first = viewBox();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoomOut).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Show the whole region' })).toBeNull();

    fireEvent.press(zoomIn);
    const twice = viewBox();
    expect(twice.width).toBeCloseTo(first.width / 2, 1);
    // About the centre of the frame.
    expect(twice.x + twice.width / 2).toBeCloseTo(first.x + first.width / 2, 1);
    expect(zoomOut).not.toBeDisabled();

    // One finger drags the map: nothing is redrawn while it moves (the picture is slid), then
    // the vectors are drawn once for the new window.
    const map = screen.getByTestId('region-map');
    fireEvent(map, 'responderGrant', touch(200, 150));
    fireEvent(map, 'responderMove', touch(150, 120));
    expect(viewBox()).toEqual(twice);
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    const moved = viewBox();
    expect(moved.x).toBeCloseTo(twice.x + (50 * twice.width) / FRAME.width, 1);
    expect(moved.y).toBeCloseTo(twice.y + (30 * twice.height) / FRAME.height, 1);
    expect(moved.width).toBe(twice.width);

    // Two fingers moving apart zoom in.
    const two = (spread: number) => ({
      nativeEvent: {
        pageX: 200,
        pageY: 250,
        locationX: 180,
        locationY: 150,
        touches: [
          { pageX: 200 - spread / 2, pageY: 250 },
          { pageX: 200 + spread / 2, pageY: 250 },
        ],
      },
    });
    fireEvent(map, 'responderGrant', two(80));
    fireEvent(map, 'responderMove', two(160));
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    expect(viewBox().width).toBeCloseTo(moved.width / 2, 1);

    fireEvent.press(screen.getByRole('button', { name: 'Show the whole region' }));
    expect(viewBox()).toEqual(first);
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

    // The maximum: sixteen times the first view.
    for (let press = 0; press < 6; press++) {
      fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    }
    expect(viewBox().width).toBeCloseTo(first.width / 16, 1);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  it('draws nothing before the page is laid out, then once at the size the page gives it', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    const frame = screen.getByTestId('region-map-frame');
    // Laid out too early (the page has no height yet): the skeleton stays, nothing is drawn.
    fireEvent(frame, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 240 } },
    });
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    expect(screen.getByLabelText('Loading the map')).toBeOnTheScreen();
    expect(frame.props.style).toEqual(expect.arrayContaining([{ height: 240 }]));

    // The page is 669 points high under the header: the map takes 58% of it.
    fireEvent(screen.getByTestId('map-scroll'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 392, height: 669 } },
    });
    expect(screen.getByTestId('region-map-frame').props.style).toEqual(
      expect.arrayContaining([{ height: 388 }])
    );
    // The frame was measured at its first height and has not been measured at the new one yet:
    // still nothing is drawn (a map drawn now would be drawn again a moment later).
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    fireEvent(frame, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 388 } },
    });
    const drawing = await screen.findByTestId('map-drawing');
    expect(drawing.props.bbWidth).toBe(360);
    expect(drawing.props.bbHeight).toBe(388);
    expect(screen.queryByLabelText('Loading the map')).toBeNull();
  });

  it('tells the page to stand still while a finger is on the map', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    const page = screen.getByTestId('map-scroll');
    expect(page.props.scrollEnabled).toBe(true);
    const map = screen.getByTestId('region-map');
    fireEvent(map, 'responderGrant', touch(100, 100));
    expect(page.props.scrollEnabled).toBe(false);
    fireEvent(map, 'responderTerminate', { nativeEvent: { touches: [] } });
    expect(page.props.scrollEnabled).toBe(true);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('follows the region switcher: the counts, the names and the drawing of the other region', async () => {
    const api = mockApi(
      routes({
        [COUNTS]: (request) =>
          ok(
            request.path.includes('/europe/')
              ? binderCountsFixture({
                  region: 'europe',
                  total: 1,
                  subdivisions: [{ code: 'FR-BRE', binderCount: 1 }],
                })
              : binderCountsFixture()
          ),
      })
    );
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    const north = viewBox();

    fireEvent.press(screen.getByTestId('map-region'));
    fireEvent.press(screen.getByTestId('map-region-option-europe'));
    expect(await screen.findByText('1 public binder in Europe')).toBeOnTheScreen();
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Europe');
    expect(api.callsTo(COUNTS).at(-1)?.path).toBe('/api/v1/regions/europe/binder-counts');
    expect(
      screen.getByRole('image', {
        name: 'Map of Europe: states and provinces shaded by their number of public binders',
      })
    ).toBeOnTheScreen();
    // Away from home, at a glance.
    expect(screen.getByTestId('map-region-away')).toHaveTextContent(/Not your region/);
    // Another drawing, with its own shaded states.
    expect(await screen.findByTestId('map-shape-FR-BRE')).toBeOnTheScreen();
    expect(screen.queryByTestId('map-shape-CA-QC')).toBeNull();
    expect(viewBox()).not.toEqual(north);
  });

  it('says so while the binders are counted, and offers a retry when they cannot be', async () => {
    const api = mockApi(
      routes({
        [COUNTS]: [problem(503, 'SERVICE_UNAVAILABLE', 'down'), ok(binderCountsFixture())],
      })
    );
    render();
    expect(await screen.findByText('Counting binders…')).toBeOnTheScreen();
    expect(await screen.findByText('Binder counts could not load')).toBeOnTheScreen();
    expect(screen.getByTestId('map-counts-error')).toBeOnTheScreen();
    // The map is still drawn (its borders need no network), without shading.
    await layOutMap();
    expect(screen.queryAllByTestId(/^map-shape-/)).toHaveLength(0);

    fireEvent.press(screen.getByTestId('map-counts-retry'));
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(screen.queryByTestId('map-counts-error')).toBeNull();
    expect(api.callsTo(COUNTS)).toHaveLength(2);
    expect(await screen.findByTestId('map-shape-CA-QC')).toBeOnTheScreen();
  });

  it('defaults to Americas (North) and invites a collector without a location to choose one', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/me': ok(
          meFixture({
            homeRegion: undefined,
            onboarding: { profileComplete: true, locationSet: false, interestsSet: true },
          })
        ),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('map-choose-location'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
    expect(screen.getByTestId('map-location-prompt')).toHaveTextContent(/Where are you\?/);
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(api.callsTo(COUNTS).map((call) => call.path)).toEqual([
      '/api/v1/regions/americas-north/binder-counts',
    ]);
  });

  it('opens on a region and a state from a link, once', async () => {
    mockParams.current = { region: 'europe', subdivision: 'fr-bre' };
    const api = mockApi(routes());
    const view = render();
    await waitFor(() =>
      expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Europe')
    );
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('europe', 'FR-BRE'))
    );
    expect(api.callsTo(COUNTS).at(-1)?.path).toBe('/api/v1/regions/europe/binder-counts');
    await layOutMap();
    expect(screen.getByTestId('map-selected-FR-BRE')).toBeOnTheScreen();
    // Coming back to the tab does not open it again.
    view.rerender(<MapScreen />);
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('ignores a link that names no region or place the app could ask for', async () => {
    mockParams.current = { region: 'Montréal 45.5,-73.6', subdivision: 'not a code' };
    const api = mockApi(routes());
    render();
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(api.callsTo(COUNTS).every((call) => call.path.includes('/americas-north/'))).toBe(true);
  });
});

describe('Map tab: the list of states and provinces', () => {
  const openList = async () => {
    fireEvent.press(await screen.findByRole('tab', { name: 'List' }));
    return screen.findByTestId('place-list');
  };

  it('lists every place of the region by country with its count, as links a screen reader can name', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    expect(screen.getByRole('tab', { name: 'Map' })).toBeSelected();
    await openList();
    expect(screen.getByRole('tab', { name: 'List' })).toBeSelected();
    expect(screen.queryByTestId('region-map')).toBeNull();
    // The region switcher, the title and the count stay on top of the list.
    expect(screen.getByRole('button', { name: 'Region: Americas (North)' })).toBeOnTheScreen();
    expect(screen.getByTestId('map-status')).toHaveTextContent(
      '3 public binders in Americas (North)'
    );

    expect(screen.getByRole('header', { name: 'States and provinces' })).toBeOnTheScreen();
    // A country header sticks to the top of the list: the space above its name is part of it
    // (padding, with its own background), or the rows show through above the name.
    const country = screen.getByTestId('place-country-CA');
    expect(country).toHaveStyle({ paddingTop: 16 });
    expect(country.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ marginTop: expect.anything() })])
    );
    expect(screen.getByRole('header', { name: 'Canada, 3 public binders' })).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'United States, No public binders' })
    ).toBeOnTheScreen();
    const rows = screen.getAllByRole('link').map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual([
      'Ontario, 1 public binder',
      'Quebec, 2 public binders',
      'Wyoming, No public binders',
    ]);
    expect(screen.getByTestId('place-count-CA-QC')).toHaveTextContent('2');
    expect(screen.getByTestId('place-row-CA-QC').props.accessibilityHint).toBe(
      'Opens its public binders'
    );

    fireEvent.press(screen.getByRole('link', { name: 'Quebec, 2 public binders' }));
    expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('americas-north', 'CA-QC'));
    // The place opened last is marked.
    expect(screen.getByTestId('place-row-CA-QC')).toBeSelected();
    expect(screen.getByTestId('place-row-CA-ON')).not.toBeSelected();
  });

  it('filters by text (accents folded, a country name keeps its places) and by "only with binders"', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await openList();
    const labels = () => screen.queryAllByRole('link').map((row) => row.props.accessibilityLabel);

    fireEvent.changeText(screen.getByLabelText('Find a state or province'), 'québ');
    expect(labels()).toEqual(['Quebec, 2 public binders']);
    fireEvent.changeText(screen.getByLabelText('Find a state or province'), 'united');
    expect(labels()).toEqual(['Wyoming, No public binders']);
    fireEvent.changeText(screen.getByLabelText('Find a state or province'), 'atlantis');
    expect(labels()).toEqual([]);
    expect(screen.getByTestId('place-list-empty')).toHaveTextContent(
      'No state or province matches.'
    );

    fireEvent.changeText(screen.getByLabelText('Find a state or province'), '');
    fireEvent.press(screen.getByRole('switch', { name: 'Only places with binders' }));
    expect(labels()).toEqual(['Ontario, 1 public binder', 'Quebec, 2 public binders']);
    expect(screen.queryByRole('header', { name: /United States/ })).toBeNull();
  });

  it('shows a skeleton while the places load and a retry when they cannot be read', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/regions': [problem(503, 'SERVICE_UNAVAILABLE', 'down'), ok(regionsFixture())],
      })
    );
    render();
    await openList();
    expect(await screen.findByTestId('place-list-error')).toHaveTextContent(
      /The list of places could not load/
    );
    fireEvent.press(within(screen.getByTestId('place-list-error')).getByRole('button'));
    expect(await screen.findByRole('link', { name: 'Quebec, 2 public binders' })).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/regions')).toHaveLength(2);
  });

  it('names the places without a number until the counts are known', async () => {
    mockApi(routes({ [COUNTS]: problem(503, 'SERVICE_UNAVAILABLE', 'down') }));
    render();
    await openList();
    expect(await screen.findByRole('link', { name: 'Quebec' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Canada' })).toBeOnTheScreen();
    expect(screen.queryByTestId('place-count-CA-QC')).toBeNull();
    // Still a way in: the place opens and its own screen asks for its binders.
    fireEvent.press(screen.getByRole('link', { name: 'Quebec' }));
    expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('americas-north', 'CA-QC'));
  });

  it('lists the places of the region the switcher shows', async () => {
    mockApi(routes());
    render();
    await openList();
    await screen.findByRole('link', { name: /Quebec/ });
    fireEvent.press(screen.getByTestId('map-region'));
    fireEvent.press(screen.getByTestId('map-region-option-europe'));
    // A whole-country entry is listed under its country's name.
    expect(await screen.findByRole('link', { name: /^Vatican City/ })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: /^Brittany/ })).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: /Quebec/ })).toBeNull();
  });

  it('remembers the view on the device, and starts on the list while a screen reader is on', async () => {
    mockApi(routes());
    const first = render();
    await openList();
    expect(useAppStore.getState().prefs.mapView).toBe('list');
    first.unmount();

    render();
    expect(await screen.findByTestId('place-list')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('tab', { name: 'Map' }));
    expect(await screen.findByTestId('region-map')).toBeOnTheScreen();
    expect(useAppStore.getState().prefs.mapView).toBe('map');
  });

  it('starts on the list for a screen reader user who has not chosen a view', async () => {
    const enabled = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    try {
      mockApi(routes());
      render();
      expect(await screen.findByTestId('place-list')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'List' })).toBeSelected();
      // Nothing was chosen for them: turning the screen reader off shows the map again.
      expect(useAppStore.getState().prefs.mapView).toBeNull();
    } finally {
      enabled.mockRestore();
    }
  });
});
