import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { useState } from 'react';

import LocationSettingsScreen from '@/app/settings/location';
import type { MyLocationResponse } from '@/src/api/types';
import { TradingAreaPicker } from '@/src/features/location/TradingAreaPicker';
import { draftFromLocation, type AreaDraft } from '@/src/features/location/tradingArea';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { locationFixture } from '../support/fixtures';
import { mockApi, ok, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/features/location/deviceLocation', () => ({ readApproximatePosition: jest.fn() }));

// The map module of this file can be told to fail, to exercise the map's error state.
let mockMapFails = false;
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    if (mockMapFails) {
      throw new Error('Map module unavailable');
    }
    return React.createElement(View, { ...props, ref, testID: 'mock-map-view' });
  });
  MockMapView.displayName = 'MockMapView';
  const MockMarker = (props: Record<string, unknown>) => React.createElement(View, props);
  const MockCircle = (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: 'mock-map-circle' });
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Circle: MockCircle,
    PROVIDER_DEFAULT: undefined,
  };
});

const deviceMock = () =>
  (
    jest.requireMock('@/src/features/location/deviceLocation') as {
      readApproximatePosition: jest.Mock;
    }
  ).readApproximatePosition;

const mapView = () => screen.getByTestId('mock-map-view');
const tapMap = (latitude: number, longitude: number) =>
  fireEvent(mapView(), 'press', { nativeEvent: { coordinate: { latitude, longitude } } });

const echoTradingArea = ({ body }: MockRequest) => {
  const area = body as { lat: number; lng: number; radiusKm: number; source: 'MANUAL' | 'DEVICE' };
  return ok(
    locationFixture({ tradingArea: { ...area, label: 'Ahuntsic-Cartierville, Montréal' } })
  );
};

/** The picker alone, with the draft kept in a parent like onboarding does. */
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
  mockMapFails = false;
  resetRouterMock();
  resetAppState();
  deviceMock().mockReset();
});

describe('Trading-area picker map (same mechanism as the web picker)', () => {
  it('saves a centre tapped on the map, rounded to 3 decimals, as MANUAL', async () => {
    const api = mockApi(
      signedInRoutes({ 'PUT /api/v1/me/location/trading-area': echoTradingArea })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Montréal city centre.'
    );
    expect(screen.getByRole('button', { name: 'Save trading area' })).toBeDisabled();
    // The saved, hand-picked centre is drawn with its radius.
    expect(screen.getByTestId('trading-area-pin').props.coordinate).toEqual({
      latitude: 45.502,
      longitude: -73.567,
    });
    expect(screen.getByTestId('mock-map-circle').props.radius).toBe(10_000);

    tapMap(45.5612345, -73.6409876);
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: the point you chose on the map.'
    );
    expect(screen.getByTestId('trading-area-pin').props.coordinate).toEqual({
      latitude: 45.561,
      longitude: -73.641,
    });
    fireEvent.press(screen.getByRole('button', { name: 'Save trading area' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Trading area saved · Ahuntsic-Cartierville, Montréal.'
    );
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 45.561,
      lng: -73.641,
      radiusKm: 10,
      source: 'MANUAL',
    });
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: your saved point near Ahuntsic-Cartierville, Montréal.'
    );
    // No coordinate is ever rendered as text.
    expect(screen.queryByText(/\d+\.\d{2,}/)).toBeNull();
  });

  it('moves the centre when the pin is dragged', async () => {
    const api = mockApi(
      signedInRoutes({ 'PUT /api/v1/me/location/trading-area': echoTradingArea })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    const pin = await screen.findByTestId('trading-area-pin');
    expect(pin.props.draggable).toBe(true);
    fireEvent(pin, 'dragEnd', {
      nativeEvent: { coordinate: { latitude: 45.4709999, longitude: -73.5800001 } },
    });
    fireEvent.press(screen.getByRole('button', { name: 'Save trading area' }));
    await screen.findByTestId('snackbar');
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 45.471,
      lng: -73.58,
      radiusKm: 10,
      source: 'MANUAL',
    });
  });

  it('uses the map centre after the collector pans the map', async () => {
    renderWithProviders(<Harness location={undefined} />, {
      port: new FakeAuthPort(testUser()),
    });
    expect(screen.getByTestId('area-public-label')).toHaveTextContent('No trading area saved yet.');
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Montréal city centre.'
    );
    expect(screen.getByTestId('area-radius-value')).toHaveTextContent('5 km');
    fireEvent(mapView(), 'regionChangeComplete', {
      latitude: 45.6012345,
      longitude: -73.4012345,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    });
    // Panning alone changes nothing; "Use map centre" picks the viewport centre.
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Montréal city centre.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Use map centre' }));
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: the point you chose on the map.'
    );
    expect(screen.getByTestId('trading-area-pin').props.coordinate).toEqual({
      latitude: 45.601,
      longitude: -73.401,
    });
  });

  it('jumps to a city with its suggested radius, like the web', async () => {
    renderWithProviders(<Harness location={undefined} />, {
      port: new FakeAuthPort(testUser()),
    });
    expect(screen.getByTestId('area-city-quebec')).not.toBeSelected();
    expect(screen.getByTestId('area-city-montreal')).toBeSelected();
    fireEvent.press(screen.getByRole('button', { name: 'Québec' }));
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Québec city centre.'
    );
    expect(screen.getByTestId('area-radius-value')).toHaveTextContent('15 km');
    expect(screen.getByTestId('trading-area-pin').props.coordinate).toEqual({
      latitude: 46.813,
      longitude: -71.208,
    });
    expect(screen.getByTestId('mock-map-circle').props.radius).toBe(15_000);
    expect(screen.getByTestId('area-city-quebec')).toBeSelected();
    expect(screen.getByTestId('area-city-montreal')).not.toBeSelected();
    // The radius stepper still adjusts it.
    fireEvent.press(screen.getByRole('button', { name: 'Increase trading radius' }));
    expect(screen.getByTestId('area-radius-value')).toHaveTextContent('20 km');
    expect(screen.getByTestId('mock-map-circle').props.radius).toBe(20_000);
  });

  it('never draws a device-derived centre as a point', async () => {
    const device = locationFixture({
      tradingArea: {
        lat: 45.537,
        lng: -73.618,
        radiusKm: 3,
        source: 'DEVICE',
        label: 'Rosemont, Montréal',
      },
    });
    renderWithProviders(<Harness location={device} />, { port: new FakeAuthPort(testUser()) });
    expect(screen.queryByTestId('trading-area-pin')).toBeNull();
    expect(screen.queryByTestId('mock-map-circle')).toBeNull();
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      /Centre: your device location, snapped by OrenjiTrade\./
    );
    // The camera looks at the neighbourhood (2 decimals), not at the saved centre.
    const region = mapView().props.initialRegion as { latitude: number; longitude: number };
    expect(region.latitude).toBe(45.54);
    expect(region.longitude).toBe(-73.62);
    // Picking by hand replaces it.
    tapMap(45.55, -73.6);
    expect(screen.getByTestId('trading-area-pin')).toBeOnTheScreen();
  });

  it('ignores taps while disabled', async () => {
    renderWithProviders(<Harness location={locationFixture()} disabled />, {
      port: new FakeAuthPort(testUser()),
    });
    tapMap(45.6, -73.7);
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Montréal city centre.'
    );
    expect(screen.getByTestId('trading-area-pin').props.draggable).toBe(false);
    expect(screen.getByRole('button', { name: 'Use map centre' })).toBeDisabled();
  });

  it('shows a loading skeleton until the map is ready', async () => {
    renderWithProviders(<Harness location={locationFixture()} />, {
      port: new FakeAuthPort(testUser()),
    });
    expect(screen.getByTestId('trading-area-map-loading')).toBeOnTheScreen();
    act(() => {
      fireEvent(mapView(), 'mapReady');
    });
    expect(screen.queryByTestId('trading-area-map-loading')).toBeNull();
  });

  it('falls back to an error state with retry when the map cannot load', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockMapFails = true;
    renderWithProviders(<Harness location={locationFixture()} />, {
      port: new FakeAuthPort(testUser()),
    });
    const failure = await screen.findByTestId('trading-area-map-error');
    expect(within(failure).getByText('The map could not load')).toBeOnTheScreen();
    // The rest of the picker keeps working.
    fireEvent.press(screen.getByRole('button', { name: 'Laval' }));
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Laval city centre.'
    );

    mockMapFails = false;
    fireEvent.press(within(failure).getByRole('button', { name: 'Reload map' }));
    await waitFor(() =>
      expect(screen.queryByTestId('trading-area-map-error')).not.toBeOnTheScreen()
    );
    expect(mapView()).toBeOnTheScreen();
    expect(screen.getByTestId('trading-area-pin').props.coordinate).toEqual({
      latitude: 45.606,
      longitude: -73.712,
    });
    warn.mockRestore();
    error.mockRestore();
  });

  it('sends the device location straight to the API and reports the generic label plainly', async () => {
    deviceMock().mockResolvedValue({ status: 'ok', lat: 45.537, lng: -73.618 });
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/location/trading-area': ({ body }: MockRequest) =>
          ok(
            locationFixture({
              tradingArea: {
                ...(body as { lat: number; lng: number; radiusKm: number }),
                source: 'DEVICE',
                label: 'Approximate area',
              },
            })
          ),
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByTestId('area-device-message')).toHaveTextContent(
      /Trading area set from your approximate location\./
    );
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 45.537,
      lng: -73.618,
      radiusKm: 10,
      source: 'DEVICE',
    });
    // The device position is never drawn.
    await waitFor(() => expect(screen.queryByTestId('trading-area-pin')).not.toBeOnTheScreen());
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(/your device location/);
    expect(screen.queryByText(/near Approximate area/)).toBeNull();
  });
});
