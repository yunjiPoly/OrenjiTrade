import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Linking } from 'react-native';

import LocationSettingsScreen from '@/app/settings/location';
import type { MyLocationResponse } from '@/src/api/types';
import { TradingAreaPicker } from '@/src/features/location/TradingAreaPicker';
import { PAGE_BASE_URL, shouldStartLoad } from '@/src/components/map/leaflet/webViewNavigation';
import { MAP_READY_TIMEOUT_MS } from '@/src/features/location/TradingAreaMapLeaflet';
import { draftFromLocation, type AreaDraft } from '@/src/features/location/tradingArea';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { locationFixture } from '../support/fixtures';
import { mockApi, ok, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * The trading-area picker with the Leaflet + OpenStreetMap WebView map: the engine on Android in
 * Expo Go or without the project's Google Maps key (src/components/map/mapEngine.ts).
 */
jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/features/location/deviceLocation', () => ({ readApproximatePosition: jest.fn() }));
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => 'leaflet' }));

const inject = () =>
  (jest.requireMock('react-native-webview') as { mockInjectJavaScript: jest.Mock })
    .mockInjectJavaScript;

const webView = () => screen.getByTestId('trading-area-map-webview');
const send = (message: unknown) =>
  act(() => {
    fireEvent(webView(), 'message', { nativeEvent: { data: JSON.stringify(message) } });
  });
/** The `apply` payloads injected so far (what the page draws). */
const applied = () =>
  inject()
    .mock.calls.map(([script]: [string]) => /window\.__orenji\.apply\((.*)\);true;$/.exec(script))
    .filter((match: RegExpExecArray | null): match is RegExpExecArray => match !== null)
    .map((match: RegExpExecArray) => JSON.parse(match[1] ?? 'null'));
const focused = () =>
  inject()
    .mock.calls.map(([script]: [string]) => /window\.__orenji\.focus\((.*)\);true;$/.exec(script))
    .filter((match: RegExpExecArray | null): match is RegExpExecArray => match !== null)
    .map((match: RegExpExecArray) => JSON.parse(match[1] ?? 'null'));

const echoTradingArea = ({ body }: MockRequest) => {
  const area = body as { lat: number; lng: number; radiusKm: number; source: 'MANUAL' | 'DEVICE' };
  return ok(locationFixture({ tradingArea: { ...area, label: 'Limoilou, Québec' } }));
};

function Harness({
  location,
  disabled,
}: {
  location: MyLocationResponse | undefined;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<AreaDraft>(() => draftFromLocation(location));
  return (
    <TradingAreaPicker value={draft} onChange={setDraft} location={location} disabled={disabled} />
  );
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  inject().mockReset();
});

describe('Trading-area picker on the Leaflet WebView map (Android in Expo Go)', () => {
  it('loads the pinned Leaflet page and draws the chosen centre once it is ready', async () => {
    renderWithProviders(<Harness location={locationFixture()} />, {
      port: new FakeAuthPort(testUser()),
    });
    expect(screen.getByTestId('trading-area-map-loading')).toBeOnTheScreen();
    const source = webView().props.source as { html: string; baseUrl: string };
    expect(source.baseUrl).toBe(PAGE_BASE_URL);
    expect(source.html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(webView().props.geolocationEnabled).toBe(false);
    expect(inject()).not.toHaveBeenCalled();

    send({ type: 'ready' });
    expect(screen.queryByTestId('trading-area-map-loading')).toBeNull();
    expect(applied()).toEqual([
      { area: { lat: 45.502, lng: -73.567, radiusKm: 10 }, disabled: false },
    ]);
  });

  it('saves a centre tapped on the map, rounded to 3 decimals, as MANUAL', async () => {
    const api = mockApi(
      signedInRoutes({ 'PUT /api/v1/me/location/trading-area': echoTradingArea })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    await screen.findByTestId('trading-area-map-webview');
    send({ type: 'ready' });
    send({ type: 'pick', lat: 46.8261234, lng: -71.2345678 });
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: the point you chose on the map.'
    );
    expect(applied().at(-1)).toEqual({
      area: { lat: 46.826, lng: -71.235, radiusKm: 10 },
      disabled: false,
    });
    fireEvent.press(screen.getByRole('button', { name: 'Save trading area' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Trading area saved · Limoilou, Québec.'
    );
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 46.826,
      lng: -71.235,
      radiusKm: 10,
      source: 'MANUAL',
    });
  });

  it('moves the camera to a city and uses the map centre after a pan', async () => {
    renderWithProviders(<Harness location={undefined} />, {
      port: new FakeAuthPort(testUser()),
    });
    send({ type: 'ready' });
    fireEvent.press(screen.getByRole('button', { name: 'Québec' }));
    expect(focused().at(-1)).toEqual({ lat: 46.813, lng: -71.208, radiusKm: 15 });
    expect(applied().at(-1)).toEqual({
      area: { lat: 46.813, lng: -71.208, radiusKm: 15 },
      disabled: false,
    });
    send({ type: 'viewport', lat: 46.8501234, lng: -71.3009876 });
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Québec city centre.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Use map centre' }));
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: the point you chose on the map.'
    );
    expect(applied().at(-1)).toEqual({
      area: { lat: 46.85, lng: -71.301, radiusKm: 15 },
      disabled: false,
    });
  });

  it('never draws a device-derived centre and starts on its 2-decimal neighbourhood', async () => {
    const device = locationFixture({
      tradingArea: { lat: 45.537, lng: -73.618, radiusKm: 3, source: 'DEVICE', label: 'Rosemont' },
    });
    renderWithProviders(<Harness location={device} />, { port: new FakeAuthPort(testUser()) });
    const html = (webView().props.source as { html: string }).html;
    expect(html).toContain('"focus":{"lat":45.54,"lng":-73.62,"radiusKm":3}');
    expect(html).not.toContain('45.537');
    send({ type: 'ready' });
    expect(applied()).toEqual([{ area: null, disabled: false }]);
  });

  it('ignores picks while disabled and tells the page', async () => {
    renderWithProviders(<Harness location={locationFixture()} disabled />, {
      port: new FakeAuthPort(testUser()),
    });
    send({ type: 'ready' });
    expect(applied().at(-1)).toMatchObject({ disabled: true });
    send({ type: 'pick', lat: 45.6, lng: -73.7 });
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Montréal city centre.'
    );
  });

  it('ignores malformed or out-of-range messages', async () => {
    renderWithProviders(<Harness location={locationFixture()} />, {
      port: new FakeAuthPort(testUser()),
    });
    send({ type: 'ready' });
    act(() => {
      fireEvent(webView(), 'message', { nativeEvent: { data: 'not json' } });
    });
    send({ type: 'pick', lat: 123, lng: -73.7 });
    send({ type: 'pick', lat: '45.6', lng: -73.7 });
    send({ type: 'unknown' });
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Montréal city centre.'
    );
  });

  it('shows the error state when Leaflet cannot load, and reloads the page on retry', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderWithProviders(<Harness location={locationFixture()} />, {
      port: new FakeAuthPort(testUser()),
    });
    send({ type: 'error', reason: 'leaflet' });
    const failure = screen.getByTestId('trading-area-map-error');
    expect(within(failure).getByText('The map could not load')).toBeOnTheScreen();
    // The quick picks keep working.
    fireEvent.press(screen.getByRole('button', { name: 'Laval' }));
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Laval city centre.'
    );
    fireEvent.press(within(failure).getByRole('button', { name: 'Reload map' }));
    expect(screen.getByTestId('trading-area-map-loading')).toBeOnTheScreen();
    // The new page starts on the current centre.
    expect((webView().props.source as { html: string }).html).toContain(
      '"focus":{"lat":45.606,"lng":-73.712'
    );
    send({ type: 'ready' });
    await waitFor(() => expect(screen.queryByTestId('trading-area-map-loading')).toBeNull());
    expect(applied().at(-1)).toEqual({
      area: { lat: 45.606, lng: -73.712, radiusKm: 10 },
      disabled: false,
    });
    warn.mockRestore();
  });

  it('gives up waiting for the page after a timeout', async () => {
    jest.useFakeTimers();
    try {
      renderWithProviders(<Harness location={locationFixture()} />, {
        port: new FakeAuthPort(testUser()),
      });
      expect(screen.getByTestId('trading-area-map-loading')).toBeOnTheScreen();
      act(() => {
        jest.advanceTimersByTime(MAP_READY_TIMEOUT_MS + 1);
      });
      expect(screen.getByTestId('trading-area-map-error')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('WebView navigation', () => {
  it('keeps the page and opens links (the OpenStreetMap credit) in the browser', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    expect(shouldStartLoad({ url: PAGE_BASE_URL, isTopFrame: true })).toBe(true);
    expect(shouldStartLoad({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(
      shouldStartLoad({ url: 'https://www.openstreetmap.org/copyright', isTopFrame: true })
    ).toBe(false);
    expect(open).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright');
    expect(shouldStartLoad({ url: 'javascript:alert(1)', isTopFrame: true })).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });
});
