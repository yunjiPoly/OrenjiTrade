import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { meKeys } from '@/src/api/queryKeys';
import { RegionBar } from '@/src/features/regions/RegionBar';
import {
  BROWSING_REGION_STORAGE_KEY,
  browsingScope,
  hydrateBrowsingRegion,
  pickBrowsingRegion,
  resolveBrowsingRegion,
  useBrowsingRegion,
  useBrowsingRegionStore,
} from '@/src/features/regions/browsingRegion';
import { isRegionCode, regionPhrase } from '@/src/lib/place';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { meFixture, regionsFixture } from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { createTestQueryClient, renderWithProviders, resetAppState } from '../test-utils';

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(async () => {
  resetAppState();
  await AsyncStorage.clear();
});

/** What a screen reads from the browsed region, as text. */
function Probe() {
  const { region, home, away, ready } = useBrowsingRegion();
  return (
    <>
      <RegionBar testID="switcher" />
      <Text testID="probe">{`${region}|${home ?? 'none'}|${away ? 'away' : 'home'}|${ready ? 'ready' : 'waiting'}`}</Text>
    </>
  );
}

const probe = () => screen.getByTestId('probe');
const signedIn = (uid = 'uid-maika') => new FakeAuthPort(testUser({ uid }));

function pick(region: string) {
  fireEvent.press(screen.getByTestId('switcher'));
  fireEvent.press(screen.getByTestId(`switcher-option-${region}`));
}

describe('which region the app browses (pure)', () => {
  const scope = browsingScope('uid-1', 'europe');

  it('prefers the pick of this session, then the home region, then the device, then Americas (North)', () => {
    const picked = { region: 'americas-south', scope };
    expect(resolveBrowsingRegion({ picked, scope, home: 'europe', stored: 'europe' })).toBe(
      'americas-south'
    );
    expect(
      resolveBrowsingRegion({ picked: null, scope, home: 'europe', stored: 'americas-south' })
    ).toBe('europe');
    expect(
      resolveBrowsingRegion({ picked: null, scope, home: null, stored: 'americas-south' })
    ).toBe('americas-south');
    expect(resolveBrowsingRegion({ picked: null, scope, home: null, stored: null })).toBe(
      'americas-north'
    );
  });

  it('drops a pick made under another account or another home region', () => {
    const picked = { region: 'americas-south', scope };
    const elsewhere = browsingScope('uid-1', 'americas-north');
    expect(
      resolveBrowsingRegion({ picked, scope: elsewhere, home: 'americas-north', stored: null })
    ).toBe('americas-north');
    const someoneElse = browsingScope('uid-2', 'europe');
    expect(
      resolveBrowsingRegion({ picked, scope: someoneElse, home: 'europe', stored: null })
    ).toBe('europe');
    expect(browsingScope(null, null)).toBe('|');
  });

  it('accepts well-formed region codes only', () => {
    expect(['americas-north', 'americas-south', 'europe', 'asia'].every(isRegionCode)).toBe(true);
    for (const value of [
      null,
      undefined,
      '',
      'Europe',
      'europe ',
      'eu rope',
      '45.5,-73.6',
      'a'.repeat(33),
    ]) {
      expect(isRegionCode(value)).toBe(false);
    }
  });

  it('says "your region" at home and names another region', () => {
    expect(regionPhrase('europe', 'europe')).toBe('your region');
    expect(regionPhrase('americas-north', null)).toBe('your region');
    expect(regionPhrase('europe', 'americas-north')).toBe('Europe');
    expect(regionPhrase('americas-south', null)).toBe('Americas (South)');
  });
});

describe('the browsed region and its switcher', () => {
  it('starts in the home region of the signed-in collector, whatever the device kept', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('europe|europe|home|ready'));
    expect(screen.getByRole('button', { name: 'Region: Europe' })).toBeOnTheScreen();
    expect(screen.queryByTestId('switcher-away')).toBeNull();
  });

  it('falls back to the last region picked on this device, then to Americas (North)', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    mockApi(signedInRoutes());
    const first = renderWithProviders(<Probe />, { port: signedIn() });
    // Not settled before the device answered: nothing is asked in a region that may change.
    expect(probe()).toHaveTextContent(/\|waiting$/);
    await waitFor(() => expect(probe()).toHaveTextContent('americas-south|none|home|ready'));
    expect(screen.getByRole('button', { name: 'Region: Americas (South)' })).toBeOnTheScreen();
    first.unmount();

    resetAppState();
    await AsyncStorage.clear();
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
  });

  it('offers the three regions in a sheet, marks the home one and keeps the pick on the device', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );

    fireEvent.press(screen.getByRole('button', { name: 'Region: Americas (North)' }));
    const options = screen.getAllByRole('radio');
    expect(options.map((option) => option.props.accessibilityLabel)).toEqual([
      'Americas (North)',
      'Americas (South)',
      'Europe',
    ]);
    expect(screen.getByRole('radio', { name: 'Americas (North)' })).toBeChecked();
    // On screen as a second line, and said after the name by a screen reader.
    expect(screen.getByTestId('switcher-option-americas-north')).toHaveTextContent(/Your region/);
    expect(screen.getByTestId('switcher-option-americas-north').props.accessibilityHint).toBe(
      'Your region'
    );
    expect(screen.getByTestId('switcher-option-europe')).not.toHaveTextContent(/Your region/);
    expect(screen.getByTestId('switcher-option-europe').props.accessibilityHint).toBeUndefined();

    fireEvent.press(screen.getByRole('radio', { name: 'Europe' }));
    await waitFor(() => expect(probe()).toHaveTextContent('europe|americas-north|away|ready'));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBe('europe')
    );

    // Away from home: the switcher says so at a glance and one press goes back.
    expect(screen.getByRole('button', { name: 'Region: Europe' })).toBeOnTheScreen();
    expect(screen.getByTestId('switcher-away')).toHaveTextContent(
      'Not your region.Back to Americas (North)'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Back to Americas (North)' }));
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );
    expect(screen.queryByTestId('switcher-away')).toBeNull();
  });

  it('uses the names of GET /regions once they were read, without asking for them itself', async () => {
    const regions = regionsFixture();
    const europe = regions.regions.find((region) => region.code === 'europe');
    if (europe) {
      europe.name = 'Europe and neighbours';
    }
    const api = mockApi(signedInRoutes({ 'GET /api/v1/regions': ok(regions) }));
    const queryClient = createTestQueryClient();
    renderWithProviders(<Probe />, { port: signedIn(), queryClient });
    await waitFor(() => expect(probe()).toHaveTextContent(/\|ready$/));
    expect(api.callsTo('GET /api/v1/regions')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('switcher'));
    expect(screen.getByRole('radio', { name: 'Europe' })).toBeOnTheScreen();

    act(() => {
      queryClient.setQueryData(['public', 'regions'], regions);
    });
    expect(await screen.findByRole('radio', { name: 'Europe and neighbours' })).toBeOnTheScreen();
  });

  it('comes back to the home region when the collector moves to another region', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    const queryClient = createTestQueryClient();
    renderWithProviders(<Probe />, { port: signedIn(), queryClient });
    await waitFor(() => expect(probe()).toHaveTextContent(/^americas-north\|.*ready$/));
    pick('americas-south');
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-south|americas-north|away|ready')
    );

    // Settings → Location saved a place in Europe: `/me` now names another home region.
    act(() => {
      queryClient.setQueryData(meKeys.account('uid-maika'), meFixture({ homeRegion: 'europe' }));
    });
    await waitFor(() => expect(probe()).toHaveTextContent('europe|europe|home|ready'));
  });

  it('does not carry a pick over to another account on the same device', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    const first = renderWithProviders(<Probe />, { port: signedIn('uid-first') });
    await waitFor(() => expect(probe()).toHaveTextContent(/^americas-north\|.*ready$/));
    pick('europe');
    await waitFor(() => expect(probe()).toHaveTextContent(/^europe\|americas-north\|away/));
    first.unmount();

    renderWithProviders(<Probe />, { port: signedIn('uid-second') });
    await waitFor(() =>
      expect(probe()).toHaveTextContent('americas-north|americas-north|home|ready')
    );
    // The device still remembers the last pick, for an account without a home region.
    expect(useBrowsingRegionStore.getState().stored).toBe('europe');
  });
});

describe('a device storage that fails', () => {
  afterEach(() => {
    storage.getItem.mockClear();
    storage.setItem.mockClear();
  });

  it('browses Americas (North) when the last pick cannot be read', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('storage is unavailable'));
    mockApi(signedInRoutes());
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent('americas-north|none|home|ready'));
    expect(useBrowsingRegionStore.getState()).toMatchObject({ stored: null, hydrated: true });
  });

  it('ignores something else than a region code in the storage', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, '{"lat":45.5}');
    await hydrateBrowsingRegion();
    expect(useBrowsingRegionStore.getState()).toMatchObject({ stored: null, hydrated: true });
  });

  it('keeps a pick for the session when it cannot be written', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('the disk is full'));
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })) }));
    renderWithProviders(<Probe />, { port: signedIn() });
    await waitFor(() => expect(probe()).toHaveTextContent(/^americas-north\|.*ready$/));
    pick('europe');
    await waitFor(() => expect(probe()).toHaveTextContent('europe|americas-north|away|ready'));
    expect(await AsyncStorage.getItem(BROWSING_REGION_STORAGE_KEY)).toBeNull();
    // The failure is swallowed where it happens: the promise of a pick never rejects.
    storage.setItem.mockRejectedValueOnce(new Error('still full'));
    await expect(
      pickBrowsingRegion('americas-south', browsingScope('uid-maika', 'americas-north'))
    ).resolves.toBeUndefined();
  });

  it('refuses to pick something that is not a region code', async () => {
    await pickBrowsingRegion('Somewhere 45.5', '|');
    expect(useBrowsingRegionStore.getState().picked).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalledWith(
      BROWSING_REGION_STORAGE_KEY,
      expect.anything()
    );
  });

  it('a pick made while the device is being read is not overwritten by what it held', async () => {
    await AsyncStorage.setItem(BROWSING_REGION_STORAGE_KEY, 'americas-south');
    const reading = hydrateBrowsingRegion();
    await pickBrowsingRegion('europe', '|');
    await reading;
    expect(useBrowsingRegionStore.getState()).toMatchObject({ stored: 'europe', hydrated: true });
  });
});
