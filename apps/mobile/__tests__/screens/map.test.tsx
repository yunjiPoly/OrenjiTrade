import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import MapScreen from '@/app/(tabs)/index';
import { baseWindow } from '@/src/features/map/mapWindow';
import { PlaceList } from '@/src/features/map/PlaceList';
import { HOLD_MS } from '@/src/features/map/RegionMap';
import { loadRegionOutline } from '@/src/features/map/regionOutline';
import {
  BROWSING_REGION_STORAGE_KEY,
  useBrowsingRegionStore,
} from '@/src/features/regions/browsingRegion';
import { useAppStore } from '@/src/store/useAppStore';
import { lightPalette } from '@/src/theme/palette';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { binderCountsFixture, meFixture, regionsFixture } from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, mockScrollToTopRefs, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

// The page of these tests is 669 points high under the header; the region switcher, the title and
// the Map | List switch take 221 of them. The map gets what is left, less the gap above it (12)
// and the strip kept for the top of the legend (48).
const PAGE_HEIGHT = 669;
const CHROME_HEIGHT = 221;
const FRAME = { width: 360, height: 388 };
const COUNTS = 'GET /api/v1/regions/{region}/binder-counts';
const NO_LOCATION = meFixture({
  homeRegion: undefined,
  onboarding: { profileComplete: true, locationSet: false, interestsSet: true },
});

beforeEach(async () => {
  resetRouterMock();
  resetAppState();
  await AsyncStorage.clear();
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
async function layOutMap(chromeHeight = CHROME_HEIGHT, frame = FRAME) {
  fireEvent(screen.getByTestId('map-scroll'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 392, height: PAGE_HEIGHT } },
  });
  fireEvent(screen.getByTestId('map-chrome'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: chromeHeight } },
  });
  fireEvent(screen.getByTestId('region-map-frame'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, ...frame } },
  });
  return screen.findByTestId('map-drawing');
}

const frameHeight = () =>
  (screen.getByTestId('region-map-frame').props.style as { height?: number }[]).find(
    (style) => typeof style?.height === 'number'
  )?.height;

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

/** "#4A1F00" for the colour react-native-svg was given (it keeps colours as numbers). */
function colourOf(value: unknown): string {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  const payload = (value as { payload?: number } | null)?.payload ?? (value as number);
  return `#${((payload >>> 0) & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
}

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
    // A place with binders is outlined in a strong colour (its tint alone is too pale to be
    // seen for a single binder); the others keep the quiet line of the mesh. Large places need
    // no mark.
    expect(colourOf(screen.getByTestId('map-shape-CA-ON').props.stroke)).toBe(
      lightPalette.onPrimaryContainer
    );
    expect(colourOf(screen.getByTestId('map-states').props.stroke)).toBe(lightPalette.borderStrong);
    expect(screen.queryAllByTestId(/^map-mark-/)).toHaveLength(0);
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

    // A place too small to hit is still picked a few points beside it: Bermuda is half a point
    // wide at the first view, alone in the open sea. Further out it is the sea again.
    const bermuda = await pointOf('americas-north', 'BM');
    tap(bermuda.x - 6, bermuda.y);
    expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('americas-north', 'BM'));
    mockRouter.push.mockClear();
    tap(bermuda.x + 30, bermuda.y);
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

  it('draws nothing before the page is laid out, then once at the size the page leaves it', async () => {
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
    expect(frameHeight()).toBe(240);

    // The page is 669 points high under the header and what stands above the map takes 221 of
    // them: the map gets the rest, less its gap and a strip for the top of the legend.
    fireEvent(screen.getByTestId('map-scroll'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 392, height: PAGE_HEIGHT } },
    });
    // The page alone is not enough: nothing is drawn until what stands above the map is measured.
    expect(screen.queryByTestId('map-drawing')).toBeNull();
    fireEvent(screen.getByTestId('map-chrome'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: CHROME_HEIGHT } },
    });
    expect(frameHeight()).toBe(388);
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

  it('fits the map and its buttons in what the page has left, and keeps a readable minimum', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    expect(frameHeight()).toBe(PAGE_HEIGHT - CHROME_HEIGHT - 12 - 48);
    // More stands above the map (a prompt, a line that wraps at a large text size): the map
    // shrinks with it, down to its minimum; the page then scrolls.
    fireEvent(screen.getByTestId('map-chrome'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 300 } },
    });
    expect(frameHeight()).toBe(309);
    fireEvent(screen.getByTestId('map-chrome'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } },
    });
    expect(frameHeight()).toBe(240);
  });

  it('lets a finger dragged over the whole region scroll the page', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    const page = screen.getByTestId('map-scroll');
    const map = screen.getByTestId('region-map');
    const first = viewBox();

    // One finger down on the map at its first view: the page is not told to stand still, and
    // the map gives the gesture up when the page asks for it.
    fireEvent(map, 'responderGrant', touch(180, 200));
    expect(page.props.scrollEnabled).toBe(true);
    expect(map.props.onResponderTerminationRequest()).toBe(true);
    // The drag moves nothing on the map (the page scrolls under the finger instead).
    fireEvent(map, 'responderMove', touch(180, 120));
    fireEvent(map, 'responderMove', touch(180, 60));
    expect(page.props.scrollEnabled).toBe(true);
    fireEvent(map, 'responderTerminate', { nativeEvent: { touches: [] } });
    expect(viewBox()).toEqual(first);
    expect(screen.queryByRole('button', { name: 'Show the whole region' })).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
    // The same when the finger is simply lifted after the drag: no place opens.
    fireEvent(map, 'responderGrant', touch(180, 200));
    fireEvent(map, 'responderMove', touch(150, 120));
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    expect(viewBox()).toEqual(first);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('keeps the gesture for the map once it is zoomed in, and for two fingers', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    const page = screen.getByTestId('map-scroll');
    const map = () => screen.getByTestId('region-map');

    // A second finger (a pinch) on the whole region: the map takes the gesture from there on.
    fireEvent(map(), 'responderGrant', touch(100, 100));
    expect(map().props.onResponderTerminationRequest()).toBe(true);
    fireEvent(map(), 'responderStart', {
      nativeEvent: {
        pageX: 200,
        pageY: 250,
        locationX: 180,
        locationY: 150,
        touches: [
          { pageX: 120, pageY: 200 },
          { pageX: 200, pageY: 250 },
        ],
      },
    });
    expect(page.props.scrollEnabled).toBe(false);
    expect(map().props.onResponderTerminationRequest()).toBe(false);
    fireEvent(map(), 'responderRelease', { nativeEvent: { touches: [] } });
    expect(page.props.scrollEnabled).toBe(true);

    // Zoomed in: one finger on the map moves the map, and the page stands still meanwhile.
    fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent(map(), 'responderGrant', touch(100, 100));
    expect(page.props.scrollEnabled).toBe(false);
    expect(map().props.onResponderTerminationRequest()).toBe(false);
    fireEvent(map(), 'responderTerminate', { nativeEvent: { touches: [] } });
    expect(page.props.scrollEnabled).toBe(true);
    expect(mockRouter.push).not.toHaveBeenCalled();

    // Back to the whole region: the page scrolls under a finger again.
    fireEvent.press(screen.getByRole('button', { name: 'Show the whole region' }));
    fireEvent(map(), 'responderGrant', touch(100, 100));
    expect(page.props.scrollEnabled).toBe(true);
    fireEvent(map(), 'responderTerminate', { nativeEvent: { touches: [] } });
  });

  it('names a place a finger is held on, and opens it from there', async () => {
    mockApi(routes());
    render();
    await screen.findByText('3 public binders in Americas (North)');
    await layOutMap();
    const map = screen.getByTestId('region-map');
    expect(screen.queryByTestId('region-map-callout')).toBeNull();

    const quebec = await pointOf('americas-north', 'CA-QC');
    fireEvent(map, 'responderGrant', touch(quebec.x, quebec.y));
    const callout = await screen.findByTestId('region-map-callout');
    expect(within(callout).getByTestId('region-map-callout-name')).toHaveTextContent(
      'Quebec, Canada'
    );
    expect(within(callout).getByTestId('region-map-callout-count')).toHaveTextContent(
      '2 public binders'
    );
    expect(screen.getByTestId('map-named-CA-QC')).toBeOnTheScreen();
    // Lifting the finger opens nothing: the name stays, with a way in and a way out.
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('region-map-callout')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Open Quebec, Canada' }));
    expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('americas-north', 'CA-QC'));
    expect(screen.queryByTestId('region-map-callout')).toBeNull();

    // A finger that moves away before the time is up names nothing; "Close" puts a name away.
    mockRouter.push.mockClear();
    const wyoming = await pointOf('americas-north', 'US-WY');
    fireEvent(map, 'responderGrant', touch(wyoming.x, wyoming.y));
    fireEvent(map, 'responderMove', touch(wyoming.x + 40, wyoming.y));
    await act(() => new Promise((resolve) => setTimeout(resolve, HOLD_MS + 80)));
    expect(screen.queryByTestId('region-map-callout')).toBeNull();
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    fireEvent(map, 'responderGrant', touch(wyoming.x, wyoming.y));
    expect(await screen.findByTestId('region-map-callout-name')).toHaveTextContent(
      'Wyoming, United States'
    );
    expect(screen.getByTestId('region-map-callout-count')).toHaveTextContent('No public binders');
    fireEvent(map, 'responderRelease', { nativeEvent: { touches: [] } });
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('region-map-callout')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('marks a place with binders that is too small to be seen, until it is zoomed in', async () => {
    mockApi(
      routes({
        'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })),
        [COUNTS]: ok(
          binderCountsFixture({
            region: 'europe',
            total: 2,
            subdivisions: [
              { code: 'FR-IDF', binderCount: 1 },
              { code: 'ES-MD', binderCount: 1 },
            ],
          })
        ),
      })
    );
    render();
    await screen.findByText('2 public binders in Europe');
    await layOutMap();
    // The Paris region is a few points wide at the first view of Europe: a dot stands for it.
    const mark = await screen.findByTestId('map-mark-FR-IDF');
    const outline = await loadRegionOutline('europe');
    const window = baseWindow(outline, FRAME);
    const unit = window.width / FRAME.width;
    expect(mark.props.r).toBeCloseTo(5 * unit, 3);
    expect(colourOf(mark.props.fill)).toBe(lightPalette.primary);
    expect(colourOf(mark.props.stroke)).toBe(lightPalette.onPrimaryContainer);
    // One binder: the dot has the tint of the legend's "1", not the solid colour of "10+", over
    // the land's own colour (nothing under the dot shows through it).
    expect(mark.props.fillOpacity).toBe(0.28);
    const land = screen.getByTestId('map-mark-land-FR-IDF');
    expect(colourOf(land.props.fill)).toBe(lightPalette.surface);
    expect(land.props.fillOpacity ?? 1).toBe(1);
    expect(land.props.r).toBe(mark.props.r);
    expect(land.props.cx).toBe(mark.props.cx);
    expect(land.props.cy).toBe(mark.props.cy);
    const [left = 0, top = 0, right = 0, bottom = 0] =
      outline.shapes.find((shape) => shape.code === 'FR-IDF')?.box ?? [];
    expect((right - left) / unit).toBeLessThan(14);
    expect(mark.props.cx).toBeCloseTo((left + right) / 2, 3);
    expect(mark.props.cy).toBeCloseTo((top + bottom) / 2, 3);

    // A tap on the dot opens that place, even where the dot overflows onto its neighbours.
    const centre = await pointOf('europe', 'FR-IDF');
    tap(centre.x + 7, centre.y + 6);
    expect(mockRouter.push).toHaveBeenLastCalledWith(placeRoute('europe', 'FR-IDF'));

    // Zoomed in, the place is drawn large enough: the dot goes.
    for (let press = 0; press < 4; press++) {
      fireEvent.press(screen.getByRole('button', { name: 'Zoom in' }));
    }
    expect(screen.queryByTestId('map-mark-FR-IDF')).toBeNull();
    expect(screen.getByTestId('map-shape-FR-IDF')).toBeOnTheScreen();
  });

  it.each([
    [3, '2–4', 0.48],
    [7, '5–9', 0.68],
    [12, '10+', 0.88],
  ])(
    'tints the dot of a small place by its count: %i binders, the legend step “%s”',
    async (binderCount, _step, opacity) => {
      mockApi(
        routes({
          'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })),
          [COUNTS]: ok(
            binderCountsFixture({
              region: 'europe',
              total: binderCount,
              subdivisions: [{ code: 'FR-IDF', binderCount }],
            })
          ),
        })
      );
      render();
      await screen.findByText(`${binderCount} public binders in Europe`);
      await layOutMap();
      const mark = await screen.findByTestId('map-mark-FR-IDF');
      expect(mark.props.fillOpacity).toBe(opacity);
      // The same tint as the place itself has under the dot.
      expect(screen.getByTestId('map-shape-FR-IDF').props.fillOpacity).toBe(opacity);
    }
  );

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

    // A place opens in the region on screen, not in the collector's own: from the map...
    const brittany = await pointOf('europe', 'FR-BRE');
    tap(brittany.x, brittany.y);
    expect(mockRouter.push).toHaveBeenLastCalledWith(placeRoute('europe', 'FR-BRE'));
    expect(await screen.findByTestId('map-selected-FR-BRE')).toBeOnTheScreen();
    // ... and from the list.
    fireEvent.press(screen.getByRole('tab', { name: 'List' }));
    fireEvent.press(await screen.findByRole('link', { name: /^Vatican City/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(placeRoute('europe', 'VA'));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByRole('link', { name: /^Brittany/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith(placeRoute('europe', 'FR-BRE'));

    // Back home, the place outlined in Europe is not outlined here.
    fireEvent.press(screen.getByRole('tab', { name: 'Map' }));
    await layOutMap();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Americas (North)' }));
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(await screen.findByTestId('map-shape-CA-QC')).toBeOnTheScreen();
    expect(screen.queryByTestId(/^map-selected-/)).toBeNull();
    // And it is outlined again when the collector returns to its region.
    fireEvent.press(screen.getByTestId('map-region'));
    fireEvent.press(screen.getByTestId('map-region-option-europe'));
    expect(await screen.findByTestId('map-selected-FR-BRE')).toBeOnTheScreen();
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
    const api = mockApi(routes({ 'GET /api/v1/me': ok(NO_LOCATION) }));
    render();
    fireEvent.press(await screen.findByTestId('map-choose-location'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
    expect(screen.getByTestId('map-location-prompt')).toHaveTextContent(/Where are you\?/);
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(api.callsTo(COUNTS).map((call) => call.path)).toEqual([
      '/api/v1/regions/americas-north/binder-counts',
    ]);

    // The prompt can be put away for the visit (it took the map's place on a phone).
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('map-location-prompt')).toBeNull();
    expect(screen.queryByTestId('map-choose-location')).toBeNull();
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (North)');
  });

  it('asks nothing in Americas (North) first when the device kept another region for a collector without a location', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    const api = mockApi(
      routes({
        'GET /api/v1/me': ok(NO_LOCATION),
        [COUNTS]: ok(
          binderCountsFixture({
            region: 'americas-south',
            total: 1,
            subdivisions: [{ code: 'UY-MO', binderCount: 1 }],
          })
        ),
      })
    );
    render();
    expect(await screen.findByText('1 public binder in Americas (South)')).toBeOnTheScreen();
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (South)');
    // The region was settled before anything was asked: one request, in the kept region.
    expect(api.callsTo(COUNTS).map((call) => call.path)).toEqual([
      '/api/v1/regions/americas-south/binder-counts',
    ]);
  });

  it('opens on a region and a state from a link, and again when the same link is opened again', async () => {
    mockParams.current = { region: 'europe', subdivision: 'fr-bre' };
    const api = mockApi(routes());
    const view = render();
    await waitFor(() =>
      expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Europe')
    );
    // The link is used up: its parameters are cleared on the tab's own route ...
    await waitFor(() => expect(mockRouter.setParams).toHaveBeenCalledTimes(1));
    expect(mockRouter.setParams).toHaveBeenCalledWith({
      region: undefined,
      subdivision: undefined,
    });
    // ... and its place opens only once they are gone. (On the web the tab's history entry is
    // rewritten without the link first: opened at once, "back" from the place came back to the
    // link, which opened the place again.)
    view.rerender(<MapScreen />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockRouter.push).not.toHaveBeenCalled();
    mockParams.current = {};
    view.rerender(<MapScreen />);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('europe', 'FR-BRE'))
    );
    expect(api.callsTo(COUNTS).at(-1)?.path).toBe('/api/v1/regions/europe/binder-counts');
    await layOutMap();
    expect(screen.getByTestId('map-selected-FR-BRE')).toBeOnTheScreen();
    // Rendering again does not open it twice.
    view.rerender(<MapScreen />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.setParams).toHaveBeenCalledTimes(1);

    // The collector goes back to their own region.
    fireEvent.press(screen.getByRole('button', { name: 'Back to Americas (North)' }));
    await waitFor(() =>
      expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (North)')
    );

    // The same link, tapped a second time in the session: it works again.
    mockParams.current = { region: 'europe', subdivision: 'fr-bre' };
    view.rerender(<MapScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Europe')
    );
    await waitFor(() => expect(mockRouter.setParams).toHaveBeenCalledTimes(2));
    mockParams.current = {};
    view.rerender(<MapScreen />);
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(2));
    expect(mockRouter.push).toHaveBeenLastCalledWith(placeRoute('europe', 'FR-BRE'));
  });

  it('opens a state of the browsed region from a link that names no region', async () => {
    mockParams.current = { subdivision: 'CA-QC' };
    mockApi(routes());
    const view = render();
    await waitFor(() => expect(mockRouter.setParams).toHaveBeenCalledTimes(1));
    mockParams.current = {};
    view.rerender(<MapScreen />);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(placeRoute('americas-north', 'CA-QC'))
    );
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (North)');
  });

  it('ignores a link that names no region or place the app could ask for', async () => {
    mockParams.current = { region: 'Montréal 45.5,-73.6', subdivision: 'not a code' };
    const api = mockApi(routes());
    render();
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(api.callsTo(COUNTS).every((call) => call.path.includes('/americas-north/'))).toBe(true);
    // Used up all the same: it does not wait in the address for a later visit.
    expect(mockRouter.setParams).toHaveBeenCalledWith({
      region: undefined,
      subdivision: undefined,
    });
  });

  it('stays in the current region when a link names a region that does not exist', async () => {
    // Well formed, and nothing the server lists: `GET /regions/asia/binder-counts` is a 404.
    mockParams.current = { region: 'asia', subdivision: 'JP-13' };
    const api = mockApi(
      routes({
        [COUNTS]: (request) =>
          request.path.includes('/americas-north/')
            ? ok(binderCountsFixture())
            : problem(404, 'NOT_FOUND', 'No such region'),
      })
    );
    render();
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    // The server's list says whether the region exists: the link waits for it, then is dropped.
    await waitFor(() =>
      expect(mockRouter.setParams).toHaveBeenCalledWith({
        region: undefined,
        subdivision: undefined,
      })
    );
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (North)');
    expect(screen.getByRole('button', { name: 'Region: Americas (North)' })).toBeOnTheScreen();
    expect(screen.queryByTestId('map-region-away')).toBeNull();
    expect(screen.queryByTestId('map-counts-error')).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(api.callsTo(COUNTS).map((call) => call.path)).toEqual([
      '/api/v1/regions/americas-north/binder-counts',
    ]);
    // Nothing of it is kept for the session or on the device.
    expect(useBrowsingRegionStore.getState()).toMatchObject({ picked: null, stored: null });
    expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBeNull();
  });

  it('forgets a region the device kept once the server does not list it, and shows the default one', async () => {
    // A collector without a location whose device holds a region taken down since (or written by
    // an older version): they must not start there on every launch.
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'oceania');
    const api = mockApi(
      routes({
        'GET /api/v1/me': ok(NO_LOCATION),
        [COUNTS]: (request) =>
          request.path.includes('/americas-north/')
            ? ok(binderCountsFixture())
            : problem(404, 'NOT_FOUND', 'No such region'),
      })
    );
    render();
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    expect(screen.getByTestId('map-title')).toHaveTextContent('Binders in Americas (North)');
    expect(screen.getByRole('button', { name: 'Region: Americas (North)' })).toBeOnTheScreen();
    expect(screen.queryByTestId('map-counts-error')).toBeNull();
    expect(api.callsTo(COUNTS).map((call) => call.path)).toEqual([
      '/api/v1/regions/americas-north/binder-counts',
    ]);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBeNull()
    );
    expect(useBrowsingRegionStore.getState().stored).toBeNull();
    // The list is the list of that region, not a skeleton that never ends.
    fireEvent.press(screen.getByRole('tab', { name: 'List' }));
    expect(await screen.findByRole('link', { name: 'Quebec, 2 public binders' })).toBeOnTheScreen();
    expect(screen.queryByTestId('place-list-loading')).toBeNull();
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

  it('starts another region at the top of its list, and gives the list to the tab to scroll back up', async () => {
    mockApi(routes());
    render();
    await openList();
    await screen.findByRole('link', { name: /Quebec/ });
    // The tab scrolls this list to its top when it is pressed again (`useScrollToTop`).
    const list = mockScrollToTopRefs.at(-1)?.current as {
      getScrollResponder: () => { scrollTo: jest.Mock } | undefined;
    };
    const scrollTo = jest.fn();
    jest.spyOn(list, 'getScrollResponder').mockReturnValue({ scrollTo });

    // Deep in Americas (North), the collector switches to Europe: the list starts over at its
    // top, where the region's name, the switcher and the filter are.
    fireEvent.press(screen.getByTestId('map-region'));
    fireEvent.press(screen.getByTestId('map-region-option-europe'));
    expect(await screen.findByRole('link', { name: /^Brittany/ })).toBeOnTheScreen();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    // Not on every render: typing in the filter leaves the list where it is.
    fireEvent.changeText(screen.getByLabelText('Find a state or province'), 'britt');
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('says a region has no place instead of loading for ever when the server lists none for it', async () => {
    // The collector's home region is not in the list the server sent (it should never happen):
    // the list ends in an empty state.
    const regions = regionsFixture();
    regions.regions = regions.regions.filter((region) => region.code !== 'americas-north');
    mockApi(routes({ 'GET /api/v1/regions': ok(regions) }));
    render();
    await openList();
    expect(await screen.findByTestId('place-list-empty')).toHaveTextContent(
      'No state or province in this region.'
    );
    expect(screen.queryByTestId('place-list-loading')).toBeNull();
  });

  it('shows the skeleton only while the places are still loading', () => {
    const props = {
      counts: new Map<string, number>(),
      countsKnown: false,
      error: null,
      onRetry: jest.fn(),
      selected: null,
      onPick: jest.fn(),
      header: <></>,
    };
    const view = renderWithProviders(<PlaceList region={null} loaded={false} {...props} />);
    expect(screen.getByTestId('place-list-loading')).toBeOnTheScreen();
    view.rerender(<PlaceList region={null} loaded {...props} />);
    expect(screen.queryByTestId('place-list-loading')).toBeNull();
    expect(screen.getByTestId('place-list-empty')).toBeOnTheScreen();
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

  it('never assumes a screen reader on the web, where a browser cannot tell: the map stays the first view', async () => {
    // react-native-web answers "yes" to everyone: the list would be the first view of every
    // visitor of the web build.
    const enabled = jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const platform = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      mockApi(routes());
      render();
      await screen.findByText('3 public binders in Americas (North)');
      expect(screen.getByRole('tab', { name: 'Map' })).toBeSelected();
      expect(screen.getByTestId('map-scroll')).toBeOnTheScreen();
      expect(screen.queryByTestId('place-list')).toBeNull();
      expect(enabled).not.toHaveBeenCalled();
    } finally {
      platform.restore();
      enabled.mockRestore();
    }
  });
});
